import { useI18n } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  ActivityIndicator,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
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
import { colors, column, fonts, radius, sc, useStyles } from '../lib/theme';

export default function Reflect() {
  const sessionId = useSession((state) => state.sessionId);

  if (sessionId === null) return <Redirect href="/" />;

  return <ReflectScreen />;
}

function questionTypography(question: string) {
  if (question.length > 110) return { fontSize: sc(18), lineHeight: sc(24) };
  if (question.length > 75) return { fontSize: sc(20), lineHeight: sc(26) };
  return { fontSize: sc(22), lineHeight: sc(29) };
}

function animateCompactLayout(event: KeyboardEvent) {
  const duration = Math.max(event.duration ?? 0, 380);
  LayoutAnimation.configureNext({
    duration,
    update: {
      duration,
      type: LayoutAnimation.Types.keyboard,
    },
  });
}

function ReflectScreen() {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const s = useSession();
  const [takeaway, setTakeaway] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const completing = useRef(false);

  // Android «назад» тут некуда вести — только явное завершение
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      animateCompactLayout(event);
      setKeyboardOpen(true);
    });
    const hide = Keyboard.addListener(hideEvent, (event: KeyboardEvent) => {
      animateCompactLayout(event);
      setKeyboardOpen(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const complete = async (saveText: string) => {
    if (completing.current) return; // двойной тап не должен завершать дважды
    completing.current = true;
    try {
      await s.complete(saveText);
      router.replace('/done');
    } catch (e) {
      completing.current = false;
      throw e;
    }
  };

  // свежий отсчёт, та же цель и длительность — как continuePraying в прототипе
  const continuePraying = async () => {
    if (completing.current) return;
    completing.current = true;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await s.enterSession();
      router.replace('/session');
    } finally {
      completing.current = false;
    }
  };

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View
        entering={FadeIn.duration(500)}
        style={[styles.body, { paddingTop: insets.top + sc(16), paddingBottom: insets.bottom + sc(24) }]}
      >
        <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ flex: 1 }}>
          {!keyboardOpen && (
            <View style={styles.emberWrap}>
              <Flame width={sc(104)} ember />
            </View>
          )}

          <View style={[styles.questionBlock, keyboardOpen && styles.questionBlockCompact]}>
            {!keyboardOpen && (
              <Kicker style={{ textAlign: 'center', marginBottom: sc(10) }}>
                {s.reflectSource === 'fallback' ? t('screens.reflect.fallback') : t('screens.reflect.before')}
              </Kicker>
            )}
            {s.reflectGenerating ? (
              <View style={styles.questionLoading}>
                <ActivityIndicator color={colors.goldSoft} />
                <Text style={styles.loadingText}>{t('screens.questionLoading')}</Text>
              </View>
            ) : (
              <Text style={[styles.question, questionTypography(s.reflectQ)]}>{s.reflectQ}</Text>
            )}
          </View>

          <TextInput
            value={takeaway}
            onChangeText={setTakeaway}
            multiline
            placeholder={t('screens.reflect.placeholder')}
            placeholderTextColor="rgba(240,230,210,.35)"
            style={styles.input}
            // вывод — короткая фраза: ввод = «Готово», закрывает клавиатуру
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
            onSubmitEditing={Keyboard.dismiss}
          />

          <View style={{ flex: 1, minHeight: sc(16) }} />

          <View style={{ gap: sc(12) }}>
            <GoldButton
              label={takeaway.trim() ? t('screens.reflect.save') : t('screens.reflect.finish')}
              onPress={() => complete(takeaway.trim())}
            />
            <Pressable
              onPress={continuePraying}
              style={({ pressed }) => [styles.continueBtn, pressed && { transform: [{ scale: 0.985 }] }]}
            >
              <Regen size={16} color={colors.amberBright} strokeWidth={1.7} />
              <Text style={styles.continueLabel}>{t('screens.reflect.return')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0806' },
  body: { flex: 1, paddingHorizontal: sc(18), ...column() },
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
    // Поле — единственное, что здесь может уступить высоту: уголёк, вопрос и
    // кнопки заданы жёстко. Без сжатия в альбомной ориентации на планшете
    // «Вернуться к молитве» уходила за нижний край.
    flexBasis: sc(128),
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
