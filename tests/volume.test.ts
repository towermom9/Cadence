import { describe, expect, test } from "bun:test";
import { uiVolumeToLavalink } from "../shared/volume";

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
});
