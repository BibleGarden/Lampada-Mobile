import { useI18n } from '../lib/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '../lib/store';
import { screenReaderHiddenProps } from '../lib/a11y';
import { colors, column, fonts, radius, sc, screenGutter, useStyles } from '../lib/theme';
import { Heart, Close, PauseIcon, PlayIcon } from './icons';
import { IconButton } from './ui';
import ScripturePassageText from './ScripturePassageText';
import type { ScriptureAudioControl } from '../lib/useScriptureAudio';
import { useSheetReflow } from '../lib/useSheetReflow';

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  scriptureAudio: ScriptureAudioControl;
  onOpenChange: (open: boolean) => void;
};

// Reader for long passages — dark green, as in the prototype.
// Like the answer sheet, the reader does not re-render on the session's secondly tick.
export default React.memo(ScriptureReader);

function ScriptureReader({ sheetRef, scriptureAudio, onOpenChange }: Props) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  // focused subscriptions — the reader does not re-render on timer ticks
  const scrList = useSession((st) => st.scrList);
  const scrIndex = useSession((st) => st.scrIndex);
  const scrFav = useSession((st) => st.scrFav);
  const toggleFav = useSession((st) => st.toggleFav);
  const cur = scrList[scrIndex];
  const listenDisabled = scriptureAudio.phase === 'loading' || scriptureAudio.phase === 'unavailable';
  const fav = !!cur && scrFav.includes(cur.canonicalId);
  const { mountKey, open, onIndexChange } = useSheetReflow();
  const referenceRef = useRef<Text>(null);
  const close = useCallback(() => sheetRef.current?.close(), [sheetRef]);
  // The sheet's content has no shared wrapper: the header and the text each
  // get the hidden flag and escape separately.
  const contentA11y = { ...screenReaderHiddenProps(!open), onAccessibilityEscape: close };

  // The screen under the reader is hidden from screen readers — focus the reference.
  useEffect(() => {
    if (open && referenceRef.current) AccessibilityInfo.sendAccessibilityEvent(referenceRef.current, 'focus');
  }, [open]);
  const snapPoints = useMemo(() => {
    const measuredHeight = headerHeight + contentHeight + sc(24);
    return [Math.min(windowHeight * 0.88, Math.max(sc(240), measuredHeight))];
  }, [contentHeight, headerHeight, windowHeight]);

  const renderBackdrop = useCallback(
    (props: any) => (
      // The backdrop has no localized label; the close button and the escape gesture close it.
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.75} accessible={false} />
    ),
    [],
  );

  return (
    <BottomSheet
      key={mountKey}
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      topInset={insets.top}
      enablePanDownToClose
      onChange={(index) => {
        onIndexChange(index);
        onOpenChange(index >= 0);
      }}
      // By default the content container is a single "Bottom Sheet" element
      // and the buttons inside are unreachable by VoiceOver. Expose the children.
      accessible={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <View
        style={styles.header}
        {...contentA11y}
        onLayout={({ nativeEvent }) => setHeaderHeight(nativeEvent.layout.height)}
      >
        <View style={styles.referenceWrap}>
          <Text ref={referenceRef} style={styles.ref} testID="scripture-reader-reference">{cur?.reference ?? t('components.reader.scripture')}</Text>
          {cur?.translationAlias ? (
            <Text style={styles.translation}>{cur.translationAlias}</Text>
          ) : null}
        </View>
        <View style={styles.headerBtns}>
          {cur && !cur.offline ? (
            <IconButton
              accessibilityLabel={scriptureAudio.phase === 'unavailable' ? t('components.reader.narrationUnavailable') : scriptureAudio.phase === 'playing' ? t('components.reader.pause') : t('components.reader.listenPassage')}
              disabled={listenDisabled}
              accessibilityState={{ disabled: listenDisabled, busy: scriptureAudio.phase === 'loading' }}
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
            accessibilityLabel={fav ? t('components.reader.removeFavorite') : t('components.reader.addFavorite')}
            size={sc(32)}
            bg="rgba(255,255,255,.04)"
            border={colors.white08}
            testID={fav ? 'scripture-reader-favorite-active' : 'scripture-reader-favorite'}
            onPress={toggleFav}
          >
            <Heart size={16} fill={fav ? '#e7cf95' : 'none'} />
          </IconButton>
          <IconButton
            accessibilityLabel={t('components.reader.closeReader')}
            size={sc(32)}
            bg="rgba(255,255,255,.04)"
            border={colors.white08}
            testID="scripture-reader-close"
            onPress={close}
          >
            <Close size={15} />
          </IconButton>
        </View>
      </View>
      <BottomSheetScrollView
        {...contentA11y}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + sc(40) }]}
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

const stylesFactory = () => StyleSheet.create({
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
    ...column(),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: screenGutter(),
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
    ...column(),
    paddingHorizontal: screenGutter(),
  },
  text: {
    fontFamily: fonts.serif,
    fontSize: sc(16),
    lineHeight: sc(24),
    color: colors.cardText,
  },
  title: {
    marginBottom: sc(12),
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
    textTransform: 'uppercase',
    // the same base color as the passage text; the opacity dims it to a
    // grayish green on the reader's dark background
    color: colors.cardText,
    opacity: 0.6,
  },
});
