import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "cadence-test-"));
process.env.DATA_DIR = tempDir;

const { CadenceDatabase } = await import("../server/db");

describe("server/db (isolated SQLite)", () => {
  const db = new CadenceDatabase(tempDir);

  afterAll(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("guild settings defaults and empty VC / playnext updates", () => {
    const defaults = db.getGuildSettings("guild-1");
    expect(defaults.pauseOnEmpty).toBe(true);
    expect(defaults.pauseOnEmptySeconds).toBe(0);
    expect(defaults.emptyVcDisconnectMinutes).toBe(30);
    expect(defaults.ignoreDeafenedListeners).toBe(false);
    expect(defaults.defaultPlayNext).toBe(false);

    const updated = db.updateGuildSettings("guild-1", {
      pauseOnEmpty: true,
      pauseOnEmptySeconds: 45,
      emptyVcDisconnectMinutes: 60,
      ignoreDeafenedListeners: true,
      defaultPlayNext: true,
    });
    expect(updated.pauseOnEmptySeconds).toBe(45);
    expect(updated.emptyVcDisconnectMinutes).toBe(60);
    expect(updated.ignoreDeafenedListeners).toBe(true);
    expect(updated.defaultPlayNext).toBe(true);

    const clamped = db.updateGuildSettings("guild-1", {
      pauseOnEmptySeconds: 999,
      emptyVcDisconnectMinutes: 999,
    });
    expect(clamped.pauseOnEmptySeconds).toBe(300);
    expect(clamped.emptyVcDisconnectMinutes).toBe(120);
  });

  test("records and paginates play history with optional playlistName", () => {
    for (let i = 1; i <= 5; i++) {
      db.recordPlayHistory(
        "user-1",
        {
          encoded: "",
          identifier: `track-${i}`,
          title: `Track ${i}`,
          author: "Tester",
          duration: 180_000,
          uri: null,
          artworkUrl: null,
          sourceName: "youtube",
          isStream: false,
        },
        i <= 3 ? "Roadtrip Mix" : null
      );
    }

    expect(db.getPlayHistoryCount("user-1")).toBe(5);
    const page1 = db.getPlayHistory("user-1", 2, 0);
    const page2 = db.getPlayHistory("user-1", 2, 2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].track.identifier).toBe("track-5");
    expect(page1[0].playlistName).toBeNull();
    expect(page2[1].playlistName).toBe("Roadtrip Mix");
  });
});
