import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from 'react-native';
import { keyboardLayoutFor, type KeyboardCoordinates } from './keyboardGeometry';

function animateKeyboardLayout(event: KeyboardEvent) {
  const duration = Math.max(event.duration ?? 0, 380);
  LayoutAnimation.configureNext({
    duration,
    update: { duration, type: LayoutAnimation.Types.keyboard },
  });
}

// Видимость клавиатуры и занятая ею область — разные признаки:
// плавающая клавиатура открыта, но не уменьшает доступное окно.
// По умолчанию раскладка анимируется вместе с клавиатурой;
// экран Setup отключает эту анимацию, чтобы нижние блоки появлялись на месте.
// Смена рамки открытой клавиатуры (поворот, смена раскладки) только обновляет значение.
export function useKeyboardLayout(animateLayout = true) {
  const [coordinates, setCoordinates] = useState<KeyboardCoordinates | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      if (animateLayout) animateKeyboardLayout(event);
      setCoordinates(event.endCoordinates);
    });
    const hide = Keyboard.addListener(hideEvent, (event) => {
      if (animateLayout) animateKeyboardLayout(event);
      setCoordinates(null);
    });
    const frame = Keyboard.addListener('keyboardDidChangeFrame', (event) => {
      setCoordinates((current) => (current === null ? null : event.endCoordinates));
    });
    return () => {
      show.remove();
      hide.remove();
      frame.remove();
    };
  }, [animateLayout]);

  return keyboardLayoutFor(coordinates);
}
