import { Keyboard } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

// Нативный контроллер закрывает IME даже после blur: React Native уже
// забывает поле, тогда как Android ещё может показывать его клавиатуру.
export function dismissKeyboard(): void {
  void KeyboardController.dismiss();
  // dismiss контроллера — no-op при закрытом IME. Фокус всё равно снимаем.
  Keyboard.dismiss();
}
