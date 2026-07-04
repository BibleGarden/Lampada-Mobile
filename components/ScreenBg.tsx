import React from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Rect, RadialGradient, vec } from '@shopify/react-native-skia';
import { useWindowDimensions } from 'react-native';

// Радиальный градиент фона, как в прототипе.
// variant 'home' — тёплый очаг снизу-по-центру; 'screen' — приглушённый сверху.
export default function ScreenBg({ variant = 'screen' }: { variant?: 'home' | 'screen' }) {
  const { width, height } = useWindowDimensions();
  const home = variant === 'home';
  const c = home ? vec(width / 2, height * 0.52) : vec(width / 2, height * 0.12);
  const r = home ? width * 1.1 : height * 0.8;
  const colors = home
    ? ['#2a1c0e', '#120b06', '#080604']
    : ['#1a1510', '#100c08', '#0a0806'];
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0} y={0} width={width} height={height}>
        <RadialGradient c={c} r={r} colors={colors} positions={[0, 0.55, 1]} />
      </Rect>
    </Canvas>
  );
}
