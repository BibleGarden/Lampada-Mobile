// Плотности экрана «Перед началом» в px прототипа, от исходного макета к самой
// плотной: поля и промежутки брифинга, размер кнопки «Начать» и воздух под ней.
// Кегль не меняется — высоту освобождают декоративные интервалы и кнопка.
export const THRESHOLD_DENSITIES = [
  { padding: 16, gap: 12, button: 158, bottom: 34 },
  { padding: 8, gap: 8, button: 136, bottom: 34 },
  { padding: 4, gap: 6, button: 136, bottom: 12 },
] as const;

export type ThresholdDensity = (typeof THRESHOLD_DENSITIES)[number];

type Measured = {
  /** высота блока под шапкой: брифинг, кнопка и воздух под ней */
  mainHeight: number;
  /** высота заголовка и пунктов вместе с промежутками между ними */
  briefHeight: number;
  /** число промежутков в брифинге */
  gaps: number;
  /** плотность, при которой сняты высоты */
  density: ThresholdDensity;
};

/**
 * Первая по порядку плотность, при которой брифинг целиком помещается над
 * кнопкой: пока помещается исходный макет, он и остаётся. `overflow` — не
 * помещается и самая плотная: тогда брифинг прокручивается.
 */
export function fitThresholdDensity(
  { mainHeight, briefHeight, gaps, density }: Measured,
  sc: (v: number) => number,
): { density: ThresholdDensity; overflow: boolean } {
  const text = briefHeight - gaps * sc(density.gap);
  const fits = ({ padding, gap, button, bottom }: ThresholdDensity) =>
    text + gaps * sc(gap) + 2 * sc(padding) + sc(button) + sc(bottom) <= mainHeight;
  const fitted = THRESHOLD_DENSITIES.find(fits);
  return fitted
    ? { density: fitted, overflow: false }
    : { density: THRESHOLD_DENSITIES[THRESHOLD_DENSITIES.length - 1], overflow: true };
}
