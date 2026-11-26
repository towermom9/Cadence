import type { MainView } from "../components/Sidebar";

export type MobileSheetState = "collapsed" | "half" | "full";

export interface BackStackSnapshot {
  contextMenuOpen: boolean;
  saveModalOpen: boolean;
  shortcutsOpen: boolean;
  mobileMenuOpen: boolean;
  nowPlayingOpen: boolean;
  mobileSheetState: MobileSheetState;
  activeView: MainView;
  viewHistory: MainView[];
}

export type BackAction =
  | "close_context_menu"
  | "close_save_modal"
  | "close_shortcuts"
  | "close_mobile_menu"
  | "collapse_sheet_to_half"
  | "collapse_now_playing_sheet"
  | "close_now_playing"
  | "pop_view"
  | "none";

export function resolveBackAction(snapshot: BackStackSnapshot): BackAction {
  if (snapshot.contextMenuOpen) return "close_context_menu";
  if (snapshot.saveModalOpen) return "close_save_modal";
  if (snapshot.shortcutsOpen) return "close_shortcuts";
  if (snapshot.mobileMenuOpen) return "close_mobile_menu";
  if (snapshot.nowPlayingOpen && snapshot.mobileSheetState === "full") {
    return "collapse_sheet_to_half";
  }
  if (snapshot.nowPlayingOpen && snapshot.mobileSheetState === "half") {
    return "collapse_now_playing_sheet";
  }
  if (snapshot.nowPlayingOpen) return "close_now_playing";
  if (snapshot.activeView !== "home" || snapshot.viewHistory.length > 0) {
    return "pop_view";
  }
  return "none";
}

export function hasDismissibleBackTarget(snapshot: BackStackSnapshot): boolean {
  return resolveBackAction(snapshot) !== "none";
}

export function computeBackDepth(snapshot: BackStackSnapshot): number {
  let depth = 0;
  if (snapshot.activeView !== "home" || snapshot.viewHistory.length > 0) {
    depth += Math.max(1, snapshot.viewHistory.length);
  }
  if (snapshot.nowPlayingOpen) {
    depth += 1;
    if (snapshot.mobileSheetState === "half") {
      depth += 1;
    } else if (snapshot.mobileSheetState === "full") {
      depth += 2;
    }
  }
  if (snapshot.mobileMenuOpen) depth += 1;
  if (snapshot.shortcutsOpen) depth += 1;
  if (snapshot.saveModalOpen) depth += 1;
  if (snapshot.contextMenuOpen) depth += 1;
  return depth;
}

export function pushViewHistory(
  history: MainView[],
  current: MainView,
  next: MainView
): MainView[] {
  if (next === "home") {
    return [];
  }
  if (current === next) {
    return history;
  }
  const appended = [...history, current];
  return appended.length > 20 ? appended.slice(appended.length - 20) : appended;
}
