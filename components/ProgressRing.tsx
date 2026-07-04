import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, SharedValue } from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size: number;
  strokeWidth?: number;
  /** 0..1 — заполнение кольца */
  progress: SharedValue<number>;
  trackColor?: string;
  color?: string;
  /** Градиентная обводка (как у hold-кнопки в прототипе) */
  gradient?: [string, string];
};

// Кольцо прогресса: круг с анимируемым strokeDashoffset, повёрнутый на -90°
export default function ProgressRing({
  size,
  strokeWidth = 3,
  progress,
  trackColor = 'rgba(255,255,255,.07)',
  color = 'rgba(230,162,60,.85)',
  gradient,
}: Props) {
  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const gradId = React.useId();

  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      {gradient && (
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient[0]} />
            <Stop offset="1" stopColor={gradient[1]} />
          </LinearGradient>
        </Defs>
      )}
      <Circle cx={c} cy={c} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      <AnimatedCircle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={gradient ? `url(#${gradId})` : color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference}`}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
