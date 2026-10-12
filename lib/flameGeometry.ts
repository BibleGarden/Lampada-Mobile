// Высота места, которое Flame с чашей занимает в раскладке, к его ширине.
// Поля под гало сюда не входят: их съедает отрицательный margin холста.
export const FLAME_HEIGHT_RATIO = 1.17;

/**
 * Ширина огонька, при которой он вместе с подписями помещается в свой блок.
 * Пока места хватает, огонёк остаётся в полном размере `preferredWidth`;
 * на низком окне он уменьшается с сохранением пропорций, а подписи
 * не меняются. Шаг 0.5 pt — как у `sc()`.
 */
export function fitFlameWidth(preferredWidth: number, freeHeight: number): number {
  if (preferredWidth * FLAME_HEIGHT_RATIO <= freeHeight) return preferredWidth;
  return Math.floor((Math.max(0, freeHeight) / FLAME_HEIGHT_RATIO) * 2) / 2;
}
