import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import {
  buildScriptureTextSegments,
  type ScriptureDisplay,
} from '../lib/scripture';
import { colors, fonts, sc } from '../lib/theme';

type Props = {
  scripture: ScriptureDisplay;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testIDPrefix: string;
  activeVerseNumber?: number | null;
};

export default function ScripturePassageText({
  scripture,
  style,
  numberOfLines,
  testIDPrefix,
  activeVerseNumber,
}: Props) {
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

const styles = StyleSheet.create({
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
