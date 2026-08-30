import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import ScreenBg from '../components/ScreenBg';
import { IconButton, Kicker } from '../components/ui';
import { ChevronLeft, Close, Heart, PauseIcon, Pen, PlayIcon, Trash } from '../components/icons';
import ScripturePassageText from '../components/ScripturePassageText';
import * as db from '../lib/db';
import { getFavoriteScripturesBySession } from '../lib/scriptureRepository';
import { favoriteToScriptureDisplay, type FavoriteScripture } from '../lib/scripture';
import { fmtTime } from '../lib/store';
import { transcribeRecording } from '../lib/transcription';
import { colors, column, fonts, radius, sc, useStyles } from '../lib/theme';

// «5 июля», «5 июля 2025» — год только если не текущий
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
};

const fmtDuration = (sec: number) => {
  const min = Math.round(sec / 60);
  if (min < 1) return 'меньше минуты';
  if (min < 60) return `${min} мин`;
  return `${Math.floor(min / 60)} ч ${min % 60} мин`;
};

const fmtAnswers = (count: number) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ответов`;
  if (mod10 === 1) return `${count} ответ`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ответа`;
  return `${count} ответов`;
};

const fmtQuotes = (count: number) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} цитат`;
  if (mod10 === 1) return `${count} цитата`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} цитаты`;
  return `${count} цитат`;
};

