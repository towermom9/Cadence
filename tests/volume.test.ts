import { describe, expect, test } from "bun:test";
import { uiVolumeToLavalink } from "../shared/volume";
import { clampVolume } from "../web/src/hooks/useVolumeControl";

describe("shared/volume", () => {
  test("clamps and curves UI volume perceptually", () => {
    expect(uiVolumeToLavalink(0)).toBe(0);
    expect(uiVolumeToLavalink(-10)).toBe(0);
    expect(uiVolumeToLavalink(100)).toBe(100);
    expect(uiVolumeToLavalink(150)).toBe(100);
    expect(uiVolumeToLavalink(1)).toBeGreaterThanOrEqual(1);
    expect(uiVolumeToLavalink(50)).toBe(33);
    expect(uiVolumeToLavalink(10)).toBe(3);
  });

  test("clampVolume normalizes non-finite and out-of-range values", () => {
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(140)).toBe(100);
    expect(clampVolume(42.6)).toBe(43);
    expect(clampVolume(Number.NaN)).toBe(100);
  });
});
