import React from 'react';
import { StyleSheet, View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardLayout } from '../../lib/useKeyboardLayout';

// Высота клавиатуры, которую резервирует viewport, — на UI-потоке, кадр в кадр
// с анимацией клавиатуры. Плавающая клавиатура не занимает полосу окна.
export function useReservedKeyboardHeight(enabled: boolean): SharedValue<number> {
  const layout = useKeyboardLayout();
  const { height } = useReanimatedKeyboardAnimation();
  const reserve = enabled && layout.kind !== 'floating';
  // height в Keyboard Controller отрицательна: это сдвиг вверх.
  return useDerivedValue(() => (reserve ? Math.max(0, -height.value) : 0), [reserve]);
}

// Единственный владелец доступной области обычной формы, нативного Modal
// и шторки. Каждый viewport занимает окно до нижнего края, поэтому снизу
// резервируется max(безопасная зона, клавиатура) одним значением UI-потока.
// Внутренний flex-контейнер ограничивает также absoluteFill-шторки:
// сами абсолютные дети не обязаны учитывать padding внешнего View.
// Шторка (overlay) и её фон доходят до края экрана: безопасную зону она
// отдаёт своему footer. Клавиатуру резервирует только открытая шторка
// (avoidKeyboard), чтобы контейнер закрытой не зависел от клавиатуры.
export default function KeyboardViewport({ children, style, contentContainerStyle, overlay = false, avoidKeyboard = true, onViewportLayout, ...props }: ViewProps & {
  contentContainerStyle?: StyleProp<ViewStyle>;
  overlay?: boolean;
  avoidKeyboard?: boolean;
  onViewportLayout?: ViewProps['onLayout'];
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useReservedKeyboardHeight(avoidKeyboard);
  const safeBottom = overlay ? 0 : insets.bottom;
  const reserved = useAnimatedStyle(() => ({ paddingBottom: Math.max(safeBottom, keyboard.value) }), [safeBottom]);
  return (
    <Animated.View
      {...props}
      pointerEvents={props.pointerEvents ?? (overlay ? 'box-none' : 'auto')}
      style={[styles.fill, overlay && StyleSheet.absoluteFill, style, reserved]}
    >
      <View onLayout={onViewportLayout} pointerEvents={overlay ? 'box-none' : 'auto'} style={[styles.fill, contentContainerStyle]}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
