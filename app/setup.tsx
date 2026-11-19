import { dismissKeyboard } from '../lib/dismissKeyboard';
import { useI18n, pluralCategory } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import ScreenHeader from '../components/ScreenHeader';
import { GoldButton, Kicker } from '../components/ui';
import { Minus, Plus } from '../components/icons';
import { useShallow } from 'zustand/react/shallow';
import { useSession } from '../lib/store';
import { useKeyboardLayout, useKeyboardFormPolicy } from '../lib/useKeyboardLayout';
import { keyboardShowing } from '../lib/keyboardGeometry';
import KeyboardViewport from '../components/keyboard/KeyboardViewport';
import { ensureSettingsLoaded, useSettings } from '../lib/settings';
import { bottomActionPadding, colors, column, fonts, radius, sc, screenGutter, touchSlop, useStyles } from '../lib/theme';
import PrivacyConsentDialog from '../components/PrivacyConsentDialog';

const EXAMPLES = [0, 1, 2, 3] as const;

const PRESETS = [
  { label: '5', v: 5 },
  { label: '15', v: 15 },
  { label: '30', v: 30 },
  { label: 'hour', v: 60 },
  { label: '∞', v: 0 },
];

export default function Setup() {
  const { t, language } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  // The screen stays in the stack under the session: without a selector it
  // would re-render on every tick of the timer.
  const s = useSession(
    useShallow((st) => ({
      minutes: st.minutes,
      topic: st.topic,
      setMinutes: st.setMinutes,
      incMinutes: st.incMinutes,
      decMinutes: st.decMinutes,
      setTopic: st.setTopic,
      prepareThreshold: st.prepareThreshold,
    })),
  );
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [coreConsentOpen, setCoreConsentOpen] = useState(false);
  const [entranceReady, setEntranceReady] = useState(false);
  useEffect(() => {
    // A second tap on Home must not land on "Next" in the same spot while
    // the new screen is appearing. The window matches the Stack transition.
    const timer = setTimeout(() => setEntranceReady(true), 350);
    return () => clearTimeout(timer);
  }, []);
  const keyboard = useKeyboardLayout();
  const policy = useKeyboardFormPolicy();
  const editing = keyboardShowing(keyboard);
  // Outside a docked keyboard, the input slot's height is set by an invisible
  // copy of the text. While the keyboard is visible, the copy holds the text
  // as of its opening so typing does not shift the field.
  const [editingStartTopic, setEditingStartTopic] = useState<string | null>(null);
  if (editing && editingStartTopic === null) setEditingStartTopic(s.topic);
  if (!editing && editingStartTopic !== null) setEditingStartTopic(null);
  const hiddenWhileEditing = !policy.actionsVisible ? {
    style: styles.hiddenWhileEditing,
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants' as const,
  } : {};

  const durationUnitFor = (minutes: number) => minutes === 0
    ? t('screens.setup.untimed')
    : t(`screens.minute.${pluralCategory(language, minutes)}`);
  // VoiceOver reads "15 minutes" and "no timer" as one phrase, without the "∞" symbol
  const durationLabel = (minutes: number) =>
    minutes === 0 ? durationUnitFor(0) : `${minutes} ${durationUnitFor(minutes)}`;
  const durationUnit = durationUnitFor(s.minutes);

  const continueToThreshold = () => {
    s.prepareThreshold();
    router.navigate('/threshold');
  };

  const next = async () => {
    if (!entranceReady) return;
    await ensureSettingsLoaded();
    if (useSettings.getState().coreAiConsent === 'undecided') {
      setCoreConsentOpen(true);
      return;
    }
    continueToThreshold();
  };

  const decideCoreConsent = async (decision: 'allowed' | 'denied') => {
    await useSettings.getState().setConsent('core_prayer_ai', decision);
    setCoreConsentOpen(false);
    if (AppState.currentState === 'active') continueToThreshold();
  };

  return (
    <View style={styles.root}>
      <ScreenBg />
      {/* The keyboard dismiss area covers the whole screen, including the
          areas beside the width-limited column on tablets. */}
      <KeyboardViewport>
      <Pressable
        onPress={dismissKeyboard}
        accessible={false}
        style={styles.dismissArea}
      >
        <Animated.View
          entering={FadeIn.duration(450)}
          style={[styles.body, { paddingTop: insets.top + sc(10), paddingBottom: bottomActionPadding(0) }]}
        >
          <ScreenHeader title={t('screens.setup.before')} titleTestID="setup-kicker" backLabel={t('settings.back')} onBack={() => router.back()} />

          <View style={[styles.goal, policy.fillInput && styles.goalDocked]}>
            <View style={styles.goalHeader}>
              <Text style={styles.goalTitle} testID="setup-goal-title">{t('screens.setup.goal')}</Text>
              <Pressable
                onPress={() => setExamplesOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('screens.setup.examples')}
                accessibilityHint={t('screens.setup.openExamples')}
                testID="setup-examples-button"
                hitSlop={8}
                style={({ pressed }) => [styles.helpBtn, pressed && { transform: [{ scale: 0.92 }] }]}
              >
                <Text style={styles.helpBtnLabel}>?</Text>
              </Pressable>
            </View>
            <View style={[styles.topicSlot, policy.fillInput && styles.topicSlotDocked]}>
              <Text
                style={[styles.topicInput, policy.fillInput && styles.topicInputCompact, styles.topicSizer]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {editingStartTopic ?? s.topic}
              </Text>
              <TextInput
                value={s.topic}
                onChangeText={s.setTopic}
                multiline
                // no placeholder: the "Prayer goal" heading and the examples
                // under "?" say enough, and any hint would impose a tone
                style={[styles.topicInput, policy.fillInput && styles.topicInputCompact, styles.topicInputFill]}
                accessibilityLabel={t('screens.setup.goal')}
                accessibilityHint={t('screens.setup.goalHint')}
                testID="setup-goal-input"
                // the goal is one phrase, no line breaks needed: the enter
                // key becomes a blue "Done" that closes the keyboard
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={dismissKeyboard}
              />
            </View>
          </View>

          {/* The footer is unmounted, not hidden: under display: none Android
              squeezes the GoldButton caption to a zero frame and never grows it back. */}
          {!policy.fillInput && <View {...hiddenWhileEditing} style={[styles.lower, hiddenWhileEditing.style]}>
            <View>
              <Kicker style={{ fontSize: sc(11), marginBottom: sc(12), marginHorizontal: 2 }}>
                {t('screens.setup.duration')}
              </Kicker>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    s.decMinutes();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('screens.setup.decreaseDuration')}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    styles.stepBtnLeft,
                    pressed && { backgroundColor: 'rgba(255,255,255,.07)' },
                  ]}
                >
                  <Minus color={colors.white65} />
                </Pressable>
                <View
                  accessible
                  accessibilityLabel={durationLabel(s.minutes)}
                  style={styles.stepValue}
                  testID="setup-duration-value"
                >
                  <Text style={styles.stepBig}>{s.minutes === 0 ? '∞' : s.minutes}</Text>
                  <Text style={styles.stepUnit}>{durationUnit}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    s.incMinutes();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('screens.setup.increaseDuration')}
                  style={({ pressed }) => [
                    styles.stepBtn,
                    styles.stepBtnRight,
                    pressed && { backgroundColor: 'rgba(255,255,255,.07)' },
                  ]}
                >
                  <Plus color={colors.white65} />
                </Pressable>
              </View>
              <View style={styles.presets}>
                {PRESETS.map((p) => {
                  const active = s.minutes === p.v;
                  return (
                    <Pressable
                      key={p.v}
                      testID={`setup-preset-${p.v}`}
                      onPress={() => {
                        Haptics.selectionAsync();
                        s.setMinutes(p.v);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={p.v === 60 ? t('screens.setup.hour') : durationLabel(p.v)}
                      accessibilityState={{ selected: active }}
                      hitSlop={touchSlop(presetHeight())}
                      style={[styles.preset, active && styles.presetActive]}
                    >
                      <Text
                        style={[
                          styles.presetLabel,
                          p.v === 0 && { fontSize: sc(18) },
                          active && { color: colors.amberBright },
                        ]}
                      >
                        {p.v === 60 ? t('screens.setup.hour') : p.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <GoldButton label={t('screens.setup.next')} testID="setup-next-button" disabled={!entranceReady} onPress={() => void next()} />
            </View>
          </View>}
        </Animated.View>
      </Pressable>
      </KeyboardViewport>

      <Modal visible={examplesOpen} transparent animationType="fade" onRequestClose={() => setExamplesOpen(false)}>
        <Pressable accessible={false} style={styles.modalBackdrop} onPress={() => setExamplesOpen(false)}>
          {/* Closes on backdrop tap, Android "back" (onRequestClose) and the
              VoiceOver escape gesture — the backdrop is not focusable for screen readers */}
          <View
            style={[styles.examplesCard, { marginTop: insets.top + sc(92) }]}
            onAccessibilityEscape={() => setExamplesOpen(false)}
          >
            <Kicker style={{ marginBottom: sc(8) }}>{t('screens.setup.examples')}</Kicker>
            {EXAMPLES.map((ex, index) => (
              <Pressable
                key={ex}
                testID={`setup-example-${index}`}
                accessibilityRole="button"
                accessibilityLabel={t(`screens.setup.example${index}`)}
                onPress={() => {
                  s.setTopic(t(`screens.setup.example${index}`));
                  setExamplesOpen(false);
                }}
                style={({ pressed }) => [styles.exampleRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.exampleText}>{t(`screens.setup.example${index}`)}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
      <PrivacyConsentDialog
        visible={coreConsentOpen}
        purpose="core_prayer_ai"
        onDismiss={() => setCoreConsentOpen(false)}
        onDecision={decideCoreConsent}
      />
    </View>
  );
}

const presetHeight = () => sc(30);

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  dismissArea: { flex: 1 },
  body: { flex: 1, paddingHorizontal: screenGutter(), ...column() },
  // the field stretched to the keyboard covers the lower blocks; a long
  // goal shrinks the field slot to the free space so "Next" stays on screen
  goal: { flexShrink: 1, zIndex: 1, marginTop: sc(16) },
  lower: { flexGrow: 1, justifyContent: 'space-between', gap: sc(12), paddingTop: sc(16) },
  hiddenWhileEditing: { opacity: 0, pointerEvents: 'none' },
  goalDocked: { flex: 1 },
  topicSlotDocked: { flex: 1, minHeight: 0 },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: sc(8),
  },
  goalTitle: {
    fontFamily: fonts.serif,
    fontSize: sc(21),
    color: colors.cream,
  },
  helpBtn: {
    width: sc(23),
    height: sc(23),
    borderRadius: sc(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.06)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.45)',
  },
  helpBtnLabel: {
    fontFamily: fonts.sansSemiBold,
    fontSize: sc(13),
    color: colors.amber,
  },
  topicInput: {
    minHeight: sc(120),
    padding: sc(13),
    borderRadius: radius.sm,
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: colors.white10,
    color: colors.parchment,
    fontSize: sc(16),
    lineHeight: sc(24),
    fontFamily: fonts.serifRegular,
    textAlignVertical: 'top',
  },
  topicInputCompact: { minHeight: 0 },
  topicSlot: { flexShrink: 1, minHeight: sc(120) },
  topicSizer: { opacity: 0 },
  topicInputFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.04)',
    borderWidth: 1,
    borderColor: colors.white10,
    overflow: 'hidden',
  },
  stepBtn: {
    width: sc(60),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnLeft: { borderRightWidth: 1, borderRightColor: colors.white08 },
  stepBtnRight: { borderLeftWidth: 1, borderLeftColor: colors.white08 },
  stepValue: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // fixed height: the "∞" glyph comes from a fallback font with different
    // metrics; without the fix the stepper jumps on switching
    height: sc(76),
  },
  stepBig: {
    fontFamily: fonts.serif,
    fontSize: sc(36),
    // Spectral digits are tall: lineHeight below ~1.25 em clips them at the top
    lineHeight: sc(45),
    height: sc(45),
    color: colors.creamBright,
  },
  stepUnit: {
    fontFamily: fonts.sans,
    fontSize: sc(11),
    color: colors.creamDim,
    // the digit's lineHeight leaves spare room below (the top cannot be cut —
    // Spectral would clip it), so the caption is pulled up to the digit
    marginTop: -sc(8),
  },
  presets: {
    flexDirection: 'row',
    gap: sc(8),
    marginTop: sc(12),
  },
  preset: {
    flex: 1,
    height: presetHeight(),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.06)',
  },
  presetActive: {
    backgroundColor: 'rgba(230,162,60,.18)',
    borderColor: 'rgba(230,162,60,.4)',
  },
  presetLabel: {
    fontFamily: fonts.mono,
    fontSize: sc(12),
    color: colors.creamDim,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.5)',
  },
  examplesCard: {
    marginHorizontal: sc(18),
    padding: sc(12),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(26,20,14,.98)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.32)',
  },
  exampleRow: {
    padding: sc(11),
    borderRadius: radius.sm,
    backgroundColor: colors.white05,
    borderWidth: 1,
    borderColor: colors.white08,
    marginBottom: sc(8),
  },
  exampleText: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(14),
    lineHeight: sc(19),
    color: colors.parchment,
  },
});
