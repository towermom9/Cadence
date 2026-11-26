import { describe, expect, test } from "bun:test";
import {
  MOBILE_SHEET_FULL_Y,
  MOBILE_SHEET_PEEK_H,
  computeMobileSheetBounds,
  computeMobileSheetMetrics,
} from "../web/src/utils/mobileSheet";

describe("web/src/utils/mobileSheet 3-state sheet geometry", () => {
  test("computes safe non-overlapping bounds for compact and tall viewports", () => {
    const compact = computeMobileSheetBounds(667, false);
    expect(compact.fullY).toBe(MOBILE_SHEET_FULL_Y);
    expect(compact.collapsedY).toBe(667 - MOBILE_SHEET_PEEK_H);
    expect(compact.halfY).toBeGreaterThanOrEqual(292);
    expect(compact.halfY).toBeLessThan(compact.collapsedY - 180);

    const compactVol = computeMobileSheetBounds(667, true);
    expect(compactVol.halfY).toBeGreaterThanOrEqual(compact.halfY);
    expect(compactVol.halfY).toBeLessThan(compactVol.collapsedY - 180);

    const tall = computeMobileSheetBounds(852, false);
    expect(tall.fullY).toBe(68);
    expect(tall.collapsedY).toBe(852 - MOBILE_SHEET_PEEK_H);
    expect(tall.halfY).toBe(Math.round(852 * 0.5));
  });

  test("keeps controls welded 4px above the sheet throughout collapsed <-> half", () => {
    const bounds = computeMobileSheetBounds(800, false);

    const atCollapsed = computeMobileSheetMetrics(bounds.collapsedY, bounds);
    expect(atCollapsed.pHalf).toBe(0);
    expect(atCollapsed.pFull).toBe(0);
    expect(atCollapsed.controlsBottomY).toBe(bounds.collapsedY - 4);

    const midCollapsedHalf = Math.round((bounds.collapsedY + bounds.halfY) / 2);
    const atMid = computeMobileSheetMetrics(midCollapsedHalf, bounds);
    expect(atMid.pHalf).toBeCloseTo(0.5, 2);
    expect(atMid.pFull).toBe(0);
    expect(atMid.controlsBottomY).toBe(midCollapsedHalf - 4);

    const atHalf = computeMobileSheetMetrics(bounds.halfY, bounds);
    expect(atHalf.pHalf).toBe(1);
    expect(atHalf.pFull).toBe(0);
    expect(atHalf.controlsBottomY).toBe(bounds.halfY - 4);
  });

  test("parks controls at halfY - 4 while hero fades out from half -> full", () => {
    const bounds = computeMobileSheetBounds(800, false);

    const midHalfFull = Math.round((bounds.halfY + bounds.fullY) / 2);
    const atMidFull = computeMobileSheetMetrics(midHalfFull, bounds);
    expect(atMidFull.pHalf).toBe(1);
    expect(atMidFull.pFull).toBeGreaterThan(0.45);
    expect(atMidFull.pFull).toBeLessThan(0.55);
    expect(atMidFull.controlsBottomY).toBe(bounds.halfY - 4);

    const atFull = computeMobileSheetMetrics(bounds.fullY, bounds);
    expect(atFull.sheetY).toBe(bounds.fullY);
    expect(atFull.pHalf).toBe(1);
    expect(atFull.pFull).toBe(1);
    expect(atFull.controlsBottomY).toBe(bounds.halfY - 4);

    // Clamping outside range
    const overDragged = computeMobileSheetMetrics(-40, bounds);
    expect(overDragged.sheetY).toBe(bounds.fullY);
    expect(overDragged.pFull).toBe(1);
  });
});
