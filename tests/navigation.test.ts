import { describe, expect, test } from "bun:test";
import {
  computeBackDepth,
  hasDismissibleBackTarget,
  pushViewHistory,
  resolveBackAction,
  type BackStackSnapshot,
} from "../web/src/utils/navigation";

const baseSnapshot: BackStackSnapshot = {
  contextMenuOpen: false,
  saveModalOpen: false,
  shortcutsOpen: false,
  mobileMenuOpen: false,
  nowPlayingOpen: false,
  mobileSheetState: "collapsed",
  activeView: "home",
  viewHistory: [],
};

describe("web/src/utils/navigation back stack", () => {
  test("resolves highest-priority overlay or sheet layer first", () => {
    expect(resolveBackAction(baseSnapshot)).toBe("none");
    expect(hasDismissibleBackTarget(baseSnapshot)).toBe(false);

    expect(
      resolveBackAction({
        ...baseSnapshot,
        contextMenuOpen: true,
        saveModalOpen: true,
        nowPlayingOpen: true,
        mobileSheetState: "full",
        activeView: "settings",
      })
    ).toBe("close_context_menu");

    expect(
      resolveBackAction({
        ...baseSnapshot,
        saveModalOpen: true,
        shortcutsOpen: true,
        nowPlayingOpen: true,
      })
    ).toBe("close_save_modal");

    expect(
      resolveBackAction({
        ...baseSnapshot,
        shortcutsOpen: true,
        mobileMenuOpen: true,
      })
    ).toBe("close_shortcuts");

    expect(
      resolveBackAction({
        ...baseSnapshot,
        mobileMenuOpen: true,
        nowPlayingOpen: true,
      })
    ).toBe("close_mobile_menu");

    expect(
      resolveBackAction({
        ...baseSnapshot,
        nowPlayingOpen: true,
        mobileSheetState: "full",
        activeView: "library",
      })
    ).toBe("collapse_sheet_to_half");

    expect(
      resolveBackAction({
        ...baseSnapshot,
        nowPlayingOpen: true,
        mobileSheetState: "half",
        activeView: "library",
      })
    ).toBe("collapse_now_playing_sheet");

    expect(
      resolveBackAction({
        ...baseSnapshot,
        nowPlayingOpen: true,
        mobileSheetState: "collapsed",
        activeView: "library",
      })
    ).toBe("close_now_playing");

    expect(
      resolveBackAction({
        ...baseSnapshot,
        activeView: "settings",
      })
    ).toBe("pop_view");
  });

  test("manages dashboard view history cleanly without duplicates", () => {
    let history = pushViewHistory([], "home", "explore");
    expect(history).toEqual(["home"]);

    history = pushViewHistory(history, "explore", "explore");
    expect(history).toEqual(["home"]);

    history = pushViewHistory(history, "explore", "artist");
    expect(history).toEqual(["home", "explore"]);

    history = pushViewHistory(history, "artist", "home");
    expect(history).toEqual([]);
  });

  test("computes exact stack depth for multi-layer Back unwinding", () => {
    expect(computeBackDepth(baseSnapshot)).toBe(0);
    expect(
      computeBackDepth({
        ...baseSnapshot,
        activeView: "explore",
        viewHistory: ["home"],
      })
    ).toBe(1);
    expect(
      computeBackDepth({
        ...baseSnapshot,
        nowPlayingOpen: true,
        mobileSheetState: "collapsed",
      })
    ).toBe(1);
    expect(
      computeBackDepth({
        ...baseSnapshot,
        nowPlayingOpen: true,
        mobileSheetState: "half",
      })
    ).toBe(2);
    expect(
      computeBackDepth({
        ...baseSnapshot,
        activeView: "artist",
        viewHistory: ["home", "explore"],
        nowPlayingOpen: true,
        mobileSheetState: "full",
        contextMenuOpen: true,
      })
    ).toBe(6);
  });
});
