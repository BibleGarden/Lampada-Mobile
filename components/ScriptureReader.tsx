import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSession } from '../lib/store';
import { scriptures } from '../lib/scriptures';
import { colors, fonts, radius, sc } from '../lib/theme';
import { Heart, Close } from './icons';
import { IconButton } from './ui';

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
};

// Читалка длинных отрывков — тёмно-зелёная, как в прототипе
export default function ScriptureReader({ sheetRef }: Props) {
  // точечные подписки — читалка не ререндерится от тика таймера
  const scrList = useSession((st) => st.scrList);
  const scrIndex = useSession((st) => st.scrIndex);
  const scrFav = useSession((st) => st.scrFav);
  const toggleFav = useSession((st) => st.toggleFav);
  const cur = scriptures[scrList[scrIndex]];
  const fav = scrFav.includes(scrList[scrIndex]);
  const snapPoints = useMemo(() => ['88%'], []);

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
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.header}>
        <Text style={styles.ref}>{cur.ref}</Text>
        <View style={styles.headerBtns}>
          <IconButton size={sc(32)} bg="rgba(255,255,255,.04)" border={colors.white08} onPress={toggleFav}>
            <Heart size={16} fill={fav ? '#e7cf95' : 'none'} />
          </IconButton>
          <IconButton
            size={sc(32)}
            bg="rgba(255,255,255,.04)"
            border={colors.white08}
            onPress={() => sheetRef.current?.close()}
          >
            <Close size={15} />
          </IconButton>
        </View>
      </View>
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Text style={styles.text}>{cur.text}</Text>
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
  ref: {
    fontFamily: fonts.mono,
    fontSize: sc(11),
    letterSpacing: sc(1.4),
    color: colors.labelGold,
  },
  content: {
    paddingHorizontal: sc(18),
    paddingBottom: sc(40),
  },
  text: {
    fontFamily: fonts.serif,
    fontSize: sc(16),
    lineHeight: sc(27),
    color: '#eef0e6',
  },
});
