// The layout height of the Flame with its bowl, relative to its width.
// The halo padding is not included: the canvas's negative margin consumes it.
export const FLAME_HEIGHT_RATIO = 1.17;

/**
 * The flame width at which it fits its block together with its captions.
 * While there is room, the flame keeps its full `preferredWidth`; in a
 * short window it shrinks proportionally, while the captions stay
 * unchanged. The 0.5 pt step matches `sc()`.
 */
export function fitFlameWidth(preferredWidth: number, freeHeight: number): number {
  if (preferredWidth * FLAME_HEIGHT_RATIO <= freeHeight) return preferredWidth;
  return Math.floor((Math.max(0, freeHeight) / FLAME_HEIGHT_RATIO) * 2) / 2;
}
