import { useI18n } from '../lib/i18n';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, sc, useStyles } from '../lib/theme';
import { keepShortPrepositions } from '../lib/questionTypography';

type Props = {
  question: string;
  testID: string;
  questionRef?: React.Ref<Text>;
};

// Вопрос, на который отвечает молящийся: в шторке ответа и в шторке записей,
// чтобы при голосовом ответе вопрос оставался перед глазами.
export default function QuestionHeader({ question, testID, questionRef }: Props) {
  const { t } = useI18n();
  const styles = useStyles(stylesFactory);
  return (
    <View style={styles.header}>
      <View style={styles.orbRow}>
        <View style={styles.orb} />
        <Text style={styles.orbLabel}>{t('components.answers.question')}</Text>
      </View>
      <Text ref={questionRef} style={styles.question} testID={testID}>
        {keepShortPrepositions(question)}
      </Text>
    </View>
  );
}

const stylesFactory = () => StyleSheet.create({
  header: {
    flexShrink: 1,
  },
  orbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sc(4),
    marginBottom: sc(8),
  },
  orb: {
    width: sc(9),
    height: sc(9),
    borderRadius: sc(5),
    backgroundColor: '#6fae93',
  },
  orbLabel: {
    fontFamily: fonts.mono,
    fontSize: sc(9),
    letterSpacing: sc(1.4),
    color: 'rgba(170,210,190,.65)',
  },
  question: {
    fontFamily: fonts.serif,
    fontSize: sc(16),
    lineHeight: sc(22),
    color: colors.cream,
    textAlign: 'center',
    marginBottom: sc(12),
  },
});
