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
  /** Только пламя с гало, без чаши — тёплый уголёк на экране рефлексии */
  ember?: boolean;
};

// Огонёк лампады: гало + пламя-«яйцо» + чаша-плошка, как в прототипе.
// t идёт 2π в секунду, поэтому sin(t·k) имеет период 1/k секунд.
// Пульс — как emberFlicker из прототипа: 2.6 с, мягкий, без вращения.
export default function Flame({ width = 240, lit = true, ember = false }: Props) {
  const W = width;
  const H = ember ? width : width * 1.17;
  // холст больше занимаемого места: гало должно растворяться,
  // а не обрезаться прямоугольником по краю Canvas
  const pad = W * 0.45;
  const cx = pad + W / 2;
  const bowlTop = pad + H * 0.72;
  const bowlH = W * 0.175;
  const bowlHW = W * 0.25;

  // пламя: в прототипе 24×34 при чаше 120 — то есть W*0.1 × W*0.142;
  // уголёк на рефлексии крупнее относительно холста (22×32 при 104)
  const flameH = (ember ? W * 0.31 : W * 0.142) * (lit ? 1 : 0.6);
  const flameRW = (ember ? W * 0.106 : W * 0.05) * (lit ? 1 : 0.7);
  const flameBase = ember ? pad + H * 0.66 : bowlTop + W / 60;
  const flameMidY = flameBase - flameH * 0.5;

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

  // яйцо: купол сверху, чуть уже к основанию (border-radius из прототипа)
  const flamePath = useMemo(() => {
    const p = Skia.Path.Make();
    const yt = flameBase - flameH;
    const ym = yt + flameH * 0.45;
    p.moveTo(cx, yt);
    p.cubicTo(cx + flameRW * 0.8, yt + flameH * 0.08, cx + flameRW, yt + flameH * 0.25, cx + flameRW, ym);
    p.cubicTo(cx + flameRW, flameBase - flameH * 0.2, cx + flameRW * 0.55, flameBase, cx, flameBase);
    p.cubicTo(cx - flameRW * 0.55, flameBase, cx - flameRW, flameBase - flameH * 0.2, cx - flameRW, ym);
    p.cubicTo(cx - flameRW, yt + flameH * 0.25, cx - flameRW * 0.8, yt + flameH * 0.08, cx, yt);
    p.close();
    return p;
  }, [cx, flameBase, flameH, flameRW]);

  // чаша-плошка: плоский верх, полуэллипс снизу
  const bowlPath = useMemo(() => {
    const p = Skia.Path.Make();
    const k = 0.5523; // множитель Безье для дуги эллипса
    p.moveTo(cx - bowlHW, bowlTop);
    p.lineTo(cx + bowlHW, bowlTop);
    p.cubicTo(cx + bowlHW, bowlTop + bowlH * k, cx + bowlHW * k, bowlTop + bowlH, cx, bowlTop + bowlH);
    p.cubicTo(cx - bowlHW * k, bowlTop + bowlH, cx - bowlHW, bowlTop + bowlH * k, cx - bowlHW, bowlTop);
    p.close();
    return p;
  }, [cx, bowlTop, bowlH, bowlHW]);

  // тихий пульс 2.6 с (плюс едва заметная вторая волна, чтобы не было метронома)
  const flameTransform = useDerivedValue(() => {
    const pulse =
      1.04 + Math.sin(t.value * 0.385) * (lit ? 0.04 : 0.02) + Math.sin(t.value * 0.617) * 0.008;
    return [{ scale: pulse }];
  });
  const flameOpacity = useDerivedValue(
    () => (lit ? 0.825 : 0.6) + Math.sin(t.value * 0.385) * 0.125,
  );

  // гало дышит 6 секунд
  const haloR = W * 0.5;
  const haloTransform = useDerivedValue(() => {
    const k = 1.08 + Math.sin(t.value * 0.167) * 0.08;
    return [{ scale: k }];
  });
  const haloOpacity = useDerivedValue(() =>
    (lit ? 0.64 : 0.32) + Math.sin(t.value * 0.167) * (lit ? 0.14 : 0.06),
  );

  const glowOpacity = useDerivedValue(
    () => (lit ? 0.7 : 0.45) + Math.sin(t.value * 0.385) * 0.15,
  );

  const flameOrigin = useMemo(() => vec(cx, flameBase), [cx, flameBase]);
  const haloCenter = useMemo(() => vec(cx, flameMidY), [cx, flameMidY]);

  return (
    <Canvas style={{ width: W + pad * 2, height: H + pad * 2, margin: -pad }}>
      {/* гало */}
      <Group origin={haloCenter} transform={haloTransform}>
        <Circle cx={cx} cy={flameMidY} r={haloR} opacity={haloOpacity}>
          <RadialGradient
            c={haloCenter}
            r={haloR}
            colors={[colors.haloGlow, 'rgba(230,140,40,0)']}
          />
        </Circle>
      </Group>

      {/* свечение пламени (размытая копия) */}
      <Group origin={flameOrigin} transform={flameTransform}>
        <Path path={flamePath} opacity={glowOpacity}>
          <RadialGradient
            c={vec(cx, flameMidY)}
            r={flameH * 1.6}
            colors={[colors.flameMid, 'rgba(214,96,26,0)']}
          />
          <BlurMask blur={lit ? 12 : 7} style="normal" />
        </Path>
        {/* само пламя: яркое ядро внизу по центру, как в прототипе */}
        <Path path={flamePath} opacity={flameOpacity}>
          <RadialGradient
            c={vec(cx, flameBase - flameH * 0.3)}
            r={flameH * 0.8}
            colors={[colors.flameCore, colors.flameMid, colors.flameEdge]}
            positions={[0, 0.4, 1]}
          />
        </Path>
      </Group>

      {/* чаша лампады */}
      {!ember && (
        <Group>
          <Path path={bowlPath}>
            <LinearGradient
              start={vec(cx, bowlTop)}
              end={vec(cx, bowlTop + bowlH)}
              colors={[colors.bowlTop, colors.bowlBottom]}
            />
          </Path>
          {/* блик на кромке */}
          <RoundedRect
            x={cx - bowlHW}
            y={bowlTop}
            width={bowlHW * 2}
            height={4}
            r={2}
            opacity={0.35}
            color="rgba(255,200,120,1)"
          >
            <BlurMask blur={3} style="normal" />
          </RoundedRect>
        </Group>
      )}
    </Canvas>
  );
}
