import type { PlaylistDTO, PlaylistSortMode } from "@shared/types";

export const PLAYLIST_SORT_OPTIONS: { id: PlaylistSortMode; label: string }[] = [
  { id: "recent_activity", label: "Recent activity" },
  { id: "recently_saved", label: "Recently saved" },
  { id: "recently_played", label: "Recently played" },
  { id: "recent_sync", label: "Recent sync" },
  { id: "manual", label: "Manual" },
  { id: "alphabetical", label: "A–Z" },
];

export function playlistSortLabel(mode: PlaylistSortMode): string {
  return PLAYLIST_SORT_OPTIONS.find((opt) => opt.id === mode)?.label ?? "Recent activity";
}

function compareCustomPlaylists(a: PlaylistDTO, b: PlaylistDTO, mode: PlaylistSortMode): number {
  switch (mode) {
    case "recently_saved":
      return b.createdAt - a.createdAt || b.updatedAt - a.updatedAt;
    case "recently_played":
      return (
        (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
        b.updatedAt - a.updatedAt
      );
    case "recent_sync":
      return (
        (b.lastSyncedAt ?? 0) - (a.lastSyncedAt ?? 0) ||
        b.updatedAt - a.updatedAt
      );
    case "manual":
      return (
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        b.createdAt - a.createdAt
      );
    case "alphabetical":
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    case "recent_activity":
    default: {
      const aAct = Math.max(a.updatedAt, a.lastPlayedAt ?? 0, a.lastSyncedAt ?? 0);
      const bAct = Math.max(b.updatedAt, b.lastPlayedAt ?? 0, b.lastSyncedAt ?? 0);
      return bAct - aAct || b.createdAt - a.createdAt;
    }
  }
}

export function sortPlaylists(playlists: PlaylistDTO[], mode: PlaylistSortMode): PlaylistDTO[] {
  const liked: PlaylistDTO[] = [];
  const custom: PlaylistDTO[] = [];
  for (const pl of playlists) {
    if (pl.isLiked) {
      liked.push(pl);
    } else {
      custom.push(pl);
    }
  }
  custom.sort((a, b) => compareCustomPlaylists(a, b, mode));
  return [...liked, ...custom];
}
