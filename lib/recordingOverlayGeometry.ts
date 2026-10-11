type RecordingOverlayFit = { gap: number; waveHeight: number };

/** Уменьшает промежутки и волну только тогда, когда замеренная шторка тесна. */
export function fitRecordingOverlay(
  availableHeight: number,
  textHeight: number,
  gapCount: number,
  preferredGap: number,
  minimumGap: number,
  preferredWaveHeight: number,
  minimumWaveHeight: number,
): RecordingOverlayFit {
  const room = Math.max(0, availableHeight - textHeight);
  const gap = Math.max(minimumGap, Math.min(preferredGap, (room - preferredWaveHeight) / gapCount));
  const waveHeight = Math.max(minimumWaveHeight, Math.min(preferredWaveHeight, room - gap * gapCount));
  return { gap, waveHeight };
}
