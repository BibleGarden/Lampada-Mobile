import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, sc, useStyles } from '../lib/theme';
import { ChevronLeft } from './icons';
import { IconButton, Kicker } from './ui';

export default function ScreenHeader({
  title,
  backLabel,
  onBack,
  backTestID,
  titleTestID,
}: {
  title: string;
  backLabel: string;
  onBack: () => void;
  backTestID?: string;
  titleTestID?: string;
}) {
  const styles = useStyles(stylesFactory);
  return (
    <View style={styles.row}>
      <IconButton size={sc(34)} accessibilityLabel={backLabel} testID={backTestID} onPress={onBack}>
        <ChevronLeft size={18} color={colors.goldSoft} />
      </IconButton>
      <Kicker style={styles.title} testID={titleTestID}>{title}</Kicker>
      <View style={styles.spacer} />
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: sc(11) },
  spacer: { width: sc(34), height: sc(34) },
});
