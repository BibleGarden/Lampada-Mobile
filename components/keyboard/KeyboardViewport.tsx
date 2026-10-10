import React from 'react';
import { StyleSheet, View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReservedKeyboardHeight } from '../../lib/useKeyboardLayout';

// Единственный владелец доступной области обычной формы и нативного Modal.
// Каждый viewport занимает окно до нижнего края, поэтому снизу резервируется
// max(безопасная зона, клавиатура) одним значением UI-потока.
// Внутренний flex-контейнер ограничивает также absoluteFill-детей:
// сами они не обязаны учитывать padding внешнего View.
// Шторки сюда не входят: их резерв держит footer (KeyboardSheet).
export default function KeyboardViewport({ children, style, contentContainerStyle, ...props }: ViewProps & {
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const safeBottom = useSafeAreaInsets().bottom;
  const keyboard = useReservedKeyboardHeight();
  const reserved = useAnimatedStyle(() => ({ paddingBottom: Math.max(safeBottom, keyboard.value) }), [safeBottom]);
  return (
    <Animated.View {...props} style={[styles.fill, style, reserved]}>
      <View style={[styles.fill, contentContainerStyle]}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
