import type { MainView } from "../components/Sidebar";

export interface BackStackSnapshot {
  contextMenuOpen: boolean;
  saveModalOpen: boolean;
  shortcutsOpen: boolean;
  mobileMenuOpen: boolean;
  nowPlayingOpen: boolean;
  mobileSheetExpanded: boolean;
  activeView: MainView;
  viewHistory: MainView[];
}

export type BackAction =
  | "close_context_menu"
  | "close_save_modal"
  | "close_shortcuts"
  | "close_mobile_menu"
  | "collapse_now_playing_sheet"
  | "close_now_playing"
  | "pop_view"
  | "none";

export function resolveBackAction(snapshot: BackStackSnapshot): BackAction {
  if (snapshot.contextMenuOpen) return "close_context_menu";
  if (snapshot.saveModalOpen) return "close_save_modal";
  if (snapshot.shortcutsOpen) return "close_shortcuts";
  if (snapshot.mobileMenuOpen) return "close_mobile_menu";
  if (snapshot.nowPlayingOpen && snapshot.mobileSheetExpanded) {
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
