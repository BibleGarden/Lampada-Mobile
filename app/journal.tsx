import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
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
import { ChevronLeft, Close, PauseIcon, PlayIcon, Trash } from '../components/icons';
import * as db from '../lib/db';
import { fmtTime } from '../lib/store';
import { colors, fonts, radius, sc } from '../lib/theme';

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

export default function Journal() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<db.JournalEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  // раскрытая молитва и её содержимое (грузится по требованию)
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<db.JournalDetail | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailRequest = useRef(0);
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
    },
    [],
  );

  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingUri(null);
  }, [playerStatus.didJustFinish]);

  const toggleOpen = useCallback(async (id: number) => {
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
      return;
    }
    setOpenId(id);
    setDetail(null);
    const nextDetail = await db.getJournalDetail(id);
    if (detailRequest.current === request) setDetail(nextDetail);
  }, [openId, playingUri, player]);

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
            <Text style={styles.cardMeta}>
              {fmtDuration(item.elapsedSec)}
              {item.answerCount > 0 && ` · ${fmtAnswers(item.answerCount)}`}
            </Text>
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
            {detail === null ? null : detail.answers.length === 0 && detail.recordings.length === 0 ? (
              <Text style={styles.emptyDetail}>Молитва прошла без записей</Text>
            ) : (
              detail.answers.map((a) => {
                const recs = detail.recordings.filter((r) => r.questionIndex === a.questionIndex);
                return (
                  <View key={a.questionIndex} style={styles.qaBlock}>
                    <Text style={styles.qaQuestion}>{a.question}</Text>
                    <Text style={styles.qaAnswer}>{a.text}</Text>
                    {recs.map((r) => (
                      <RecordingRow
                        key={r.uri}
                        uri={r.uri}
                        durationSec={r.durationSec}
                        playing={playingUri === r.uri}
                        onToggle={() => togglePlay(r.uri)}
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
                    key={r.uri}
                    uri={r.uri}
                    durationSec={r.durationSec}
                    playing={playingUri === r.uri}
                    onToggle={() => togglePlay(r.uri)}
                  />
                ))}

            <Pressable
              onPress={() => askOrConfirmDelete(item.id)}
              style={[styles.deleteBtn, confirming && styles.deleteBtnConfirming]}
            >
              <Trash size={14} color={confirming ? '#ec8a7a' : 'rgba(255,255,255,.45)'} />
              <Text style={[styles.deleteLabel, confirming && { color: '#ec8a7a' }]}>
                {confirming ? 'Точно удалить? Это навсегда' : 'Удалить молитву'}
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
      <Animated.View entering={FadeIn.duration(500)} style={{ flex: 1 }}>
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
    </View>
  );
}

function RecordingRow({
  uri,
  durationSec,
  playing,
  onToggle,
}: {
  uri: string;
  durationSec: number;
  playing: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.recRow}>
      <View style={styles.recPlay}>
        {playing ? <PauseIcon size={11} color="#f0c074" /> : <PlayIcon size={12} color="#f0c074" />}
      </View>
      <Text style={styles.recLabel}>Аудиозапись · {fmtTime(durationSec)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080604' },
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
    fontFamily: fonts.mono,
    fontSize: sc(10),
    letterSpacing: sc(1.2),
    textTransform: 'uppercase',
    color: colors.labelGold,
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
