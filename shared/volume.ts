/**
 * Converts a perceptual 0-100 UI volume slider value into a smooth logarithmic-like
 * Lavalink player volume (0-100) with distinct low-end steps (e.g. 10%->3, 50%->33, 100%->100).
 */
export function uiVolumeToLavalink(uiPercent: number): number {
  if (typeof uiPercent !== "number" || !Number.isFinite(uiPercent)) return 100;
  const clamped = Math.max(0, Math.min(100, Math.round(uiPercent)));
  if (clamped === 0) return 0;
  const curved = Math.round(((clamped / 100) ** 1.6) * 100);
  return Math.max(1, Math.min(100, curved));
}
