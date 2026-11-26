import { describe, expect, test } from "bun:test";
import {
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
  mobileSheetExpanded: false,
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
        mobileSheetExpanded: true,
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
        mobileSheetExpanded: true,
        activeView: "library",
      })
    ).toBe("collapse_now_playing_sheet");

    expect(
      resolveBackAction({
        ...baseSnapshot,
        nowPlayingOpen: true,
        mobileSheetExpanded: false,
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
});
