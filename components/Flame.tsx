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

// Детерминированный value-noise: гладкий фрактальный шум без периода.
// hash — псевдослучайные узлы, между ними smoothstep-интерполяция;
// fbm — три октавы. Результат в [-1, 1], непрерывный и «дышащий»,
// как запись настоящего огня, а не сумма синусоид.
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
  const x = tt * 0.55; // базовая скорость дрожания
  const n =
    vnoise(x) * 0.55 + vnoise(x * 2.17 + 7.3) * 0.3 + vnoise(x * 4.31 + 13.7) * 0.15;
  return (n * 2 - 1) * 1.6;
};

// Огибающая-«сквозняк»: тоже шум, но очень медленный. Большую часть
// времени тихо, изредка — оживление; интервалы неравномерные.
const gust = (tt: number) => {
  'worklet';
  const s = vnoise(tt * 0.045 + 51.3);
  return 0.25 + 0.75 * s * s;
};

// Огонёк лампады: гало + пламя-«яйцо» + яркое ядро у фитиля + чаша-плошка.
// t идёт 2π в секунду, поэтому sin(t·k) имеет период 1/k секунд.
//
// «Живость» построена так:
// - возмущение поднимается по пламени снизу вверх: кончик повторяет
//   движение «талии» с запаздыванием ~200 мс (волна, а не шарнир);
// - высота дышит: пламя чуть подрастает и оседает вместе с порывами;
// - ядро у фитиля почти неподвижно — танцует только оболочка;
// - гало подсвечивается тем же сигналом, свет отзывается на вздрагивания.
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

  // размеры из прототипа (чаша 120 = W/2, т.е. 1 px прототипа = W/240):
  // скромное горение (до молитвы) — 24×34, разгоревшееся (после) — 36×62,
  // уголёк на рефлексии — 22×32 при холсте 104
  const flameH = ember ? W * 0.31 : lit ? W * 0.258 : W * 0.142;
  const flameRW = ember ? W * 0.106 : lit ? W * 0.075 : W * 0.05;
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

  // оболочка: яйцо с блуждающим кончиком и дышащей высотой.
  // Талия движется «сейчас», кончик — с запаздыванием 1.2 рад (~190 мс):
  // возмущение рождается у фитиля и уходит вверх.
  const flamePath = useDerivedValue(() => {
    const env = gust(t.value);
    const amp = flameRW * (lit ? 0.5 : 0.38) * env;
    const mid = wave(t.value) * amp * 0.35;
    const tip = wave(t.value - 1.2) * amp;
    const hh = flameH * (1 + env * 0.1 * (vnoise(t.value * 0.31 + 29.1) * 2 - 1));

    const yt = flameBase - hh;
    const ym = yt + hh * 0.45;
    const upper = tip * 0.55 + mid * 0.35;

    const p = Skia.Path.Make();
    p.moveTo(cx + tip, yt);
    p.cubicTo(
      cx + flameRW * 0.8 + upper, yt + hh * 0.08,
      cx + flameRW + mid, yt + hh * 0.25,
      cx + flameRW + mid * 0.5, ym,
    );
    p.cubicTo(
      cx + flameRW, flameBase - hh * 0.2,
      cx + flameRW * 0.55, flameBase,
      cx, flameBase,
    );
    p.cubicTo(
      cx - flameRW * 0.55, flameBase,
      cx - flameRW, flameBase - hh * 0.2,
      cx - flameRW + mid * 0.5, ym,
    );
    p.cubicTo(
      cx - flameRW + mid, yt + hh * 0.25,
      cx - flameRW * 0.8 + upper, yt + hh * 0.08,
      cx + tip, yt,
    );
    p.close();
    return p;
  });

  // ядро у фитиля: маленькое, яркое, почти неподвижное
  const corePath = useDerivedValue(() => {
    const env = gust(t.value);
    const sway = wave(t.value) * flameRW * (lit ? 0.5 : 0.38) * env * 0.18;
    const ch = flameH * 0.5 * (1 + env * 0.05 * (vnoise(t.value * 0.31 + 29.1) * 2 - 1));
    const crw = flameRW * 0.45;
    const p = Skia.Path.Make();
    p.addOval(Skia.XYWHRect(cx - crw + sway, flameBase - ch, crw * 2, ch));
    return p;
  });
  const coreOpacity = useDerivedValue(
    () => (lit ? 0.85 : 0.72) + (vnoise(t.value * 1.1 + 3.7) * 2 - 1) * 0.08,
  );

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

  // тихий пульс 2.6 с; вытягиваясь вверх, пламя чуть сужается —
  // объём сохраняется, и пульс читается как колебание огня
  const flameTransform = useDerivedValue(() => {
    const s =
      Math.sin(t.value * 0.385) * (lit ? 0.04 : 0.02) +
      Math.sin(t.value * 0.617) * 0.008;
    return [{ scaleY: 1.04 + s }, { scaleX: 1.04 - s * 0.6 }];
  });
  const flameOpacity = useDerivedValue(
    () => (lit ? 0.825 : 0.72) + Math.sin(t.value * 0.385) * 0.125,
  );

  // гало: медленное дыхание 6 с + отклик на вздрагивания пламени
  const haloR = W * 0.5;
  const haloTransform = useDerivedValue(() => {
    const k = 1.08 + Math.sin(t.value * 0.167) * 0.08;
    return [{ scale: k }];
  });
  const haloOpacity = useDerivedValue(() => {
    const flick = wave(t.value) * gust(t.value);
    return (
      (lit ? 0.64 : 0.46) +
      Math.sin(t.value * 0.167) * (lit ? 0.12 : 0.09) +
      flick * (lit ? 0.05 : 0.03)
    );
  });

  const glowOpacity = useDerivedValue(
    () => (lit ? 0.7 : 0.55) + Math.sin(t.value * 0.385) * 0.15,
  );
  // «смаз движения»: чем быстрее дёргается кончик, тем сильнее размыт
  // светящийся слой — быстрые рывки читаются мягко, а не машут флагом
  const glowBlur = useDerivedValue(() => {
    const vel = Math.abs(wave(t.value) - wave(t.value - 0.35)) * gust(t.value);
    return (lit ? 11 : 9) + vel * (lit ? 9 : 6);
  });

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
          <BlurMask blur={glowBlur} style="normal" />
        </Path>
        {/* оболочка пламени */}
        <Path path={flamePath} opacity={flameOpacity}>
          <RadialGradient
            c={vec(cx, flameBase - flameH * 0.3)}
            r={flameH * 0.8}
            colors={[colors.flameCore, colors.flameMid, colors.flameEdge]}
            positions={[0, 0.4, 1]}
          />
        </Path>
        {/* ядро у фитиля */}
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
