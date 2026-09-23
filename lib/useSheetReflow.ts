import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Пересобирает шторку под новую геометрию окна.
 *
 * Закрытая шторка стоит на смещении, равном высоте контейнера. После поворота
 * контейнер становится выше, а смещение остаётся от прежней ориентации — снизу
 * выглядывает полоса содержимого. `@gorhom/bottom-sheet` пересчитывает позицию
 * по смене snap-точек, но делает это в том же кадре, когда контейнер ещё
 * измерен по-старому, и повторно уже не возвращается; императивный `close()`
 * тоже не помогает — он выходит раньше, когда цель совпадает с текущей
 * позицией, а протухла как раз она.
 *
 * Поэтому шторку не чиним, а пересоздаём: новая копия измеряет контейнер сама.
 * Делаем это, пока шторка закрыта — у закрытой нет состояния, которое стоило бы
 * сохранять, а повёрнутую открытой пересобираем сразу после закрытия.
 */
export function useSheetReflow() {
  const { width, height } = useWindowDimensions();
  const geometry = `${width}x${height}`;
  const [mountKey, setMountKey] = useState(geometry);
  // Состояние, а не ref: по нему закрытую шторку ещё и прячут от программ
  // чтения с экрана (см. lib/a11y).
  const [open, setOpen] = useState(false);

  // закрытую — пересобираем и при повороте, и сразу после закрытия
  useEffect(() => {
    if (!open) setMountKey(geometry);
  }, [geometry, open]);

  const onIndexChange = useCallback((index: number) => {
    setOpen(index >= 0);
  }, []);

  return { mountKey, open, onIndexChange };
}
