import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from 'react-native';

function animateKeyboardLayout(event: KeyboardEvent) {
  const duration = Math.max(event.duration ?? 0, 380);
  LayoutAnimation.configureNext({
    duration,
    update: { duration, type: LayoutAnimation.Types.keyboard },
  });
}

// Верхний край экранной клавиатуры в координатах экрана, пока она открыта,
// иначе null. По умолчанию раскладка анимируется вместе с клавиатурой;
// экран Setup отключает эту анимацию, чтобы нижние блоки появлялись на месте.
// Смена рамки открытой клавиатуры (поворот, смена раскладки) только обновляет значение.
export function useKeyboardTop(animateLayout = true): number | null {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      if (animateLayout) animateKeyboardLayout(event);
      setTop(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener(hideEvent, (event) => {
      if (animateLayout) animateKeyboardLayout(event);
      setTop(null);
    });
    const frame = Keyboard.addListener('keyboardDidChangeFrame', (event) => {
      setTop((current) => (current === null ? null : event.endCoordinates.screenY));
    });
    return () => {
      show.remove();
      hide.remove();
      frame.remove();
    };
  }, [animateLayout]);

  return top;
}
