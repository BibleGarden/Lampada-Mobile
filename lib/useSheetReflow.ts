import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Rebuilds the sheet for new window geometry.
 *
 * A closed sheet sits at an offset equal to the container height. After a
 * rotation the container becomes taller while the offset stays from the old
 * orientation — a strip of content peeks out at the bottom.
 * `@gorhom/bottom-sheet` recalculates the position when snap points change,
 * but in the same frame where the container is still measured the old way,
 * and never comes back to it; the imperative `close()` does not help either —
 * it exits early when the target matches the current position, and that
 * position is exactly what went stale.
 *
 * So the sheet is not repaired but recreated: the new copy measures the
 * container itself. This is done while the sheet is closed — a closed one has
 * no state worth keeping — and one rotated while open is rebuilt right after
 * closing.
 */
export function useSheetReflow() {
  const { width, height } = useWindowDimensions();
  const geometry = `${width}x${height}`;
  const [mountKey, setMountKey] = useState(geometry);
  // State, not a ref: it also hides the closed sheet from screen readers
  // (see lib/a11y).
  const [open, setOpen] = useState(false);

  // a closed sheet is rebuilt both on rotation and right after closing
  useEffect(() => {
    if (!open) setMountKey(geometry);
  }, [geometry, open]);

  const onIndexChange = useCallback((index: number) => {
    setOpen(index >= 0);
  }, []);

  return { mountKey, open, onIndexChange };
}
