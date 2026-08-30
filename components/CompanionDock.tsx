import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useShallow } from 'zustand/react/shallow';
import { useSession } from '../lib/store';
import { buildScriptureCompactText } from '../lib/scripture';
import { colors, fonts, isTablet, radius, sc, useStyles } from '../lib/theme';
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
  PauseIcon,
  PlayIcon,
} from './icons';
import ScripturePassageText from './ScripturePassageText';
import type { ScriptureAudioControl } from '../lib/useScriptureAudio';

type Props = {
  onOpenAnswer: () => void;
  onOpenReader: () => void;
  scriptureAudio: ScriptureAudioControl;
};

// Функции, а не константы: значения зависят от текущей геометрии окна и
// пересчитываются на каждом рендере вместе со стилями.
const cardLineHeight = () => sc(20);
// Кнопки в карточке ниже, чем ряд действий на весь экран: карточка и так
// набирает высоту, а строки отрывка нужнее.
const cardBtnSize = () => sc(32);

// Карточка-спутник внизу сессии: режим «вопросы» и режим «Писание».
// Механика следа/фронтира живёт в store; здесь только отображение.
export default function CompanionDock({ onOpenAnswer, onOpenReader, scriptureAudio }: Props) {
  const styles = useStyles(stylesFactory);
  const [measuredScripture, setMeasuredScripture] = React.useState<{
    key: string;
    lines: number;
  } | null>(null);
  // Сколько строк отрывка реально помещается: карточка тянется по свободной
  // высоте экрана, поэтому лимит считаем по замеренной области, а не фиксируем.
  const [textAreaHeight, setTextAreaHeight] = React.useState(0);
  const scriptureLineLimit = textAreaHeight
    ? Math.max(2, Math.min(9, Math.floor(textAreaHeight / cardLineHeight())))
    : 3;
  // селектор без remaining/elapsed: карточка не должна ререндериться
  // каждую секунду от тика таймера
  const s = useSession(
    useShallow((st) => ({
      dockMode: st.dockMode,
      questions: st.questions,
      questionSources: st.questionSources,
      qIndex: st.qIndex,
      answeredCount: st.answeredCount,
      answers: st.answers,
      generating: st.generating,
      scrList: st.scrList,
      scrIndex: st.scrIndex,
      scrFav: st.scrFav,
      scrStatus: st.scrStatus,
      scrError: st.scrError,
      setDockMode: st.setDockMode,
      prevQuestion: st.prevQuestion,
      nextQuestion: st.nextQuestion,
      jumpQuestion: st.jumpQuestion,
      prevScripture: st.prevScripture,
      nextScripture: st.nextScripture,
      jumpScripture: st.jumpScripture,
      toggleFav: st.toggleFav,
      retryScripture: st.retryScripture,
    })),
  );
  const isQ = s.dockMode === 'question';

  const answered = (() => {
    const a = s.answers[s.qIndex];
    return !!(a && (a.text.trim() || a.recordings.length));
  })();

  const curScripture = s.scrList[s.scrIndex];
  // В карточке показываем только выделенные сервером стихи; целиком — в читалке
  const compactScripture = curScripture ? buildScriptureCompactText(curScripture) : null;
  const scriptureMeasureKey = curScripture
    ? `${curScripture.canonicalId}:${curScripture.receivedAt}`
    : null;
  const scriptureIsTruncated = !!scriptureMeasureKey
    && measuredScripture?.key === scriptureMeasureKey
    && measuredScripture.lines > scriptureLineLimit;
  const canReadInFull = !!compactScripture
    && (scriptureIsTruncated || compactScripture.partial);
  const curFav = !!curScripture && s.scrFav.includes(curScripture.canonicalId);
  const onFrontier = s.qIndex === s.answeredCount;

  const onTextAreaLayout = React.useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setTextAreaHeight((current) => (Math.abs(current - h) < 1 ? current : h));
  }, []);

  const tap = (fn: () => void) => () => {
    Haptics.selectionAsync();
    fn();
  };

  return (
    <View style={styles.card}>
      {/* заголовок + переключатель */}
      <View style={styles.header}>
        <Text style={styles.label} numberOfLines={isQ ? 1 : undefined}>
          {isQ
            ? s.questionSources[s.qIndex] === 'fallback'
              ? 'Резервный вопрос'
              : 'Спутник спрашивает'
            : curScripture?.reference ?? 'Писание'}
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
        <Animated.View key={`q-${s.qIndex}`} entering={FadeInDown.duration(350)} style={styles.body}>
          <View style={styles.textWrap} onLayout={onTextAreaLayout}>
            {s.generating ? (
              <ActivityIndicator accessibilityLabel="Готовлю вопрос" color={colors.goldSoft} />
            ) : (
              // maxHeight + прокрутка: длинный вопрос не выталкивает карточку
              // за экран, а листается внутри неё
              <ScrollView
                style={styles.textScroll}
                contentContainerStyle={styles.textScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <Text style={styles.cardText}>{s.questions[s.qIndex]}</Text>
              </ScrollView>
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
              {/* Plus и Regen — сплошные фигуры на всю кегль, в отличие от
                  узкого шеврона, поэтому в кнопке им нужен меньший размер */}
              {!onFrontier ? (
                <ChevronRight />
              ) : answered ? (
                <Plus size={14} />
              ) : (
                <Regen size={14} strokeWidth={1.7} />
              )}
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
        <Animated.View
          key={`scr-${s.scrIndex}-${curScripture?.canonicalId ?? s.scrStatus}`}
          entering={FadeInDown.duration(350)}
          style={styles.body}
        >
          <View style={styles.textWrap} onLayout={onTextAreaLayout}>
            {s.scrStatus === 'loading' || s.scrStatus === 'retrying' ? (
              <ActivityIndicator accessibilityLabel="Подбираю Писание" color={colors.goldSoft} />
            ) : curScripture ? (
              <>
                {/* Заголовок отрывка живёт только в полной читалке: в карточке
                    он читался как ключевой стих. Сам текст открывает читалку —
                    тянуться ради этого к отдельной ссылке неинтуитивно */}
                <Pressable
                  onPress={canReadInFull ? tap(onOpenReader) : undefined}
                  disabled={!canReadInFull}
                  accessibilityRole={canReadInFull ? 'button' : undefined}
                  accessibilityLabel={canReadInFull ? 'Читать отрывок целиком' : undefined}
                  style={({ pressed }) => [
                    styles.scripturePreview,
                    pressed && canReadInFull && styles.scripturePreviewPressed,
                  ]}
                >
                  <ScripturePassageText
                    scripture={curScripture}
                    style={styles.cardText}
                    numberOfLines={scriptureLineLimit}
                    testIDPrefix="scripture-preview-highlight"
                    variant="compact"
                  />
                  <Text
                    accessible={false}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    pointerEvents="none"
                    style={[styles.cardText, styles.scriptureMeasureText]}
                    onTextLayout={({ nativeEvent }) => {
                      const lines = nativeEvent.lines.length;
                      setMeasuredScripture((current) =>
                        current?.key === scriptureMeasureKey && current.lines === lines
                          ? current
                          : { key: scriptureMeasureKey as string, lines },
                      );
                    }}
                  >
                    {compactScripture?.text ?? curScripture.text}
                  </Text>
                </Pressable>
                {(s.scrStatus === 'offline_fallback' || curScripture.offline) && (
                  <Text style={styles.offlineLabel}>Офлайн · из сохранённых</Text>
                )}
              </>
            ) : (
              <Pressable onPress={tap(() => void s.retryScripture())} style={styles.retryWrap}>
                <Text style={styles.cardText}>Сейчас не удалось подобрать отрывок.</Text>
                <Text style={styles.retryLabel}>
                  {s.scrError === 'not_configured' ? 'Проверить настройки' : 'Попробовать ещё раз'}
                </Text>
              </Pressable>
            )}
          </View>
          {curScripture && (
            <View style={styles.scriptureTools}>
              {!curScripture.offline && (
                <Pressable
                  onPress={tap(scriptureAudio.toggle)}
                  disabled={scriptureAudio.phase === 'loading'}
                  style={styles.listenButton}
                  accessibilityLabel={scriptureAudio.phase === 'playing' ? 'Пауза' : 'Слушать отрывок'}
                >
                  {scriptureAudio.phase === 'loading' ? (
                    <ActivityIndicator size="small" color={colors.goldSoft} />
                  ) : scriptureAudio.phase === 'playing' ? (
                    <PauseIcon size={12} />
                  ) : (
                    <PlayIcon size={12} />
                  )}
                  <Text style={styles.readMoreLabel}>
                    {scriptureAudio.phase === 'loading'
                      ? 'Загрузка'
                      : scriptureAudio.phase === 'playing'
                        ? 'Пауза'
                        : scriptureAudio.phase === 'paused'
                          ? 'Продолжить'
                          : scriptureAudio.phase === 'error'
                            ? 'Повторить'
                            : 'Слушать'}
                  </Text>
                </Pressable>
              )}
              {canReadInFull && (
                <Pressable onPress={tap(onOpenReader)} style={styles.readMore}>
                  <Text style={styles.readMoreLabel}>Читать целиком</Text>
                  <ChevronRight size={13} />
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.actionsRow}>
            <SquareBtn disabled={!curScripture || s.scrIndex === 0} onPress={tap(s.prevScripture)} dim>
              <ChevronLeft />
            </SquareBtn>
            <Pressable
              disabled={!curScripture}
              onPress={tap(s.toggleFav)}
              style={({ pressed }) => [
                styles.mainBtn,
                !curScripture && { opacity: 0.35 },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <Heart fill={curFav ? '#e7cf95' : 'none'} />
              <Text style={styles.mainBtnLabel}>{curFav ? 'В избранном' : 'В избранное'}</Text>
            </Pressable>
            <SquareBtn
              disabled={!curScripture || s.scrStatus === 'loading' || s.scrStatus === 'retrying'}
              onPress={tap(() => void s.nextScripture())}
            >
              <ChevronRight />
            </SquareBtn>
          </View>
          <View style={styles.dotsWrap}>
            <WindowDots total={Math.max(1, s.scrList.length)} current={s.scrIndex} onSet={s.jumpScripture} />
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
  const styles = useStyles(stylesFactory);
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

const stylesFactory = () => StyleSheet.create({
  card: {
    flexGrow: 1,
    flexShrink: 1,
    padding: sc(12),
    borderRadius: radius.sm,
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  // Тело карточки тянется на всю её высоту, чтобы текстовая область
  // получила остаток под заголовком, кнопками и точками.
  body: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sc(8),
    marginBottom: sc(8),
  },
  label: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: sc(10),
    lineHeight: sc(14),
    letterSpacing: sc(1.4),
    textTransform: 'uppercase',
    color: colors.labelGold,
  },
  scriptureTools: {
    minHeight: sc(26),
    marginTop: sc(2),
    marginBottom: sc(2),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sc(10),
  },
  listenButton: {
    minHeight: sc(26),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(6),
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
    // flexBasis: 0 — высота области задаётся карточкой, а не длиной текста:
    // иначе лимит строк и высота тянули бы друг друга по кругу. Потолок роста
    // карточки на планшете живёт в `dockWrap` экрана сессии.
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    // Пол текстовой области — он же нижняя граница карточки: всё остальное в
    // ней фиксировано. Слишком высокий пол не давал карточке ужаться под
    // доступную высоту, и ряды снизу вываливались за рамку.
    minHeight: sc(28),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sc(4),
  },
  // Вопрос листается внутри отведённой высоты, не выталкивая карточку
  textScroll: {
    flex: 1,
    alignSelf: 'stretch',
  },
  textScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  cardText: {
    fontFamily: fonts.serif,
    fontSize: sc(15),
    lineHeight: cardLineHeight(),
    color: colors.cardText,
    textAlign: 'center',
  },
  scripturePreviewPressed: {
    opacity: 0.7,
  },
  scripturePreview: {
    alignSelf: 'stretch',
  },
  scriptureMeasureText: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  offlineLabel: {
    marginTop: sc(5),
    fontFamily: fonts.mono,
    fontSize: sc(9),
    letterSpacing: sc(0.8),
    textTransform: 'uppercase',
    color: colors.white50,
  },
  retryWrap: {
    alignItems: 'center',
    gap: sc(7),
  },
  retryLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(12),
    color: colors.goldSoft,
  },
  readMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(5),
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
    marginTop: sc(8),
  },
  squareBtn: {
    // Квадрат: ширина и высота идут от одного токена.
    width: cardBtnSize(),
    height: cardBtnSize(),
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
    // Высота от того же токена, что и у квадратных: ряд остаётся ровным.
    height: cardBtnSize(),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(8),
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
    fontSize: sc(12),
    color: colors.goldSoft,
  },
  dotsWrap: {
    marginTop: sc(6),
  },
});