export default function Journal() {
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<db.JournalEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  // раскрытая молитва и её содержимое (грузится по требованию)
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<db.JournalDetail | null>(null);
  // цитаты раскрытой молитвы и та, что читают во всплывающем окне
  const [favorites, setFavorites] = useState<FavoriteScripture[]>([]);
  const [openQuote, setOpenQuote] = useState<FavoriteScripture | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailRequest = useRef(0);
  const transcriptionControllers = useRef(new Map<number, AbortController>());
  const [transcriptionStates, setTranscriptionStates] = useState<
    Record<number, 'loading' | 'error'>
  >({});
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);

  // поиск с лёгким дебаунсом, чтобы не гонять SQL на каждую букву
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const timer = setTimeout(async () => {
        const nextEntries = await db.getJournal(query);
        if (active) {
          setEntries(nextEntries);
          setLoaded(true);
        }
      }, 150);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [query]),
  );

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      for (const controller of transcriptionControllers.current.values()) controller.abort();
      transcriptionControllers.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingUri(null);
  }, [playerStatus.didJustFinish]);

  const toggleOpen = useCallback(async (id: number) => {
    for (const controller of transcriptionControllers.current.values()) controller.abort();
    transcriptionControllers.current.clear();
    setTranscriptionStates({});
    const request = ++detailRequest.current;
    Haptics.selectionAsync();
    setConfirmDeleteId(null);
    if (playingUri) {
      player.pause();
      setPlayingUri(null);
    }
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      setFavorites([]);
      return;
    }
    setOpenId(id);
    setDetail(null);
    setFavorites([]);
    const [nextDetail, nextFavorites] = await Promise.all([
      db.getJournalDetail(id),
      getFavoriteScripturesBySession(id),
    ]);
    if (detailRequest.current === request) {
      setDetail(nextDetail);
      setFavorites(nextFavorites);
    }
  }, [openId, playingUri, player]);

  const startJournalTranscription = async (recording: db.JournalDetail['recordings'][number]) => {
    transcriptionControllers.current.get(recording.id)?.abort();
    const controller = new AbortController();
    transcriptionControllers.current.set(recording.id, controller);
    setTranscriptionStates((current) => ({ ...current, [recording.id]: 'loading' }));

    try {
      const transcript = await transcribeRecording(
        recording.uri,
        recording.durationSec,
        controller.signal,
      );
      if (transcriptionControllers.current.get(recording.id) !== controller) return;
      await db.updateRecordingTranscript(recording.id, transcript);
      if (transcriptionControllers.current.get(recording.id) !== controller) return;
      setDetail((current) =>
        current === null
          ? current
          : {
              ...current,
              recordings: current.recordings.map((item) =>
                item.id === recording.id ? { ...item, transcript } : item,
              ),
            },
      );
      setTranscriptionStates((current) => {
        const next = { ...current };
        delete next[recording.id];
        return next;
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      console.warn(
        'Не удалось расшифровать запись из дневника',
        error instanceof Error ? error.message : 'unknown error',
      );
      setTranscriptionStates((current) => ({ ...current, [recording.id]: 'error' }));
    } finally {
      if (transcriptionControllers.current.get(recording.id) === controller) {
        transcriptionControllers.current.delete(recording.id);
      }
    }
  };

  const togglePlay = (uri: string) => {
    if (playingUri === uri) {
      player.pause();
      setPlayingUri(null);
      return;
    }
    player.replace(uri);
    player.play();
    setPlayingUri(uri);
  };

  // удаление в два тапа, как записи в шторке ответа
  const askOrConfirmDelete = async (id: number) => {
    if (confirmDeleteId === id) {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirmDeleteId(null);
      if (playingUri) {
        player.pause();
        setPlayingUri(null);
      }
      for (const controller of transcriptionControllers.current.values()) controller.abort();
      transcriptionControllers.current.clear();
      setTranscriptionStates({});
      await db.deleteSession(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (openId === id) {
        setOpenId(null);
        setDetail(null);
      }
      setEntries(await db.getJournal(query));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setConfirmDeleteId(id);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  const renderEntry = ({ item }: { item: db.JournalEntry }) => {
    const open = openId === item.id;
    const confirming = confirmDeleteId === item.id;
    return (
      <View style={[styles.card, open && styles.cardOpen]}>
        <Pressable onPress={() => toggleOpen(item.id)}>
          <View style={styles.cardHead}>
            <Text style={styles.cardDate}>{fmtDate(item.startedAt)}</Text>
            <View style={styles.cardMetaRow}>
              <Text style={styles.cardMeta}>{fmtDuration(item.elapsedSec)}</Text>
              {item.answerCount > 0 && (
                <View style={styles.metaChip} accessibilityLabel={fmtAnswers(item.answerCount)}>
                  <Pen size={10} color={colors.goldSoft} />
                  <Text style={styles.cardMeta}>{item.answerCount}</Text>
                </View>
              )}
              {item.favoriteCount > 0 && (
                <View style={styles.metaChip} accessibilityLabel={fmtQuotes(item.favoriteCount)}>
                  <Heart size={11} color={colors.goldSoft} />
                  <Text style={styles.cardMeta}>{item.favoriteCount}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={styles.cardTopic} numberOfLines={open ? undefined : 2}>
            {item.topic.trim() || 'Свободная молитва'}
          </Text>
          {!!item.takeaway && (
            <Text style={styles.cardTakeaway} numberOfLines={open ? undefined : 2}>
              «{item.takeaway}»
            </Text>
          )}
        </Pressable>

        {open && (
          <Animated.View entering={FadeIn.duration(250)}>
            {detail === null ? null : detail.answers.length === 0
              && detail.recordings.length === 0 && favorites.length === 0 ? (
              <Text style={styles.emptyDetail}>Молитва прошла без записей</Text>
            ) : (
              detail.answers.map((a) => {
                const recs = detail.recordings.filter((r) => r.questionIndex === a.questionIndex);
                return (
                  <View key={a.questionIndex} style={styles.qaBlock}>
                    <Text style={styles.qaQuestion}>{a.question}</Text>
                    {!!a.text.trim() && <Text style={styles.qaAnswer}>{a.text}</Text>}
                    {recs.map((r) => (
                      <RecordingRow
                        key={r.id}
                        uri={r.uri}
                        durationSec={r.durationSec}
                        transcript={r.transcript}
                        playing={playingUri === r.uri}
                        onToggle={() => togglePlay(r.uri)}
                        transcriptionState={transcriptionStates[r.id]}
                        onTranscribe={() => startJournalTranscription(r)}
                      />
                    ))}
                  </View>
                );
              })
            )}
            {/* записи без текста ответа — отдельным хвостом */}
            {detail !== null &&
              detail.recordings
                .filter((r) => !detail.answers.some((a) => a.questionIndex === r.questionIndex))
                .map((r) => (
                  <RecordingRow
                    key={r.id}
                    uri={r.uri}
                    durationSec={r.durationSec}
                    transcript={r.transcript}
                    playing={playingUri === r.uri}
                    onToggle={() => togglePlay(r.uri)}
                    transcriptionState={transcriptionStates[r.id]}
                    onTranscribe={() => startJournalTranscription(r)}
                  />
                ))}

            {favorites.length > 0 && (
              <View style={styles.quotesBlock}>
                <Text style={styles.quotesLabel}>{fmtQuotes(favorites.length)}</Text>
                {favorites.map((favorite) => (
                  <Pressable
                    key={favorite.id}
                    onPress={() => setOpenQuote(favorite)}
                    accessibilityRole="button"
                    accessibilityLabel={`Открыть цитату ${favorite.reference}`}
                    testID={`journal-quote-${favorite.id}`}
                    style={({ pressed }) => [styles.quoteRow, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.quoteRef}>{favorite.reference}</Text>
                    <Text style={styles.quoteText} numberOfLines={2}>
                      {favorite.text}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable
              onPress={() => askOrConfirmDelete(item.id)}
              style={[styles.deleteBtn, confirming && styles.deleteBtnConfirming]}
            >
              <Trash size={14} color={confirming ? '#ec8a7a' : 'rgba(255,255,255,.45)'} />
              <Text style={[styles.deleteLabel, confirming && { color: '#ec8a7a' }]}>
                {confirming ? 'Точно удалить? Это навсегда' : 'Удалить запись'}
              </Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(500)} style={styles.screen}>
        <View style={[styles.top, { top: insets.top + sc(10) }]}>
          <IconButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ChevronLeft color={colors.goldSoft} />
          </IconButton>
          <Kicker>Дневник</Kicker>
          <View style={{ width: sc(34) }} />
        </View>

        <View style={[styles.searchWrap, { marginTop: insets.top + sc(56) }]}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Найти молитву…"
            placeholderTextColor="rgba(240,230,210,.35)"
            style={styles.search}
            returnKeyType="search"
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8} style={styles.searchClear}>
              <Close size={14} />
            </Pressable>
          )}
        </View>

        <FlatList
          data={entries}
          keyExtractor={(e) => String(e.id)}
          renderItem={renderEntry}
          onScrollBeginDrag={Keyboard.dismiss}
          contentContainerStyle={{
            paddingHorizontal: sc(18),
            paddingTop: sc(12),
            paddingBottom: insets.bottom + sc(24),
            gap: sc(10),
          }}
          ListEmptyComponent={
            loaded ? (
              <Text style={styles.empty}>
                {query.trim()
                  ? 'Ничего не нашлось — попробуй другое слово'
                  : 'Здесь появятся твои молитвы'}
              </Text>
            ) : null
          }
        />
      </Animated.View>

      {/* Цитата целиком: то же оформление, что и на экране сохранённых цитат,
          с подсветкой ключевых стихов, когда сервер их отметил */}
      <Modal
        visible={openQuote !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpenQuote(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpenQuote(null)}>
          <Pressable
            style={[styles.modalCard, { maxHeight: '78%' }]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.modalHead}>
              <Text style={styles.quoteRef}>{openQuote?.reference}</Text>
              <IconButton
                onPress={() => setOpenQuote(null)}
                accessibilityLabel="Закрыть цитату"
                testID="journal-quote-close"
              >
                <Close />
              </IconButton>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: sc(6) }}>
              {!!openQuote?.title && <Text style={styles.modalTitle}>{openQuote.title}</Text>}
              {openQuote ? (
                (() => {
                  const display = favoriteToScriptureDisplay(openQuote);
                  return display ? (
                    <ScripturePassageText
                      scripture={display}
                      style={styles.modalText}
                      testIDPrefix={`journal-quote-highlight-${openQuote.id}`}
                    />
                  ) : (
                    <Text style={styles.modalText}>{openQuote.text}</Text>
                  );
                })()
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function RecordingRow({
  uri,
  durationSec,
  transcript,
  playing,
  onToggle,
  transcriptionState,
  onTranscribe,
}: {
  uri: string;
  durationSec: number;
  transcript: string | null;
  playing: boolean;
  onToggle: () => void;
  transcriptionState?: 'loading' | 'error';
  onTranscribe: () => void;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <View style={styles.recBlock}>
      <Pressable onPress={onToggle} style={styles.recRow}>
        <View style={styles.recPlay}>
          {playing ? <PauseIcon size={11} color="#f0c074" /> : <PlayIcon size={12} color="#f0c074" />}
        </View>
        <Text style={styles.recLabel}>Аудиозапись · {fmtTime(durationSec)}</Text>
      </Pressable>
      {!!transcript && <Text style={styles.recTranscript}>{transcript}</Text>}
      {!transcript && transcriptionState === 'loading' ? (
        <Text style={styles.recTranscriptionState}>Расшифровываю…</Text>
      ) : !transcript && transcriptionState === 'error' ? (
        <View style={styles.recTranscriptionErrorRow}>
          <Text style={styles.recTranscriptionError}>Не удалось расшифровать</Text>
          <Pressable onPress={onTranscribe} hitSlop={8}>
            <Text style={styles.recTranscriptionRetry}>Повторить</Text>
          </Pressable>
        </View>
      ) : !transcript ? (
        <Pressable onPress={onTranscribe} style={styles.recTranscriptionAction}>
          <Text style={styles.recTranscriptionActionLabel}>Расшифровать</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
  screen: { flex: 1, ...column() },
  top: {
    position: 'absolute',
    left: sc(12),
    right: sc(12),
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchWrap: {
    marginHorizontal: sc(18),
    justifyContent: 'center',
  },
  search: {
    height: sc(40),
    paddingHorizontal: sc(13),
    paddingRight: sc(36),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.045)',
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.22)',
    color: colors.parchment,
    fontSize: sc(14),
    fontFamily: fonts.sans,
  },
  searchClear: {
    position: 'absolute',
    right: sc(10),
  },
  card: {
    backgroundColor: colors.cardBg,
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.18)',
    borderRadius: radius.md,
    padding: sc(13),
  },
  cardOpen: {
    borderColor: 'rgba(214,182,120,.34)',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sc(8),
    marginBottom: sc(6),
  },
  cardDate: {
    flexShrink: 0,
    fontFamily: fonts.mono,
    fontSize: sc(10),
    letterSpacing: sc(1.2),
    textTransform: 'uppercase',
    color: colors.labelGold,
  },
  // счётчики ответов и цитат словами не помещались в строку, поэтому
  // числа стоят при иконках; словесная форма осталась для VoiceOver.
  // Иконки — сплошным золотом: в цвет соседнего текста они сливались.
  // Размер им передаётся сырым числом: sc() применяется внутри компонента
  cardMetaRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(15),
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(7),
  },
  cardMeta: {
    fontFamily: fonts.mono,
    fontSize: sc(10),
    color: colors.warmHint,
  },
  cardTopic: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(15),
    lineHeight: sc(21),
    color: colors.parchment,
  },
  cardTakeaway: {
    marginTop: sc(6),
    fontFamily: fonts.serifItalic,
    fontSize: sc(13),
    lineHeight: sc(19),
    color: colors.goldSoft,
  },
  emptyDetail: {
    marginTop: sc(12),
    fontFamily: fonts.sans,
    fontSize: sc(12),
    color: colors.creamDim,
  },
  qaBlock: {
    marginTop: sc(12),
    paddingTop: sc(10),
    borderTopWidth: 1,
    borderTopColor: 'rgba(214,182,120,.12)',
  },
  qaQuestion: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(11.5),
    lineHeight: sc(16),
    color: colors.labelGold,
    marginBottom: sc(4),
  },
  qaAnswer: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(14),
    lineHeight: sc(20),
    color: colors.body,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(8),
  },
  recBlock: {
    marginTop: sc(8),
  },
  recPlay: {
    width: sc(28),
    height: sc(28),
    borderRadius: sc(14),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(230,162,60,.14)',
    borderWidth: 1,
    borderColor: 'rgba(230,162,60,.34)',
  },
  recLabel: {
    fontFamily: fonts.mono,
    fontSize: sc(10.5),
    color: colors.labelGold,
  },
  recTranscript: {
    marginTop: sc(6),
    marginLeft: sc(36),
    fontFamily: fonts.serifRegular,
    fontSize: sc(13.5),
    lineHeight: sc(19),
    color: colors.body,
  },
  recTranscriptionState: {
    marginTop: sc(6),
    marginLeft: sc(36),
    fontFamily: fonts.sans,
    fontSize: sc(11.5),
    color: colors.warmHint,
  },
  recTranscriptionAction: {
    alignSelf: 'flex-start',
    marginTop: sc(7),
    marginLeft: sc(36),
    paddingVertical: sc(5),
    paddingHorizontal: sc(9),
    borderRadius: radius.pill,
    backgroundColor: 'rgba(127,174,154,.1)',
    borderWidth: 1,
    borderColor: 'rgba(127,174,154,.3)',
  },
  recTranscriptionActionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(11),
    color: colors.greenSoft,
  },
  recTranscriptionErrorRow: {
    marginTop: sc(6),
    marginLeft: sc(36),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sc(10),
  },
  recTranscriptionError: {
    fontFamily: fonts.sans,
    fontSize: sc(11.5),
    color: '#ec9b8e',
  },
  recTranscriptionRetry: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(11.5),
    color: colors.goldSoft,
  },
  quotesBlock: {
    marginTop: sc(12),
    paddingTop: sc(10),
    borderTopWidth: 1,
    borderTopColor: 'rgba(214,182,120,.12)',
    gap: sc(8),
  },
  quotesLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: sc(11.5),
    lineHeight: sc(16),
    color: colors.labelGold,
  },
  quoteRow: {
    gap: sc(3),
    paddingVertical: sc(6),
    paddingHorizontal: sc(10),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.03)',
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.14)',
  },
  quoteRef: {
    fontFamily: fonts.mono,
    fontSize: sc(9.5),
    letterSpacing: sc(1),
    textTransform: 'uppercase',
    color: colors.labelGold,
  },
  quoteText: {
    fontFamily: fonts.serifRegular,
    fontSize: sc(13),
    lineHeight: sc(19),
    color: colors.body,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: sc(18),
    backgroundColor: 'rgba(8,6,4,.82)',
  },
  modalCard: {
    padding: sc(16),
    borderRadius: radius.md,
    backgroundColor: '#141009',
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.24)',
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sc(10),
    marginBottom: sc(10),
  },
  modalTitle: {
    marginBottom: sc(8),
    fontFamily: fonts.sansMedium,
    fontSize: sc(14),
    color: colors.goldSoft,
  },
  modalText: {
    fontFamily: fonts.serif,
    fontSize: sc(15),
    lineHeight: sc(24),
    color: colors.cardText,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(6),
    marginTop: sc(14),
    paddingVertical: sc(9),
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.08)',
  },
  deleteBtnConfirming: {
    backgroundColor: 'rgba(220,90,70,.14)',
    borderColor: 'rgba(220,90,70,.4)',
  },
  deleteLabel: {
    fontFamily: fonts.sans,
    fontSize: sc(12),
    color: colors.creamDim,
  },
  empty: {
    marginTop: sc(48),
    fontFamily: fonts.serifItalic,
    fontSize: sc(14),
    color: colors.creamDim,
    textAlign: 'center',
  },
});
