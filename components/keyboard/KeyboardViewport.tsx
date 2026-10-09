import React from 'react';
import { StyleSheet, View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardLayout } from '../../lib/useKeyboardLayout';

// Единственный владелец доступной области обычной формы или нативного Modal.
// Внутренний flex-контейнер ограничивает также absoluteFill-шторки:
// сами абсолютные дети не обязаны учитывать padding внешнего View.
// Шторка (overlay) и её фон доходят до края экрана: нижнюю безопасную
// зону она отдаёт своему footer, а не всему контейнеру.
export default function KeyboardViewport({ children, style, contentContainerStyle, overlay = false, ...props }: ViewProps & { contentContainerStyle?: StyleProp<ViewStyle>; overlay?: boolean }) {
  const layout = useKeyboardLayout();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      {...props}
      pointerEvents={props.pointerEvents ?? (overlay ? 'box-none' : 'auto')}
      automaticOffset
      behavior="padding"
      enabled={layout.kind !== 'floating'}
      style={[styles.fill, overlay && StyleSheet.absoluteFill, style]}
    >
      <View pointerEvents={overlay ? 'box-none' : 'auto'} style={[styles.fill, { paddingBottom: overlay || layout.kind === 'docked' ? 0 : insets.bottom }]}>
        <View pointerEvents={overlay ? 'box-none' : 'auto'} style={[styles.fill, contentContainerStyle]}>{children}</View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
