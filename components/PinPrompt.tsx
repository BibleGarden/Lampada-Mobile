import { useI18n } from '../lib/i18n';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import ScreenBg from './ScreenBg';
import PinPad from './PinPad';
import { colors, column, fonts, sc, useStyles } from '../lib/theme';

// Ввод пин-кода поверх экрана настроек: установка, смена и подтверждение перед
// выключением защиты.
//
// Это обычный оверлей, а не системный Modal и не отдельный маршрут. Модальное
// окно всплывает над корневым layout и закрыло бы собой экран блокировки, если
// бы приложение свернули прямо во время ввода; отдельный маршрут добавил бы в
// историю навигации шаг, с которого можно вернуться назад посреди сценария.
//
// За это приходится доплачивать `accessibilityViewIsModal` вручную: системный
// Modal изолирует дерево доступности сам, а обычный оверлей — нет, и VoiceOver
// иначе уводил бы фокус на настройки под вводом пина.

export type PinPromptProps = {
  title: string;
  subtitle?: string | null;
  /** Известная длина пина: ввод проверяется автоматически, без подтверждения. */
  expectedLength?: number;
  onSubmit: (pin: string) => string | null | Promise<string | null>;
  onCancel: () => void;
};

export default function PinPrompt({
  title,
  subtitle,
  expectedLength,
  onSubmit,
  onCancel,
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
