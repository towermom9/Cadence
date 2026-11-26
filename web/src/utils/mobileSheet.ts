export const MOBILE_SHEET_FULL_Y = 68;
export const MOBILE_SHEET_PEEK_H = 64;

export interface MobileSheetBounds {
  fullY: number;
  halfY: number;
  collapsedY: number;
}

export interface MobileSheetMetrics {
  sheetY: number;
  controlsBottomY: number;
  pHalf: number;
  pFull: number;
}

function clamp01(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(1, val));
}

export function computeMobileSheetBounds(
  rootHeight: number,
  volumeOpen: boolean
): MobileSheetBounds {
  const safeHeight = Math.max(
    480,
    Math.round(Number.isFinite(rootHeight) && rootHeight > 0 ? rootHeight : 780)
  );
  const fullY = MOBILE_SHEET_FULL_Y;
  const collapsedY = Math.max(fullY + 260, safeHeight - MOBILE_SHEET_PEEK_H);
  const minHalf = Math.min(collapsedY - 180, volumeOpen ? 340 : 292);
  const maxHalf = Math.max(minHalf, Math.min(440, collapsedY - 210));
  const halfY = Math.max(minHalf, Math.min(maxHalf, Math.round(safeHeight * 0.5)));

  return { fullY, halfY, collapsedY };
}

export function computeMobileSheetMetrics(
  sheetY: number,
  bounds: MobileSheetBounds
): MobileSheetMetrics {
  const rawY = Number.isFinite(sheetY) ? sheetY : bounds.collapsedY;
  const clampedY = Math.max(bounds.fullY, Math.min(bounds.collapsedY, rawY));
  const pHalf = clamp01(
    (bounds.collapsedY - clampedY) / Math.max(1, bounds.collapsedY - bounds.halfY)
  );
  const pFull = clamp01(
    (bounds.halfY - clampedY) / Math.max(1, bounds.halfY - bounds.fullY)
  );
  const controlsBottomY = Math.max(bounds.halfY, clampedY) - 4;

  return {
    sheetY: clampedY,
    controlsBottomY,
    pHalf,
    pFull,
  };
}
