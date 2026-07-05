import React from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useShallow } from 'zustand/react/shallow';
import { useSession } from '../lib/store';
import { scriptures, isLong } from '../lib/scriptures';
import { colors, fonts, radius, sc } from '../lib/theme';
import { WindowDots } from './ui';
import {
  Book,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Pen,
  Plus,
  QuestionMark,
  Regen,
} from './icons';

type Props = {
  onOpenAnswer: () => void;
  onOpenReader: () => void;
};

// Карточка-спутник внизу сессии: режим «вопросы» и режим «Писание».
// Механика следа/фронтира живёт в store; здесь только отображение.
export default function CompanionDock({ onOpenAnswer, onOpenReader }: Props) {
  // селектор без remaining/elapsed: карточка не должна ререндериться
  // каждую секунду от тика таймера
  const s = useSession(
    useShallow((st) => ({
      dockMode: st.dockMode,
      questions: st.questions,
      qIndex: st.qIndex,
      answeredCount: st.answeredCount,
      answers: st.answers,
      generating: st.generating,
      scrList: st.scrList,
      scrIndex: st.scrIndex,
      scrFav: st.scrFav,
      setDockMode: st.setDockMode,
      prevQuestion: st.prevQuestion,
      nextQuestion: st.nextQuestion,
      jumpQuestion: st.jumpQuestion,
      prevScripture: st.prevScripture,
      nextScripture: st.nextScripture,
      jumpScripture: st.jumpScripture,
      toggleFav: st.toggleFav,
    })),
  );
  const isQ = s.dockMode === 'question';

  const answered = (() => {
    const a = s.answers[s.qIndex];
    return !!(a && (a.text.trim() || a.recordings.length));
  })();

  const curScripture = scriptures[s.scrList[s.scrIndex]];
  const curFav = s.scrFav.includes(s.scrList[s.scrIndex]);
  const onFrontier = s.qIndex === s.answeredCount;
  const scrOnFrontier = s.scrIndex === s.scrList.length - 1;

  const tap = (fn: () => void) => () => {
    Haptics.selectionAsync();
    fn();
  };

  return (
    <View style={styles.card}>
      {/* заголовок + переключатель */}
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={1}>
          {isQ ? 'Спутник спрашивает' : curScripture.ref}
        </Text>
        <View style={styles.switcher}>
          <Pressable
            onPress={tap(() => s.setDockMode('question'))}
            style={[styles.switchBtn, isQ && styles.switchBtnActive]}
          >
            <QuestionMark color={isQ ? '#f0e6c8' : 'rgba(214,182,120,.55)'} />
          </Pressable>
          <Pressable
            onPress={tap(() => s.setDockMode('scripture'))}
            style={[styles.switchBtn, !isQ && styles.switchBtnActive]}
          >
            <Book color={!isQ ? '#f0e6c8' : 'rgba(214,182,120,.55)'} />
          </Pressable>
        </View>
      </View>

      {isQ ? (
        <Animated.View key={`q-${s.qIndex}`} entering={FadeInDown.duration(350)}>
          <View style={styles.textWrap}>
            {s.generating ? (
              <ActivityIndicator color={colors.goldSoft} />
            ) : (
              <Text style={styles.cardText}>{s.questions[s.qIndex]}</Text>
            )}
          </View>
          <View style={styles.actionsRow}>
            <SquareBtn
              disabled={s.qIndex === 0}
              onPress={tap(s.prevQuestion)}
              dim
            >
              <ChevronLeft />
            </SquareBtn>
            <Pressable
              onPress={tap(onOpenAnswer)}
              style={({ pressed }) => [
                styles.mainBtn,
                answered && styles.mainBtnAnswered,
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              {answered ? <Check /> : <Pen />}
              <Text style={[styles.mainBtnLabel, answered && { color: colors.greenSoft }]}>
                {answered ? 'Изменить' : 'Ответить'}
              </Text>
            </Pressable>
            <SquareBtn onPress={tap(() => s.nextQuestion())}>
              {!onFrontier ? <ChevronRight /> : answered ? <Plus /> : <Regen />}
            </SquareBtn>
          </View>
          <View style={styles.dotsWrap}>
            <WindowDots
              total={s.answeredCount + 1}
              current={s.qIndex}
              onSet={s.jumpQuestion}
            />
          </View>
        </Animated.View>
      ) : (
        <Animated.View key={`scr-${s.scrIndex}-${s.scrList[s.scrIndex]}`} entering={FadeInDown.duration(350)}>
          <View style={styles.textWrap}>
            <Text style={styles.cardText} numberOfLines={3}>
              {curScripture.text}
            </Text>
          </View>
          {isLong(curScripture) && (
            <Pressable onPress={tap(onOpenReader)} style={styles.readMore}>
              <Text style={styles.readMoreLabel}>Читать целиком</Text>
              <ChevronRight size={13} />
            </Pressable>
          )}
          <View style={styles.actionsRow}>
            <SquareBtn disabled={s.scrIndex === 0} onPress={tap(s.prevScripture)} dim>
              <ChevronLeft />
            </SquareBtn>
            <Pressable
              onPress={tap(s.toggleFav)}
              style={({ pressed }) => [styles.mainBtn, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <Heart fill={curFav ? '#e7cf95' : 'none'} />
              <Text style={styles.mainBtnLabel}>{curFav ? 'В избранном' : 'В избранное'}</Text>
            </Pressable>
            <SquareBtn onPress={tap(s.nextScripture)}>
              {!scrOnFrontier ? <ChevronRight /> : curFav ? <Plus /> : <Regen />}
            </SquareBtn>
          </View>
          <View style={styles.dotsWrap}>
            <WindowDots total={s.scrList.length} current={s.scrIndex} onSet={s.jumpScripture} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function SquareBtn({
  children,
  onPress,
  disabled,
  dim,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  dim?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.squareBtn,
        dim && styles.squareBtnDim,
        disabled && { opacity: 0.35 },
        pressed && !disabled && { transform: [{ scale: 0.95 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: sc(12),
    borderRadius: radius.sm,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sc(8),
    marginBottom: sc(10),
  },
  label: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: sc(10),
    letterSpacing: sc(1.4),
    textTransform: 'uppercase',
    color: 'rgba(214,182,120,.7)',
  },
  switcher: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,.25)',
    borderWidth: 1,
    borderColor: colors.white08,
  },
  switchBtn: {
    width: sc(30),
    height: sc(24),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBtnActive: {
    backgroundColor: 'rgba(214,182,120,.22)',
  },
  textWrap: {
    minHeight: sc(44),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sc(4),
  },
  cardText: {
    fontFamily: fonts.serif,
    fontSize: sc(15),
    lineHeight: sc(22),
    color: colors.cardText,
    textAlign: 'center',
  },
  readMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(5),
    marginTop: sc(8),
  },
  readMoreLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(12),
    color: colors.goldSoft,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(8),
    marginTop: sc(12),
  },
  squareBtn: {
    width: sc(44),
    height: sc(44),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.btnGoldBg,
    borderWidth: 1,
    borderColor: colors.btnGoldBorder,
  },
  squareBtnDim: {
    backgroundColor: colors.btnGoldBgDim,
    borderColor: colors.btnGoldBorderDim,
  },
  mainBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(8),
    paddingVertical: sc(12),
    borderRadius: radius.sm,
    backgroundColor: colors.btnGoldBg,
    borderWidth: 1,
    borderColor: colors.btnGoldBorder,
  },
  mainBtnAnswered: {
    backgroundColor: 'rgba(127,208,160,.1)',
    borderColor: 'rgba(127,208,160,.3)',
  },
  mainBtnLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
    color: colors.goldSoft,
  },
  dotsWrap: {
    marginTop: sc(12),
  },
});
