import React, { useEffect, useMemo } from 'react';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  RoundedRect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '../lib/theme';

type Props = {
  /** Ширина холста; всё масштабируется от неё */
  width?: number;
  /** Огонёк горит (true) или тлеет углём в ожидании (false) */
  lit?: boolean;
};

// Огонёк лампады: гало + пламя-капля + чаша.
// Дрожание — сумма синусоид с некратными частотами, чтобы глаз не ловил повтор.
export default function Flame({ width = 240, lit = true }: Props) {
  const W = width;
  const H = width * 1.17;
  const cx = W / 2;
  const bowlTop = H * 0.72;
  const flameH = W * 0.14 * (lit ? 1 : 0.45);
  const flameW = W * 0.1 * (lit ? 1 : 0.6);
  const flameBase = bowlTop + 4;

  // t — «часы» анимации, крутятся всегда
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(
      withTiming(Math.PI * 2 * 1000, { duration: 1000_000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [t]);

  const flamePath = useMemo(() => {
    const p = Skia.Path.Make();
    // капля: основание на flameBase, вершина выше на flameH*2.4
    const tip = flameBase - flameH * 2.4;
    p.moveTo(cx, tip);
    p.cubicTo(cx + flameW * 0.9, tip + flameH * 0.9, cx + flameW, flameBase - flameH * 0.5, cx, flameBase);
    p.cubicTo(cx - flameW, flameBase - flameH * 0.5, cx - flameW * 0.9, tip + flameH * 0.9, cx, tip);
    p.close();
    return p;
  }, [cx, flameBase, flameH, flameW]);

  const flameTransform = useDerivedValue(() => {
    if (!lit) {
      const pulse = 1 + Math.sin(t.value * 2.4) * 0.04;
      return [{ scaleY: pulse }, { scale: 1 }];
    }
    const sway = Math.sin(t.value * 2.1) * 0.035 + Math.sin(t.value * 3.7) * 0.02;
    const stretch = 1 + Math.sin(t.value * 5.3) * 0.045 + Math.sin(t.value * 8.1) * 0.02;
    return [{ rotate: sway }, { scaleY: stretch }];
  });

  const haloR = W * 0.5;
  const haloTransform = useDerivedValue(() => {
    const k = 1 + Math.sin(t.value * (lit ? 1.05 : 0.7)) * 0.08;
    return [{ scale: k }];
  });
  const haloOpacity = useDerivedValue(() =>
    (lit ? 0.62 : 0.3) + Math.sin(t.value * 1.05) * (lit ? 0.14 : 0.06),
  );

  const glowOpacity = useDerivedValue(
    () => (lit ? 0.85 : 0.5) + Math.sin(t.value * 4.4) * 0.1,
  );

  const flameOrigin = useMemo(() => vec(cx, flameBase), [cx, flameBase]);

  return (
    <Canvas style={{ width: W, height: H }}>
      {/* гало */}
      <Group origin={vec(cx, bowlTop - flameH)} transform={haloTransform}>
        <Circle cx={cx} cy={bowlTop - flameH} r={haloR} opacity={haloOpacity}>
          <RadialGradient
            c={vec(cx, bowlTop - flameH)}
            r={haloR}
            colors={[colors.haloGlow, 'rgba(230,140,40,0)']}
          />
        </Circle>
      </Group>

      {/* свечение пламени (размытая копия) */}
      <Group origin={flameOrigin} transform={flameTransform}>
        <Path path={flamePath} opacity={glowOpacity}>
          <RadialGradient
            c={vec(cx, flameBase - flameH)}
            r={flameH * 2.6}
            colors={[colors.flameMid, 'rgba(214,96,26,0)']}
          />
          <BlurMask blur={lit ? 14 : 8} style="normal" />
        </Path>
        {/* само пламя */}
        <Path path={flamePath}>
          <RadialGradient
            c={vec(cx, flameBase - flameH * 0.7)}
            r={flameH * 2.2}
            colors={[colors.flameCore, colors.flameMid, colors.flameEdge]}
            positions={[0, 0.4, 1]}
          />
        </Path>
      </Group>

      {/* чаша лампады */}
      <Group>
        <RoundedRect
          x={cx - W * 0.25}
          y={bowlTop}
          width={W * 0.5}
          height={W * 0.175}
          r={W * 0.09}
        >
          <LinearGradient
            start={vec(cx, bowlTop)}
            end={vec(cx, bowlTop + W * 0.175)}
            colors={[colors.bowlTop, colors.bowlBottom]}
          />
        </RoundedRect>
        {/* блик на кромке */}
        <RoundedRect
          x={cx - W * 0.25}
          y={bowlTop}
          width={W * 0.5}
          height={4}
          r={2}
          opacity={0.35}
          color="rgba(255,200,120,1)"
        >
          <BlurMask blur={3} style="normal" />
        </RoundedRect>
      </Group>
    </Canvas>
  );
}
