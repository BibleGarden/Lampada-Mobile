import React from 'react';
import { Keyboard, Pressable, StyleSheet, Text } from 'react-native';
import { useI18n } from '../../lib/i18n';
import { useKeyboardFormPolicy } from '../../lib/useKeyboardLayout';
import { colors, fonts, sc, useStyles } from '../../lib/theme';
import { ChevronDown } from '../icons';

export default function KeyboardDismissAction({ focused, testID }: { focused: boolean; testID: string }) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const { dismissVisible } = useKeyboardFormPolicy('keep', focused);
  if (!dismissVisible) return null;
  return (
    <Pressable accessibilityRole="button" testID={testID} onPress={Keyboard.dismiss} style={styles.action}>
      <Text style={styles.label}>{t('components.keyboard.done')}</Text>
      <ChevronDown size={14} color={colors.goldSoft} />
    </Pressable>
  );
}

const stylesFactory = () => StyleSheet.create({
  action: { minHeight: 44, alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: sc(6), paddingHorizontal: sc(6) },
  label: { fontFamily: fonts.sans, fontSize: sc(12), color: colors.goldSoft },
});
