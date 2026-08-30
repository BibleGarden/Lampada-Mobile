import { useCallback, useEffect, useRef, useState } from 'react';
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
  const open = useRef(false);
  const latestGeometry = useRef(geometry);
  latestGeometry.current = geometry;

  useEffect(() => {
    if (!open.current) setMountKey(geometry);
  }, [geometry]);

  const onIndexChange = useCallback((index: number) => {
    open.current = index >= 0;
    if (index < 0) setMountKey(latestGeometry.current);
  }, []);

  return { mountKey, onIndexChange };
}
