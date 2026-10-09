export type KeyboardCoordinates = { screenY: number; height: number };

// Плавающая Android-клавиатура видима, но не занимает полосу окна:
// IME inset равен системной панели, а React Native передаёт высоту 0.
// Её screenY — низ окна, а не верх плавающей клавиатуры.
export function keyboardLayoutFor(coordinates: KeyboardCoordinates | null) {
  return {
    visible: coordinates !== null,
    top: coordinates && coordinates.height > 0 ? coordinates.screenY : null,
  };
}
