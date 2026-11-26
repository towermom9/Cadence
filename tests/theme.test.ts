import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PREFERENCES,
  getContrastRatio,
  hexToRgbTuple,
  normalizeHexColor,
  pickContrastingFg,
  sanitizePreferences,
} from "../web/src/utils/theme";

describe("web/src/utils/theme & WCAG contrast helpers", () => {
  test("normalizes valid hex swatches and converts to RGB tuples", () => {
    expect(normalizeHexColor("#FF0033")).toBe("#ff0033");
    expect(normalizeHexColor(" 10B981 ")).toBeNull();
    expect(normalizeHexColor("#xyz123")).toBeNull();
    expect(hexToRgbTuple("#ff0033")).toEqual([255, 0, 51]);
  });

  test("computes WCAG 2.2 luminance contrast ratio accurately", () => {
    const blackOnWhite = getContrastRatio("#000000", "#ffffff");
    expect(blackOnWhite).toBeGreaterThan(20.9);
    expect(blackOnWhite).toBeLessThanOrEqual(21);

    const sameColor = getContrastRatio("#334455", "#334455");
    expect(sameColor).toBeCloseTo(1, 5);

    expect(pickContrastingFg("#ffffff")).toBe("#000000");
    expect(pickContrastingFg("#030303")).toBe("#ffffff");
  });

  test("sanitizePreferences clamps accessibility fields and validates custom swatches", () => {
    const clean = sanitizePreferences({
      ...DEFAULT_PREFERENCES,
      customAccentHex: "#3EA6FF",
      customBgHex: "bad-hex",
      textScale: 999,
      longPressMs: 5000,
      highContrast: true,
      locale: "de",
    });

    expect(clean.customAccentHex).toBe("#3ea6ff");
    expect(clean.customBgHex).toBeNull();
    expect(clean.textScale).toBe(130);
    expect(clean.longPressMs).toBe(1200);
    expect(clean.highContrast).toBe(true);
    expect(clean.locale).toBe("de");
    expect(DEFAULT_PREFERENCES.longPressMs).toBe(450);
  });
});
