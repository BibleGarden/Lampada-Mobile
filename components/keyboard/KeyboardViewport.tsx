import React from 'react';
import { StyleSheet, View, type ViewProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pendingKeyboardReserve } from '../../lib/keyboardGeometry';
import { useKeyboardFrames } from '../../lib/useKeyboardLayout';

// The sole owner of the available area of a plain form and a native Modal.
// Each viewport fills the window down to the bottom edge, so the bottom
// reserves max(safe area, keyboard) as a single UI-thread value. A scrollable
// screen may move the safe area into its own contentContainer.
// The inner flex container also constrains absoluteFill children:
// they need not account for the outer View's padding themselves.
// Sheets are not included here: their reserve is held by the footer (KeyboardSheet).
export default function KeyboardViewport({ children, style, contentContainerStyle, safeAreaInContent = false, ...props }: ViewProps & {
  contentContainerStyle?: StyleProp<ViewStyle>;
  safeAreaInContent?: boolean;
}) {
  const safeBottom = useSafeAreaInsets().bottom;
  const keyboard = useKeyboardFrames().reserved;
  // A scrollable screen may keep the safe area in its own contentContainer:
  // then the empty bottom strip does not clip its visible area.
  const reserved = useAnimatedStyle(() => ({
    paddingBottom: Math.max(safeAreaInContent ? 0 : safeBottom, keyboard.value),
  }), [safeAreaInContent, safeBottom]);
  return (
    <Animated.View {...props} style={[styles.fill, style, reserved]}>
      <View style={[styles.fill, contentContainerStyle]}>{children}</View>
    </Animated.View>
  );
}

// A strip below the field that fills the form above a docked keyboard:
// the space the opening keyboard will still take in KeyboardViewport
// (pendingKeyboardReserve). Only the editing layout mounts it.
export function KeyboardPendingSpace() {
  const safeBottom = useSafeAreaInsets().bottom;
  const { reserved, target } = useKeyboardFrames();
  const pending = useAnimatedStyle(() => ({
    height: pendingKeyboardReserve(safeBottom, reserved.value, target.value),
  }), [safeBottom]);
  return <Animated.View style={pending} pointerEvents="none" />;
}

const styles = StyleSheet.create({ fill: { flex: 1, minHeight: 0 } });
