import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Fill, RadialGradient, vec } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

// Background radial gradient, as in the prototype.
// variant 'home' — a warm hearth low in the center; 'screen' — a muted one at the top.
export default function ScreenBg({ variant = 'screen' }: { variant?: 'home' | 'screen' }) {
  const size = useSharedValue({ width: 0, height: 0 });
  const home = variant === 'home';
  // The gradient geometry follows the Canvas on the UI thread even when JS is busy.
  const c = useDerivedValue(() =>
    vec(size.value.width / 2, size.value.height * (home ? 0.52 : 0.12)),
  );
  const r = useDerivedValue(() => home ? size.value.width * 1.1 : size.value.height * 0.8);
  const colors = home
    ? ['#2a1c0e', '#120b06', '#080604']
    : ['#1a1510', '#100c08', '#0a0806'];
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" onSize={size}>
      <Fill>
        <RadialGradient c={c} r={r} colors={colors} positions={[0, 0.55, 1]} />
      </Fill>
    </Canvas>
  );
}
