import { useI18n } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendContentReport, type ContentReportError } from '../lib/contentReportClient';
import { colors, fonts, radius, sc, useStyles } from '../lib/theme';

type Props = {
  visible: boolean;
  contentType: 'question' | 'scripture';
  contentText: string;
  onDismiss: () => void;
};

const errorKey = (error: ContentReportError) => {
  if (error === 'network' || error === 'timeout') return 'components.contentReport.networkError';
  if (error === 'validation') return 'components.contentReport.validationError';
  return 'components.contentReport.sendError';
};

export default function ContentReportDialog({
  visible,
  contentType,
  contentText,
  onDismiss,
}: Props) {
  const { language, t } = useI18n();
  const styles = useStyles(stylesFactory);
  const insets = useSafeAreaInsets();
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ContentReportError | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    setComment('');
    setSubmitting(false);
    setSent(false);
    setError(null);
  }, [visible, contentType, contentText]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') onDismiss();
    });
    return () => subscription.remove();
  }, [onDismiss, visible]);

  // Прокручиваем именно на появление клавиатуры: на фокусе карточка ещё не
  // сжата, скроллить нечего, и поле комментария остаётся под сгибом.
  useEffect(() => {
    if (!visible || sent) return undefined;
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, [sent, visible]);

  const dismiss = () => {
    if (!submitting) onDismiss();
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const trimmedComment = comment.trim();
    const result = await sendContentReport({
      content_type: contentType,
      content_text: contentText,
      ...(trimmedComment ? { user_comment: trimmedComment } : {}),
      language,
    });
    setSubmitting(false);
    if (result.ok) {
      setSent(true);
    } else {
      setError(result.error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.backdrop,
          { paddingTop: insets.top + sc(20), paddingBottom: insets.bottom + sc(20) },
        ]}
      >
        {/* тап по фону гасит клавиатуру, но не закрывает диалог: иначе
            набранный комментарий пропадал бы вместе с ним */}
        <Pressable
          accessible={false}
          onPress={() => Keyboard.dismiss()}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.card} testID="content-report-dialog">
          {/* текст и поле скроллятся, а кнопки закреплены внизу карточки:
              с открытой клавиатурой на узких экранах они иначе уезжают под неё */}
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.cardContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.kicker}>{t('components.contentReport.kicker')}</Text>
            <Text style={styles.title}>
              {contentType === 'question'
                ? t('components.contentReport.questionTitle')
                : t('components.contentReport.scriptureTitle')}
            </Text>
            {sent ? (
              <Text style={styles.body}>{t('components.contentReport.sent')}</Text>
            ) : (
              <>
                <Text style={styles.body}>{t('components.contentReport.body')}</Text>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  editable={!submitting}
                  multiline
                  maxLength={1000}
                  placeholder={t('components.contentReport.commentPlaceholder')}
                  accessibilityLabel={t('components.contentReport.commentPlaceholder')}
                  placeholderTextColor="rgba(255,255,255,.35)"
                  style={styles.input}
                  textAlignVertical="top"
                  testID="content-report-comment"
                />
                {error ? <Text style={styles.error}>{t(errorKey(error))}</Text> : null}
              </>
            )}
          </ScrollView>
          <View style={styles.footer}>
            {sent ? (
              <Pressable
                accessibilityRole="button"
                testID="content-report-done"
                onPress={dismiss}
                style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
              >
                <Text style={styles.primaryActionText}>{t('components.contentReport.done')}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={dismiss}
                  style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                >
                  <Text style={styles.secondaryActionText}>{t('components.contentReport.cancel')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={() => void submit()}
                  testID="content-report-send"
                  style={({ pressed }) => [
                    styles.primaryAction,
                    submitting && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryActionText}>
                    {submitting
                      ? t('components.contentReport.sending')
                      : t('components.contentReport.send')}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const stylesFactory = () => StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: sc(22),
    backgroundColor: 'rgba(7,5,3,.9)',
  },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: sc(440),
    maxHeight: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.white08,
    backgroundColor: '#1d1710',
  },
  cardContent: {
    paddingHorizontal: sc(22),
    paddingTop: sc(22),
    paddingBottom: sc(4),
  },
  footer: {
    flexDirection: 'row',
    gap: sc(10),
    paddingHorizontal: sc(22),
    paddingTop: sc(14),
    paddingBottom: sc(22),
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
    fontSize: sc(23),
    lineHeight: sc(29),
  },
  body: {
    marginTop: sc(12),
    color: colors.white65,
    fontFamily: fonts.sans,
    fontSize: sc(13),
    lineHeight: sc(20),
  },
  input: {
    minHeight: sc(96),
    maxHeight: sc(180),
    marginTop: sc(16),
    padding: sc(12),
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.white08,
    backgroundColor: colors.white05,
    color: colors.parchment,
    fontFamily: fonts.sans,
    fontSize: sc(13),
    lineHeight: sc(19),
  },
  error: {
    marginTop: sc(10),
    color: '#ec9b8e',
    fontFamily: fonts.sans,
    fontSize: sc(12),
    lineHeight: sc(18),
  },
  secondaryAction: {
    flex: 1,
    minHeight: sc(44),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.white08,
    backgroundColor: colors.white05,
  },
  secondaryActionText: {
    color: colors.creamDim,
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
  },
  primaryAction: {
    flex: 1,
    minHeight: sc(44),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.labelGold,
    backgroundColor: 'rgba(214,182,120,.12)',
  },
  primaryActionText: {
    color: colors.goldSoft,
    fontFamily: fonts.sansMedium,
    fontSize: sc(13),
  },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
});
