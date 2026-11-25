import { describe, expect, test } from "bun:test";
import { parseSyncedLyrics, stripInlineTags } from "../web/src/utils/lrc";

describe("web/src/utils/lrc", () => {
  test("parses standard and offset LRC timestamps in chronological order", () => {
    const raw = [
      "[offset:500]",
      "[00:10.50]Second line",
      "[00:05.00]First line",
    ].join("\n");
    const parsed = parseSyncedLyrics(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ timeMs: 4500, text: "First line", words: undefined });
    expect(parsed[1]).toEqual({ timeMs: 10000, text: "Second line", words: undefined });
  });

  test("parses enhanced word-level timestamps and strips inline tags", () => {
    const line = "[00:12.00]<00:12.00>Hello <00:12.50>world";
    const parsed = parseSyncedLyrics(line);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toBe("Hello world");
    expect(parsed[0].words).toEqual([
      { timeMs: 12000, text: "Hello" },
      { timeMs: 12500, text: "world" },
    ]);
    expect(stripInlineTags("Hello <00:12.50>world")).toBe("Hello world");
  });
});
