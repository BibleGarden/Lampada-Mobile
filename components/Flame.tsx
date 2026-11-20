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
import { FLAME_HEIGHT_RATIO } from '../lib/flameGeometry';
import { colors } from '../lib/theme';
import { useVisibleScreen } from '../lib/useVisibleScreen';

type Props = {
  /** Canvas width; everything scales from it */
  width?: number;
  /** The flame burns (true) or smolders as an ember while waiting (false) */
  lit?: boolean;
  /** Only the flame with its halo, no bowl — a warm ember on the reflection screen */
  ember?: boolean;
  /** Freeze the animation on the current frame */
  paused?: boolean;
};

// Deterministic value noise: smooth fractal noise with no period.
// hash gives pseudo-random nodes with smoothstep interpolation between them;
// fbm is three octaves. The result lies in [-1, 1], continuous and "breathing"
// like a recording of a real fire, not a sum of sine waves.
const hash = (n: number) => {
  'worklet';
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

const vnoise = (x: number) => {
  'worklet';
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
};

const wave = (tt: number) => {
  'worklet';
  const x = tt * 0.55; // base jitter speed
  const n =
    vnoise(x) * 0.55 + vnoise(x * 2.17 + 7.3) * 0.3 + vnoise(x * 4.31 + 13.7) * 0.15;
  return (n * 2 - 1) * 1.6;
};

// A "draft" envelope: also noise, but very slow. Quiet most of the time,
// with an occasional flurry; the intervals are uneven.
const gust = (tt: number) => {
  'worklet';
  const s = vnoise(tt * 0.045 + 51.3);
  return 0.25 + 0.75 * s * s;
};

// A vigil lamp flame: halo + "egg"-shaped flame + bright core at the wick + shallow bowl.
// t advances 2π per second, so sin(t·k) has a period of 1/k seconds.
//
// The "liveliness" works like this:
// - disturbance climbs the flame bottom-up: the tip repeats the "waist's"
//   motion with a ~200 ms lag (a wave, not a hinge);
// - the height breathes: the flame grows slightly and settles with the gusts;
// - the core at the wick is nearly still — only the shell dances;
// - the halo is lit by the same signal; the light responds to the flickers.
export default function Flame({ width = 240, lit = true, ember = false, paused = false }: Props) {
  const visible = useVisibleScreen();
  const W = width;
  const H = ember ? width : width * FLAME_HEIGHT_RATIO;
  // the canvas is larger than the footprint: the halo must dissolve,
  // not get clipped by the Canvas rectangle at the edge
  const pad = W * 0.45;
  const cx = pad + W / 2;
  const bowlTop = pad + H * 0.72;
  const bowlH = W * 0.195;
  const bowlHW = W * 0.285;

  // in the prototype the bowl is 120 and the flame 36×62 / 24×34, but live
  // the flame dwarfed the bowl: the bowl here is larger than in the prototype,
  // the burning flame more modest, the unlit one tiny. The reflection ember is 22×32 at 104
  const flameH = ember ? W * 0.31 : lit ? W * 0.225 : W * 0.117;
  const flameRW = ember ? W * 0.106 : lit ? W * 0.066 : W * 0.042;
  const flameBase = ember ? pad + H * 0.66 : bowlTop + W / 60;
  const flameMidY = flameBase - flameH * 0.5;

  // t is the animation's "clock"; a hidden screen creates no new Skia paths.
  const t = useSharedValue(0);
  useEffect(() => {
    // Pausing the frame assembly keeps the current frame; a reset is only
    // needed on start: the repeat runs from the start value, and without it
    // the flame would slow down.
    if (!visible || paused) return;
    t.value = 0;
    t.value = withRepeat(
      withTiming(Math.PI * 2 * 1000, { duration: 1000_000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [t, paused, visible]);

  // shell: an egg with a wandering tip and breathing height.
  // The waist moves "now", the tip with a 1.2 rad (~190 ms) lag:
  // the disturbance is born at the wick and travels upward.
  const flamePath = useDerivedValue(() => {
    const env = gust(t.value);
    const amp = flameRW * (lit ? 0.5 : 0.38) * env;
    const mid = wave(t.value) * amp * 0.35;
    const tip = wave(t.value - 1.2) * amp;
    const hh = flameH * (1 + env * 0.1 * (vnoise(t.value * 0.31 + 29.1) * 2 - 1));

    const yt = flameBase - hh;
    const ym = yt + hh * 0.45;
    const upper = tip * 0.55 + mid * 0.35;

    const b = Skia.PathBuilder.Make();
    b.moveTo(cx + tip, yt);
    b.cubicTo(
      cx + flameRW * 0.8 + upper, yt + hh * 0.08,
      cx + flameRW + mid, yt + hh * 0.25,
      cx + flameRW + mid * 0.5, ym,
    );
    b.cubicTo(
      cx + flameRW, flameBase - hh * 0.2,
      cx + flameRW * 0.55, flameBase,
      cx, flameBase,
    );
    b.cubicTo(
      cx - flameRW * 0.55, flameBase,
      cx - flameRW, flameBase - hh * 0.2,
      cx - flameRW + mid * 0.5, ym,
    );
    b.cubicTo(
      cx - flameRW + mid, yt + hh * 0.25,
      cx - flameRW * 0.8 + upper, yt + hh * 0.08,
      cx + tip, yt,
    );
    b.close();
    return b.detach();
  });

  // core at the wick: small, bright, nearly still
  const corePath = useDerivedValue(() => {
    const env = gust(t.value);
    const sway = wave(t.value) * flameRW * (lit ? 0.5 : 0.38) * env * 0.18;
    const ch = flameH * 0.5 * (1 + env * 0.05 * (vnoise(t.value * 0.31 + 29.1) * 2 - 1));
    const crw = flameRW * 0.45;
    const b = Skia.PathBuilder.Make();
    b.addOval(Skia.XYWHRect(cx - crw + sway, flameBase - ch, crw * 2, ch));
    return b.detach();
  });
  const coreOpacity = useDerivedValue(
    () => (lit ? 0.85 : 0.6) + (vnoise(t.value * 1.1 + 3.7) * 2 - 1) * 0.08,
  );

  // shallow bowl: flat top, half-ellipse below
  const bowlPath = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    const k = 0.5523; // Bezier constant for an ellipse arc
    b.moveTo(cx - bowlHW, bowlTop);
    b.lineTo(cx + bowlHW, bowlTop);
    b.cubicTo(cx + bowlHW, bowlTop + bowlH * k, cx + bowlHW * k, bowlTop + bowlH, cx, bowlTop + bowlH);
    b.cubicTo(cx - bowlHW * k, bowlTop + bowlH, cx - bowlHW, bowlTop + bowlH * k, cx - bowlHW, bowlTop);
    b.close();
    return b.detach();
  }, [cx, bowlTop, bowlH, bowlHW]);

  // quiet 2.6 s pulse; stretching upward, the flame narrows slightly —
  // volume is preserved and the pulse reads as the fire's oscillation
  const flameTransform = useDerivedValue(() => {
    const s =
      Math.sin(t.value * 0.385) * (lit ? 0.04 : 0.02) +
      Math.sin(t.value * 0.617) * 0.008;
    return [{ scaleY: 1.04 + s }, { scaleX: 1.04 - s * 0.6 }];
  });
  const flameOpacity = useDerivedValue(
    () => (lit ? 0.825 : 0.62) + Math.sin(t.value * 0.385) * (lit ? 0.125 : 0.09),
  );

  // halo: slow 6 s breathing + response to the flame's flickers
  const haloR = W * 0.5;
  const haloTransform = useDerivedValue(() => {
    const k = 1.08 + Math.sin(t.value * 0.167) * 0.08;
    return [{ scale: k }];
  });
  const haloOpacity = useDerivedValue(() => {
    const flick = wave(t.value) * gust(t.value);
    return (
      (lit ? 0.64 : 0.32) +
      Math.sin(t.value * 0.167) * (lit ? 0.12 : 0.06) +
      flick * (lit ? 0.05 : 0.03)
    );
  });

  const glowOpacity = useDerivedValue(
    () => (lit ? 0.7 : 0.42) + Math.sin(t.value * 0.385) * (lit ? 0.15 : 0.1),
  );
  // "motion blur": the faster the tip jerks, the more the glowing layer is
  // blurred — quick snaps read softly instead of waving like a flag
  const glowBlur = useDerivedValue(() => {
    const vel = Math.abs(wave(t.value) - wave(t.value - 0.35)) * gust(t.value);
    return (lit ? 11 : 9) + vel * (lit ? 9 : 6);
  });

  const flameOrigin = useMemo(() => vec(cx, flameBase), [cx, flameBase]);
  const haloCenter = useMemo(() => vec(cx, flameMidY), [cx, flameMidY]);

  return (
    <Canvas style={{ width: W + pad * 2, height: H + pad * 2, margin: -pad }}>
      {/* halo */}
      <Group origin={haloCenter} transform={haloTransform}>
        <Circle cx={cx} cy={flameMidY} r={haloR} opacity={haloOpacity}>
          <RadialGradient
            c={haloCenter}
            r={haloR}
            colors={[colors.haloGlow, 'rgba(230,140,40,0)']}
          />
        </Circle>
      </Group>

      {/* flame glow (blurred copy) */}
      <Group origin={flameOrigin} transform={flameTransform}>
        <Path path={flamePath} opacity={glowOpacity}>
          <RadialGradient
            c={vec(cx, flameMidY)}
            r={flameH * 1.6}
            colors={[colors.flameMid, 'rgba(214,96,26,0)']}
          />
          <BlurMask blur={glowBlur} style="normal" />
        </Path>
        {/* flame shell */}
        <Path path={flamePath} opacity={flameOpacity}>
          <RadialGradient
            c={vec(cx, flameBase - flameH * 0.3)}
            r={flameH * 0.8}
            colors={[colors.flameCore, colors.flameMid, colors.flameEdge]}
            positions={[0, 0.4, 1]}
          />
        </Path>
        {/* core at the wick */}
        <Path path={corePath} opacity={coreOpacity}>
          <RadialGradient
            c={vec(cx, flameBase - flameH * 0.18)}
            r={flameH * 0.45}
            colors={['#fff6dd', '#ffd27a', 'rgba(255,150,50,0)']}
            positions={[0, 0.55, 1]}
          />
          <BlurMask blur={2} style="normal" />
        </Path>
      </Group>

      {/* lamp bowl */}
      {!ember && (
        <Group>
          <Path path={bowlPath}>
            <LinearGradient
              start={vec(cx, bowlTop)}
              end={vec(cx, bowlTop + bowlH)}
              colors={[colors.bowlTop, colors.bowlBottom]}
            />
          </Path>
          {/* highlight on the rim */}
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
