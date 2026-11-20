import { Keyboard } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

// The native controller closes the IME even after blur: React Native has
// already forgotten the field, while Android may still show its keyboard.
export function dismissKeyboard(): void {
  void KeyboardController.dismiss();
  // The controller's dismiss is a no-op when the IME is closed. Dismiss focus anyway.
  Keyboard.dismiss();
}
