import { useI18n } from '../lib/i18n';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import ScreenBg from './ScreenBg';
import PinPad from './PinPad';
import { colors, column, fonts, sc, useStyles } from '../lib/theme';

// PIN entry over the settings screen: setup, change, and confirmation before
// turning protection off.
//
// This is a plain overlay, not a system Modal and not a separate route. A
// modal pops above the root layout and would cover the lock screen if the app
// were minimized right during entry; a separate route would add a step to the
// navigation history that could be navigated back from mid-flow.
//
// The price is setting `accessibilityViewIsModal` manually: a system Modal
// isolates the accessibility tree itself, a plain overlay does not, and
// otherwise VoiceOver would drag focus to the settings under the PIN entry.

export type PinPromptProps = {
  title: string;
  subtitle?: string | null;
  /** Known PIN length: input is checked automatically, without confirmation. */
  expectedLength?: number;
  onSubmit: (pin: string) => string | null | Promise<string | null>;
  onCancel: () => void;
  /** Stable title id for e2e (passed through to PinPad). */
  titleTestID?: string;
};

export default function PinPrompt({
  title,
  subtitle,
  expectedLength,
  onSubmit,
  onCancel,
  titleTestID,
}: PinPromptProps) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  return (
    <View style={styles.overlay} accessibilityViewIsModal testID="pin-prompt">
      <ScreenBg />
      <Animated.View entering={FadeIn.duration(220)} style={styles.body}>
        <PinPad
          title={title}
          subtitle={subtitle}
          expectedLength={expectedLength}
          onSubmit={onSubmit}
          titleTestID={titleTestID}
          footer={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('components.security.cancel')}
              testID="pin-prompt-cancel"
              onPress={onCancel}
              hitSlop={8}
              style={({ pressed }) => [pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.cancel}>{t('components.security.cancel')}</Text>
            </Pressable>
          }
        />
      </Animated.View>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#080604',
  },
  body: {
    flex: 1,
    ...column(),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sc(12),
    paddingVertical: sc(28),
  },
  cancel: { fontFamily: fonts.sansMedium, fontSize: sc(12), color: colors.goldSoft },
});
