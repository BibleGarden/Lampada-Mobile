import { dismissKeyboard } from '../lib/dismissKeyboard';
import { useI18n } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  ActivityIndicator,
  Pressable,
  type LayoutChangeEvent,
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
import { useKeyboardFormPolicy } from '../lib/useKeyboardLayout';
import KeyboardViewport, { KeyboardPendingSpace } from '../components/keyboard/KeyboardViewport';
import { shouldPauseReflectionFlame } from '../lib/reflectionFlame';
import { REFLECT_DENSITIES, fitReflectDensity, reflectionQuestionType } from '../lib/reflectLayout';
import { bottomActionPadding, colors, column, fonts, radius, sc, screenGutter, useStyles } from '../lib/theme';

const ReflectionFlame = React.memo(Flame);

export default function Reflect() {
  const sessionId = useSession((state) => state.sessionId);

  if (sessionId === null) return <Redirect href="/" />;

  return <ReflectScreen />;
}

function ReflectScreen() {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const s = useSession();
  const [takeaway, setTakeaway] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const policy = useKeyboardFormPolicy();
  const dockedKeyboard = policy.fillInput;
  const { width, height } = useWindowDimensions();
  const [densityIndex, setDensityIndex] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number>();
  const [questionBlockHeight, setQuestionBlockHeight] = useState<number>();
  const [questionLines, setQuestionLines] = useState<number>();
  const [actionsHeight, setActionsHeight] = useState<number>();
  const density = REFLECT_DENSITIES[densityIndex];
  const questionType = reflectionQuestionType(s.reflectQ, density.fontStep);
  const completing = useRef(false);

  // После смены окна или вопроса подбор начинается с исходной раскладки.
  useEffect(() => {
    setDensityIndex(0);
    setQuestionBlockHeight(undefined);
    setQuestionLines(undefined);
  }, [width, height, s.reflectQ]);

  useEffect(() => {
    if (dockedKeyboard || viewportHeight === undefined || questionBlockHeight === undefined
      || questionLines === undefined || actionsHeight === undefined) return;
    const fitted = fitReflectDensity({
      availableHeight: viewportHeight - insets.top - sc(16) - bottomActionPadding(0),
      questionBlockHeight,
      questionLines,
      actionsHeight,
      question: s.reflectQ,
      densityIndex,
    }, sc);
    // Повторное измерение уменьшенного текста не возвращает большой кегль:
    // иначе перенос строки на границе может вызвать цикл размеров.
    if (fitted.index > densityIndex) setDensityIndex(fitted.index);
  }, [actionsHeight, densityIndex, dockedKeyboard, insets.top, questionBlockHeight, questionLines, s.reflectQ, viewportHeight]);

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
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={styles.fill}>
        <KeyboardViewport>
          <ScrollView
            onLayout={(e: LayoutChangeEvent) => setViewportHeight(e.nativeEvent.layout.height)}
            contentContainerStyle={[
              styles.body,
              {
                paddingTop: insets.top + sc(16),
                paddingBottom: dockedKeyboard ? sc(16) : bottomActionPadding(0),
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
                onLayout={(e) => setQuestionBlockHeight(e.nativeEvent.layout.height)}
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
                    onTextLayout={(e) => setQuestionLines(e.nativeEvent.lines.length)}
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
                : <View style={{ flex: 1, minHeight: sc(16) }} />}

              {policy.actionsVisible && (
                <View style={{ gap: sc(12) }} onLayout={(e) => setActionsHeight(e.nativeEvent.layout.height)}>
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
    marginTop: sc(4),
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
    marginTop: sc(20),
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
