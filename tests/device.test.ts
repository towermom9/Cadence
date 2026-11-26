import { describe, expect, test } from "bun:test";
import { detectSupportsKeyboardShortcuts } from "../web/src/utils/device";

describe("web/src/utils/device keyboard shortcut detection", () => {
  test("enables keyboard shortcuts on desktop browsers with fine pointers", () => {
    expect(
      detectSupportsKeyboardShortcuts({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0",
        innerWidth: 1440,
        innerHeight: 900,
        maxTouchPoints: 0,
        hasFinePointer: true,
      })
    ).toBe(true);
  });

  test("enables keyboard shortcuts on iPad, Android tablets, and devices with external pointers", () => {
    expect(
      detectSupportsKeyboardShortcuts({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)",
        innerWidth: 768,
        innerHeight: 1024,
        maxTouchPoints: 5,
        hasFinePointer: false,
      })
    ).toBe(true);

    expect(
      detectSupportsKeyboardShortcuts({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        innerWidth: 820,
        innerHeight: 1180,
        maxTouchPoints: 5,
        hasFinePointer: false,
      })
    ).toBe(true);

    expect(
      detectSupportsKeyboardShortcuts({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Safari/537.36",
        innerWidth: 800,
        innerHeight: 1280,
        maxTouchPoints: 5,
        hasFinePointer: false,
      })
    ).toBe(true);

    expect(
      detectSupportsKeyboardShortcuts({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148",
        innerWidth: 390,
        innerHeight: 844,
        maxTouchPoints: 5,
        hasFinePointer: true,
      })
    ).toBe(true);
  });

  test("hides keyboard shortcuts on coarse touch mobile phones", () => {
    expect(
      detectSupportsKeyboardShortcuts({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148",
        innerWidth: 390,
        innerHeight: 844,
        maxTouchPoints: 5,
        hasFinePointer: false,
      })
    ).toBe(false);

    expect(
      detectSupportsKeyboardShortcuts({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36",
        innerWidth: 412,
        innerHeight: 915,
        maxTouchPoints: 5,
        hasFinePointer: false,
      })
    ).toBe(false);
  });
});
