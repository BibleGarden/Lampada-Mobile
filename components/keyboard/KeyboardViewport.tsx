import React from 'react';
import { StyleSheet, View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pendingKeyboardReserve } from '../../lib/keyboardGeometry';
import { useKeyboardFrames } from '../../lib/useKeyboardLayout';

// Единственный владелец доступной области обычной формы и нативного Modal.
// Каждый viewport занимает окно до нижнего края, поэтому снизу резервируется
// max(безопасная зона, клавиатура) одним значением UI-потока. Прокручиваемый
// экран может перенести безопасную зону внутрь своего contentContainer.
// Внутренний flex-контейнер ограничивает также absoluteFill-детей:
// сами они не обязаны учитывать padding внешнего View.
// Шторки сюда не входят: их резерв держит footer (KeyboardSheet).
export default function KeyboardViewport({ children, style, contentContainerStyle, safeAreaInContent = false, ...props }: ViewProps & {
  contentContainerStyle?: StyleProp<ViewStyle>;
  safeAreaInContent?: boolean;
}) {
  const safeBottom = useSafeAreaInsets().bottom;
  const keyboard = useKeyboardFrames().reserved;
  // Прокручиваемый экран может держать safe area в собственном contentContainer:
  // тогда пустой нижний край не обрезает его видимую область.
  const reserved = useAnimatedStyle(() => ({
    paddingBottom: Math.max(safeAreaInContent ? 0 : safeBottom, keyboard.value),
  }), [safeAreaInContent, safeBottom]);
  return (
    <Animated.View {...props} style={[styles.fill, style, reserved]}>
      <View style={[styles.fill, contentContainerStyle]}>{children}</View>
    </Animated.View>
  );
}

// Полоса под полем, которое заполняет форму над закреплённой клавиатурой:
// место, которое открывающаяся клавиатура ещё займёт в KeyboardViewport
// (pendingKeyboardReserve). Её монтирует только раскладка редактирования.
export function KeyboardPendingSpace() {
  const safeBottom = useSafeAreaInsets().bottom;
  const { reserved, target } = useKeyboardFrames();
  const pending = useAnimatedStyle(() => ({
    height: pendingKeyboardReserve(safeBottom, reserved.value, target.value),
  }), [safeBottom]);
  return <Animated.View style={pending} pointerEvents="none" />;
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
