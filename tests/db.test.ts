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

  test("updates stored dashboard domain cleanly", () => {
    const updated = db.updateDashboardUrl("https://cadence.example.com/");
    expect(updated.dashboardUrl).toBe("https://cadence.example.com");
    expect(updated.setupCompleted).toBe(true);
    const loaded = db.getAppConfig();
    expect(loaded?.dashboardUrl).toBe("https://cadence.example.com");
  });

  test("prunes oldest play history rows when maxHistory is enforced and stores stuck timeout", () => {
    const uid = "prune-user";
    for (let i = 1; i <= 5; i++) {
      db.recordPlayHistory(
        uid,
        {
          encoded: "",
          identifier: `p-${i}`,
          title: `Prune Track ${i}`,
          author: "Tester",
          duration: 120_000,
          uri: null,
          artworkUrl: null,
          sourceName: "youtube",
          isStream: false,
        },
        null,
        3
      );
    }

    expect(db.getPlayHistoryCount(uid)).toBe(3);
    const remaining = db.getPlayHistory(uid, 10, 0);
    expect(remaining.map((r) => r.track.identifier)).toEqual(["p-5", "p-4", "p-3"]);

    const settingsClamp = db.updateGuildSettings("guild-max-history", { maxHistory: 99_999 });
    expect(settingsClamp.maxHistory).toBe(10000);

    const savedTimeout = db.updateTrackStuckTimeoutMs(35000);
    expect(savedTimeout.trackStuckTimeoutMs).toBe(35000);
    const clampedLow = db.updateTrackStuckTimeoutMs(500);
    expect(clampedLow.trackStuckTimeoutMs).toBe(5000);
    const clampedHigh = db.updateTrackStuckTimeoutMs(999_999);
    expect(clampedHigh.trackStuckTimeoutMs).toBe(60000);
  });

  test("persists accessibility, custom color, and i18n user preferences cleanly", () => {
    const prefs = db.updateUserPreferences("a11y-user", {
      customAccentHex: "#12ABEF",
      customBgHex: "#050608",
      customSurfaceHex: "#101218",
      highContrast: true,
      reducedMotion: true,
      textScale: 120,
      enhancedFocusRings: true,
      largerTouchTargets: true,
      longPressMs: 750,
      screenReaderAnnouncements: false,
      locale: "ja",
    });

    expect(prefs.customAccentHex).toBe("#12abef");
    expect(prefs.customBgHex).toBe("#050608");
    expect(prefs.customSurfaceHex).toBe("#101218");
    expect(prefs.highContrast).toBe(true);
    expect(prefs.reducedMotion).toBe(true);
    expect(prefs.textScale).toBe(120);
    expect(prefs.enhancedFocusRings).toBe(true);
    expect(prefs.largerTouchTargets).toBe(true);
    expect(prefs.longPressMs).toBe(750);
    expect(prefs.screenReaderAnnouncements).toBe(false);
    expect(prefs.locale).toBe("ja");

    const reloaded = db.getUserPreferences("a11y-user");
    expect(reloaded.textScale).toBe(120);
    expect(reloaded.longPressMs).toBe(750);
    expect(reloaded.locale).toBe("ja");

    const clampedLow = db.updateUserPreferences("a11y-user", { longPressMs: 50 });
    expect(clampedLow.longPressMs).toBe(200);
    const clampedHigh = db.updateUserPreferences("a11y-user", { longPressMs: 5000 });
    expect(clampedHigh.longPressMs).toBe(1200);
  });

  test("resets guild settings back to defaults cleanly", () => {
    db.updateGuildSettings("guild-reset", {
      prefix: "!",
      defaultVolume: 45,
      stay247: true,
      autoplay: true,
      defaultPlayNext: true,
    });
    const reset = db.resetGuildSettings("guild-reset");
    expect(reset.defaultVolume).toBe(100);
    expect(reset.stay247).toBe(false);
    expect(reset.autoplay).toBe(false);
    expect(reset.defaultPlayNext).toBe(false);
  });
});
