// "Before starting" screen densities in prototype px, from the original
// layout to the densest: briefing paddings and gaps, the Start button size,
// and the air beneath it. The type size never changes — height is freed by
// the decorative spacing and the button.
export const THRESHOLD_DENSITIES = [
  { padding: 16, gap: 12, button: 158, bottom: 34 },
  { padding: 8, gap: 8, button: 136, bottom: 34 },
  { padding: 4, gap: 6, button: 136, bottom: 12 },
] as const;

export type ThresholdDensity = (typeof THRESHOLD_DENSITIES)[number];

type Measured = {
  /** height of the block below the header: briefing, button, and the air beneath it */
  mainHeight: number;
  /** height of the heading and items, including the gaps between them */
  briefHeight: number;
  /** number of gaps in the briefing */
  gaps: number;
  /** the density the heights were measured at */
  density: ThresholdDensity;
};

/**
 * The first density in order where the briefing fully fits above the button:
 * while the original layout fits, it stays. `overflow` — not even the densest
 * one fits: the briefing scrolls then.
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
