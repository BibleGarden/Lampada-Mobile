import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import {
  buildScriptureTextSegments,
  type ScriptureDisplay,
} from '../lib/scripture';
import { colors, fonts } from '../lib/theme';

type Props = {
  scripture: ScriptureDisplay;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  testIDPrefix: string;
};

export default function ScripturePassageText({
  scripture,
  style,
  numberOfLines,
  testIDPrefix,
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
            <Text style={styles.separator}>{segment.prefix}</Text>
          ) : null}
          <Text style={segment.highlighted ? styles.highlightedVerse : undefined}>
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
  highlightedVerse: {
    backgroundColor: 'rgba(231,207,149,.2)',
    color: colors.creamBright,
    fontFamily: fonts.serifRegular,
  },
});
