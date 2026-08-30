import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import {
  buildScriptureCompactText,
  buildScriptureTextSegments,
  type ScriptureDisplay,
} from '../lib/scripture';
import { colors, fonts, sc, useStyles } from '../lib/theme';

type Props = {
  scripture: ScriptureDisplay;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testIDPrefix: string;
  activeVerseNumber?: number | null;
  /**
   * `compact` — карточка: только выделенные сервером стихи и один цвет шрифта.
   * `full` — читалка: весь отрывок с подсветкой ключевых стихов.
   */
  variant?: 'full' | 'compact';
};

export default function ScripturePassageText({
  scripture,
  style,
  numberOfLines,
  testIDPrefix,
  activeVerseNumber,
  variant = 'full',
}: Props) {
  const styles = useStyles(stylesFactory);
  if (variant === 'compact') {
    const compact = buildScriptureCompactText(scripture);
    const compactTestID = compact.highlightedNumbers.length
      ? `${testIDPrefix}-${compact.highlightedNumbers.join('-')}`
      : undefined;
    return (
      <Text style={style} numberOfLines={numberOfLines} testID={compactTestID}>
        {compact.text}
      </Text>
    );
  }

  const segments = buildScriptureTextSegments(scripture.selection);

  if (!segments) {
    return <Text style={style} numberOfLines={numberOfLines}>{scripture.text}</Text>;
  }

  const highlightedNumbers = segments
    .filter((segment) => segment.highlighted)
    .map((segment) => segment.number);
  const highlightTestID = highlightedNumbers.length
    ? `${testIDPrefix}-${highlightedNumbers.join('-')}`
    : undefined;

  return (
    <Text style={style} numberOfLines={numberOfLines} testID={highlightTestID}>
      {segments.map((segment) => (
        <React.Fragment key={segment.number}>
          {segment.prefix ? (
            <Text
              style={segment.prefix === '\n\n' ? styles.paragraphGap : styles.separator}
            >
              {segment.prefix === '\n\n' ? '\n\u200B\n' : segment.prefix}
            </Text>
          ) : null}
          <Text
            style={[
              segment.highlighted && styles.highlightedVerse,
              segment.number === activeVerseNumber && styles.activeVerse,
            ]}
          >
            {segment.text}
          </Text>
        </React.Fragment>
      ))}
    </Text>
  );
}

const stylesFactory = () => StyleSheet.create({
  separator: {
    backgroundColor: 'transparent',
  },
  paragraphGap: {
    backgroundColor: 'transparent',
    fontSize: sc(1),
    lineHeight: sc(7),
  },
  highlightedVerse: {
    color: colors.amberBright,
    fontFamily: fonts.serifSemiBold,
  },
  activeVerse: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
    textDecorationColor: 'rgba(231,207,149,.56)',
  },
});
