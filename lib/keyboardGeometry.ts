type KeyboardCoordinates = { screenY: number; height: number };

// Плавающая Android-клавиатура видима, но не занимает полосу окна:
// IME inset равен системной панели, а React Native передаёт высоту 0.
// Её screenY — низ окна, а не верх плавающей клавиатуры.
export function dockedKeyboardTop(coordinates: KeyboardCoordinates): number | null {
  return coordinates.height > 0 ? coordinates.screenY : null;
}
