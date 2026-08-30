import { useCallback, useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import type BottomSheet from '@gorhom/bottom-sheet';

// Сколько ждать после смены размеров окна. Позиция шторки считается от
// измеренной высоты контейнера, а не от размеров окна: в момент события
// вёрстка ещё может быть в старой ориентации.
const RELAYOUT_DELAY = 120;

/**
 * Возвращает шторку на место после смены геометрии окна.
 *
 * Закрытая шторка стоит на смещении, равном высоте контейнера. При повороте
 * контейнер становится выше, а смещение остаётся прежним — снизу выглядывает
 * полоса содержимого. `@gorhom/bottom-sheet` пересчитывает позицию по смене
 * snap-точек, но делает это в том же кадре, когда контейнер ещё измерен по
 * старой ориентации, и повторно уже не возвращается.
 *
 * Возвращает обработчик для `onChange`: чтобы пересадить шторку, нужно знать,
 * открыта она сейчас или закрыта.
 */
export function useSheetReflow(sheetRef: React.RefObject<BottomSheet | null>) {
  const { width, height } = useWindowDimensions();
  const index = useRef(-1);
  const mounted = useRef(false);

  useEffect(() => {
    // На первом рендере трогать нечего: шторка ещё не открывалась.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const id = setTimeout(() => {
      if (index.current < 0) sheetRef.current?.close();
      else sheetRef.current?.snapToIndex(index.current);
    }, RELAYOUT_DELAY);
    return () => clearTimeout(id);
  }, [height, sheetRef, width]);

  return useCallback((next: number) => {
    index.current = next;
  }, []);
}
