import { useI18n } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConsentDecision, ConsentPurpose } from '../lib/privacyConsent';
import { colors, fonts, radius, sc, useStyles } from '../lib/theme';

const consentCopy = (t: ReturnType<typeof useI18n>['t']): Record<ConsentPurpose, { kicker: string; title: string; body: string }> => ({
  core_prayer_ai: {
    kicker: t('components.reader.privacy'),
    title: t('components.reader.aiTitle'),
    body:
      t('components.reader.aiBody'),
  },
  answer_context: {
    kicker: t('components.reader.answerKicker'),
    title: t('components.reader.answerTitle'),
    body:
      t('components.reader.answerBody'),
  },
  audio_transcription: {
    kicker: t('components.reader.audioKicker'),
    title: t('components.reader.audioTitle'),
    body:
      t('components.reader.audioBody'),
  },
});

type Props = {
  visible: boolean;
  purpose: ConsentPurpose;
  onDecision: (decision: Exclude<ConsentDecision, 'undecided'>) => Promise<void>;
  onDismiss: () => void;
};

export default function PrivacyConsentDialog({ visible, purpose, onDecision, onDismiss }: Props) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const text = consentCopy(t)[purpose];
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    if (visible) setSubmitting(false);
  }, [visible]);
  useEffect(() => {
    if (!visible) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') onDismiss();
    });
    return () => subscription.remove();
  }, [onDismiss, visible]);
  const decide = async (decision: 'allowed' | 'denied') => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onDecision(decision);
    } catch {
      setSubmitting(false);
    }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View
        accessibilityViewIsModal
        style={[styles.backdrop, { paddingTop: insets.top + sc(20), paddingBottom: insets.bottom + sc(20) }]}
      >
        <View style={styles.card} testID={`privacy-consent-${purpose}`}>
          <Text style={styles.kicker}>{text.kicker}</Text>
          <Text style={styles.title}>{text.title}</Text>
          <Text style={styles.body}>{text.body}</Text>
          <Text style={styles.note}>{t('components.reader.decisionNote')}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              testID={`privacy-consent-${purpose}-deny`}
              disabled={submitting}
              onPress={() => void decide('denied')}
              style={({ pressed }) => [styles.action, submitting && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.actionText}>{t('components.reader.deny')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              testID={`privacy-consent-${purpose}-allow`}
              disabled={submitting}
              onPress={() => void decide('allowed')}
              style={({ pressed }) => [styles.action, submitting && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.actionText}>{t('components.reader.allow')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const stylesFactory = () => StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: sc(22),
    backgroundColor: 'rgba(7,5,3,.88)',
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: sc(440),
    padding: sc(22),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.white08,
    backgroundColor: '#1d1710',
  },
  kicker: {
    marginBottom: sc(10),
    color: colors.labelGold,
    fontFamily: fonts.monoMedium,
    fontSize: sc(9),
    letterSpacing: sc(1.4),
  },
  title: {
    color: colors.parchment,
    fontFamily: fonts.serifSemiBold,
    fontSize: sc(24),
    lineHeight: sc(30),
  },
  body: {
    marginTop: sc(12),
    color: colors.white65,
    fontFamily: fonts.sans,
    fontSize: sc(13),
    lineHeight: sc(20),
  },
  note: {
    marginTop: sc(12),
    color: colors.white55,
    fontFamily: fonts.sans,
    fontSize: sc(10),
    lineHeight: sc(15),
  },
  actions: { flexDirection: 'row', gap: sc(10), marginTop: sc(20) },
  action: {
    flex: 1,
    minHeight: sc(44),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sc(8),
    borderWidth: 1,
    borderColor: colors.labelGold,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(230,162,60,.06)',
  },
  actionText: {
    color: colors.parchment,
    fontFamily: fonts.sansMedium,
    fontSize: sc(11),
    textAlign: 'center',
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
});
