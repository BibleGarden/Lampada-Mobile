import { dismissKeyboard } from '../lib/dismissKeyboard';
import { useI18n } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ScreenBg from '../components/ScreenBg';
import Flame from '../components/Flame';
import { GoldButton, Kicker } from '../components/ui';
import { Regen } from '../components/icons';
import { useSession } from '../lib/store';
import { useKeyboardFormPolicy, useKeyboardLayout } from '../lib/useKeyboardLayout';
import KeyboardViewport, { KeyboardPendingSpace } from '../components/keyboard/KeyboardViewport';
import { shouldPauseReflectionFlame } from '../lib/reflectionFlame';
import { REFLECT_DENSITIES, REFLECT_SPACING, fitReflectDensity, reflectionAvailableHeight, reflectionDensityIndex, reflectionQuestionType, type ReflectFitState, type ReflectMeasurement } from '../lib/reflectLayout';
import { bottomActionPadding, colors, column, fonts, radius, sc, screenGutter, useStyles } from '../lib/theme';

const ReflectionFlame = React.memo(Flame);

export default function Reflect() {
  const sessionId = useSession((state) => state.sessionId);

  if (sessionId === null) return <Redirect href="/" />;

  return <ReflectScreen />;
}

function ReflectScreen() {
  const { t, language } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const s = useSession();
  const [takeaway, setTakeaway] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const policy = useKeyboardFormPolicy();
  const dockedKeyboard = policy.fillInput;
  const keyboard = useKeyboardLayout();
  const { width, height, fontScale } = useWindowDimensions();
  const [rootHeight, setRootHeight] = useState<number>();
  const topPadding = insets.top + sc(REFLECT_SPACING.top);
  const bottomPadding = bottomActionPadding(0);
  const fitContext = JSON.stringify([width, height, rootHeight, fontScale, insets.top, insets.bottom,
    language, s.reflectQ, s.reflectGenerating, s.reflectSource]);
  const [fitState, setFitState] = useState<ReflectFitState>({ context: fitContext, index: 0 });
  const [questionMeasurement, setQuestionMeasurement] = useState<ReflectMeasurement>();
  const [actionsMeasurement, setActionsMeasurement] = useState<{ context: string; height: number }>();
  const densityIndex = reflectionDensityIndex(fitState, fitContext);
  // Редактирование всегда использует прежние размеры, независимо от подбора.
  const density = REFLECT_DENSITIES[dockedKeyboard ? 0 : densityIndex];
  const questionType = reflectionQuestionType(s.reflectQ, density.fontStep);
  const scroll = useRef<ScrollView>(null);
  const [overflowState, setOverflowState] = useState({ context: fitContext, value: false });
  const overflow = overflowState.context === fitContext && overflowState.value;
  const completing = useRef(false);

  useEffect(() => {
    const fitted = fitReflectDensity({
      // KeyboardViewport анимирует резерв отдельно: высота ScrollView во время
      // скрытия клавиатуры не отражает доступное место обычной раскладки.
      availableHeight: reflectionAvailableHeight(rootHeight, topPadding, bottomPadding, insets.bottom),
      context: fitContext,
      index: densityIndex,
      measurement: questionMeasurement,
      actionsHeight: actionsMeasurement?.context === fitContext ? actionsMeasurement.height : undefined,
      keyboardPhase: keyboard.phase,
    }, sc);
    if (fitted.index !== densityIndex) setFitState({ context: fitContext, index: fitted.index });
    // Не сбрасываем подтверждённый overflow на время анимации клавиатуры:
    // её закрытие не должно повторно мигать индикатором прокрутки.
    if (fitted.overflow !== undefined) setOverflowState({ context: fitContext, value: fitted.overflow });
  }, [actionsMeasurement, densityIndex, fitContext, rootHeight, topPadding, bottomPadding, insets.bottom, keyboard.phase, questionMeasurement]);

  useEffect(() => {
    if (overflow) scroll.current?.flashScrollIndicators();
  }, [overflow]);

  // Android «назад» тут некуда вести — только явное завершение
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const complete = async (saveText: string) => {
    if (completing.current) return; // двойной тап не должен завершать дважды
    completing.current = true;
    try {
      await s.complete(saveText);
      dismissKeyboard();
      router.dismissTo({ pathname: '/', params: { prayerSaved: '1' } });
    } catch (e) {
      completing.current = false;
      throw e;
    }
  };

  // Новый отсчёт внутри той же молитвы, с сохранением всей истории.
  const continuePraying = async () => {
    if (completing.current) return;
    completing.current = true;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      s.resumeSession();
      router.replace('/session');
    } finally {
      completing.current = false;
    }
  };

  return (
    <View style={styles.root} onLayout={(e) => setRootHeight(e.nativeEvent.layout.height)}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={styles.fill}>
        <KeyboardViewport>
          <ScrollView
            ref={scroll}
            contentContainerStyle={[
              styles.body,
              {
                paddingTop: topPadding,
                paddingBottom: dockedKeyboard ? sc(16) : bottomPadding,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Pressable
              onPress={dismissKeyboard}
              accessible={false}
              style={styles.content}
            >
              {!dockedKeyboard && (
                <View style={styles.emberWrap}>
                  <ReflectionFlame width={sc(density.flame)} ember paused={shouldPauseReflectionFlame(process.env.EXPO_PUBLIC_APPSTORE_VIDEO, inputFocused)} />
                </View>
              )}

              <View
                style={[styles.questionBlock, dockedKeyboard && styles.questionBlockCompact]}
                key={`${fitContext}:${densityIndex}`}
                onLayout={(e) => {
                  if (!dockedKeyboard) setQuestionMeasurement({
                    context: fitContext, index: densityIndex, blockHeight: e.nativeEvent.layout.height,
                  });
                }}
              >
                {!dockedKeyboard && (
                  <Kicker style={{ textAlign: 'center', marginBottom: sc(10) }} testID="reflect-kicker">
                    {s.reflectSource === 'fallback' ? t('screens.reflect.fallback') : t('screens.reflect.before')}
                  </Kicker>
                )}
                {s.reflectGenerating ? (
                  <View style={styles.questionLoading}>
                    <ActivityIndicator color={colors.goldSoft} />
                    <Text style={styles.loadingText}>{t('screens.questionLoading')}</Text>
                  </View>
                ) : (
                  <Text
                    style={[styles.question, { fontSize: sc(questionType.font), lineHeight: sc(questionType.line) }]}
                    testID="reflect-question"
                  >{s.reflectQ}</Text>
                )}
              </View>

              <TextInput
                value={takeaway}
                onChangeText={setTakeaway}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                multiline
                placeholder={t('screens.reflect.placeholder')}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { flexBasis: sc(density.input) }, dockedKeyboard && styles.inputEditing]}
                accessibilityLabel={t('screens.reflect.placeholder')}
                accessibilityHint={t('screens.reflect.inputHint')}
                testID="reflection-input"
                // вывод — короткая фраза: ввод = «Готово», закрывает клавиатуру
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={dismissKeyboard}
              />

              {dockedKeyboard
                ? <KeyboardPendingSpace />
                : <View style={{ flex: 1, minHeight: sc(REFLECT_SPACING.actions) }} />}

              {policy.actionsVisible && (
                <View
                  key={fitContext}
                  style={{ gap: sc(12) }}
                  onLayout={(e) => setActionsMeasurement({ context: fitContext, height: e.nativeEvent.layout.height })}
                >
                  <GoldButton
                    label={takeaway.trim() ? t('screens.reflect.save') : t('screens.reflect.finish')}
                    testID="reflect-complete-button"
                    onPress={() => complete(takeaway.trim())}
                  />
                  <Pressable
                    onPress={continuePraying}
                    accessibilityRole="button"
                    accessibilityLabel={t('screens.reflect.return')}
                    testID="reflect-return-button"
                    style={({ pressed }) => [styles.continueBtn, pressed && { transform: [{ scale: 0.985 }] }]}
                  >
                    <Regen size={16} color={colors.amberBright} strokeWidth={1.7} />
                    <Text style={styles.continueLabel}>{t('screens.reflect.return')}</Text>
                  </Pressable>
                </View>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardViewport>
      </Animated.View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  fill: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: screenGutter(), ...column() },
  content: { flexGrow: 1 },
  emberWrap: {
    alignItems: 'center',
  },
  questionBlock: {
    paddingHorizontal: sc(6),
    marginTop: sc(REFLECT_SPACING.question),
  },
  questionBlockCompact: {
    marginTop: 0,
  },
  question: {
    fontFamily: fonts.serif,
    color: colors.cream,
    textAlign: 'center',
  },
  questionLoading: {
    minHeight: sc(58),
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(10),
  },
  loadingText: {
    fontFamily: fonts.sans,
    fontSize: sc(12),
    color: colors.white55,
  },
  input: {
    marginTop: sc(REFLECT_SPACING.input),
    flexShrink: 1,
    minHeight: sc(72),
    padding: sc(13),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.045)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.24)',
    color: colors.parchment,
    fontSize: sc(16),
    lineHeight: sc(24),
    fontFamily: fonts.serifRegular,
    textAlignVertical: 'top',
  },
  inputEditing: {
    flexGrow: 1,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(8),
    paddingVertical: sc(12),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(230,162,60,.08)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.32)',
  },
  continueLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
    color: colors.amberBright,
  },
});
