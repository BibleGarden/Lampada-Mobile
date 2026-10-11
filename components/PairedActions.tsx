import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { screenReaderHiddenProps } from '../lib/a11y';

type Action = {
  label: string;
  /** Все состояния подписи: переключение действия не должно менять раскладку. */
  labels: readonly [string, ...string[]];
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  style: (pressed: boolean) => StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

type Props = {
  actions: readonly [Action, Action];
  labelStyle: StyleProp<TextStyle>;
  gap: number;
  style?: StyleProp<ViewStyle>;
};

/** Обе подписи сохраняют общий кегль: если одна не входит, ставим кнопки столбцом. */
export default function PairedActions({ actions, labelStyle, gap, style }: Props) {
  const [width, setWidth] = useState(0);
  const [measurement, setMeasurement] = useState({ key: '', lines: [0, 0] });
  const font = StyleSheet.flatten(labelStyle);
  const key = JSON.stringify([width, font, actions.map((action) => action.labels)]);
  const stateCount = Math.max(...actions.map((action) => action.labels.length));
  const measurementKey = useRef(key);
  measurementKey.current = key;
  const stacked = measurement.key === key && measurement.lines.some((lines) => lines > 1);

  return (
    <View style={style}>
      <View
        onLayout={({ nativeEvent }) => setWidth((current) => current === nativeEvent.layout.width ? current : nativeEvent.layout.width)}
        style={[styles.row, { gap }, stacked && styles.stacked]}
      >
        {width > 0 && (
          // Проба всегда измеряет исходную пару в строку: столбец не должен
          // отменять собственное решение, когда подписи в нём снова помещаются.
          <View
            pointerEvents="none"
            accessible={false}
            {...screenReaderHiddenProps(true)}
            style={styles.measure}
          >
            {Array.from({ length: stateCount }, (_, stateIndex) => (
              <View key={stateIndex} style={[styles.row, { gap }]}>
                {actions.map((action, index) => (
                  <View key={index} style={[action.style(false), styles.rowButton]}>
                    {action.icon}
                    <Text
                      key={key}
                      style={[labelStyle, action.labelStyle]}
                      onTextLayout={({ nativeEvent }) => {
                        if (measurementKey.current !== key) return;
                        const count = nativeEvent.lines.length;
                        const measurementIndex = stateIndex * actions.length + index;
                        setMeasurement((current) => {
                          const lines = current.key === key ? current.lines.slice() : Array<number>(stateCount * actions.length).fill(0);
                          if (current.key === key && lines[measurementIndex] === count) return current;
                          lines[measurementIndex] = count;
                          return { key, lines };
                        });
                      }}
                    >
                      {action.labels[Math.min(stateIndex, action.labels.length - 1)]}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
        {actions.map((action, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: !!action.disabled }}
            disabled={action.disabled}
            testID={action.testID}
            onPress={action.onPress}
            style={({ pressed }) => [action.style(pressed), stacked ? styles.stackedButton : styles.rowButton]}
          >
            {action.icon}
            <Text style={[labelStyle, action.labelStyle]}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  stacked: { flexDirection: 'column' },
  rowButton: { flex: 1 },
  stackedButton: { flex: 0, width: '100%' },
  measure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
});
