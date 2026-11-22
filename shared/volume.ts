/**
 * Converts a perceptual 0-100 UI volume slider value into a quadratic
 * Lavalink player volume (0-100) so low and mid volumes have smooth control.
 */
export function uiVolumeToLavalink(uiPercent: number): number {
  if (typeof uiPercent !== "number" || !Number.isFinite(uiPercent)) return 100;
  const clamped = Math.max(0, Math.min(100, Math.round(uiPercent)));
  if (clamped === 0) return 0;
  const curved = Math.round(((clamped / 100) ** 2) * 100);
  return Math.max(1, Math.min(100, curved));
}
