import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../lib/store';
import { colors, fonts, radius, sc } from '../lib/theme';
import { Heart, Close, PauseIcon, PlayIcon } from './icons';
import { IconButton } from './ui';
import ScripturePassageText from './ScripturePassageText';
import type { ScriptureAudioControl } from '../lib/useScriptureAudio';

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  scriptureAudio: ScriptureAudioControl;
};

// Читалка длинных отрывков — тёмно-зелёная, как в прототипе
export default function ScriptureReader({ sheetRef, scriptureAudio }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  // точечные подписки — читалка не ререндерится от тика таймера
  const scrList = useSession((st) => st.scrList);
  const scrIndex = useSession((st) => st.scrIndex);
  const scrFav = useSession((st) => st.scrFav);
  const toggleFav = useSession((st) => st.toggleFav);
  const cur = scrList[scrIndex];
  const fav = !!cur && scrFav.includes(cur.canonicalId);
  const snapPoints = useMemo(() => {
    const measuredHeight = headerHeight + contentHeight + sc(24);
    return [Math.min(windowHeight * 0.88, Math.max(sc(240), measuredHeight))];
  }, [contentHeight, headerHeight, windowHeight]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.75} />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      topInset={insets.top}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <View
        style={styles.header}
        onLayout={({ nativeEvent }) => setHeaderHeight(nativeEvent.layout.height)}
      >
        <View style={styles.referenceWrap}>
          <Text style={styles.ref}>{cur?.reference ?? 'Писание'}</Text>
          {cur?.translationAlias ? (
            <Text style={styles.translation}>{cur.translationAlias}</Text>
          ) : null}
        </View>
        <View style={styles.headerBtns}>
          {cur && !cur.offline ? (
            <IconButton
              accessibilityLabel={scriptureAudio.phase === 'playing' ? 'Пауза' : 'Слушать отрывок'}
              size={sc(32)}
              bg="rgba(255,255,255,.04)"
              border={colors.white08}
              onPress={scriptureAudio.toggle}
            >
              {scriptureAudio.phase === 'loading' ? (
                <ActivityIndicator size="small" color={colors.goldSoft} />
              ) : scriptureAudio.phase === 'playing' ? (
                <PauseIcon size={13} />
              ) : (
                <PlayIcon size={13} />
              )}
            </IconButton>
          ) : null}
          <IconButton
            accessibilityLabel={fav ? 'Удалить из избранного' : 'Добавить в избранное'}
            size={sc(32)}
            bg="rgba(255,255,255,.04)"
            border={colors.white08}
            onPress={toggleFav}
          >
            <Heart size={16} fill={fav ? '#e7cf95' : 'none'} />
          </IconButton>
          <IconButton
            accessibilityLabel="Закрыть чтение"
            size={sc(32)}
            bg="rgba(255,255,255,.04)"
            border={colors.white08}
            onPress={() => sheetRef.current?.close()}
          >
            <Close size={15} />
          </IconButton>
        </View>
      </View>
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        onContentSizeChange={(_, height) => setContentHeight(height)}
      >
        {cur?.title ? <Text style={styles.title}>{cur.title}</Text> : null}
        {cur ? (
          <ScripturePassageText
            scripture={cur}
            style={styles.text}
            testIDPrefix="scripture-reader-highlight"
            activeVerseNumber={scriptureAudio.activeVerseNumber}
          />
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bg: {
    backgroundColor: '#131f1a',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(214,182,120,.28)',
  },
  handle: {
    backgroundColor: 'rgba(214,182,120,.3)',
    width: sc(36),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sc(16),
    paddingBottom: sc(12),
  },
  headerBtns: {
    flexDirection: 'row',
    gap: sc(8),
  },
  referenceWrap: {
    flex: 1,
    marginRight: sc(10),
  },
  ref: {
    fontFamily: fonts.mono,
    fontSize: sc(11),
    letterSpacing: sc(1.4),
    color: colors.labelGold,
  },
  translation: {
    marginTop: sc(3),
    fontFamily: fonts.mono,
    fontSize: sc(9),
    textTransform: 'uppercase',
    color: colors.white50,
  },
  content: {
    paddingHorizontal: sc(18),
    paddingBottom: sc(40),
  },
  text: {
    fontFamily: fonts.serif,
    fontSize: sc(16),
    lineHeight: sc(24),
    color: '#eef0e6',
  },
  title: {
    marginBottom: sc(12),
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
    textTransform: 'uppercase',
    // тот же базовый цвет, что и у текста отрывка; прозрачность гасит его
    // до серовато-зелёного на тёмном фоне читалки
    color: '#eef0e6',
    opacity: 0.6,
  },
});
