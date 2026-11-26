import { useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import {
  Bookmark,
  Compass,
  GripVertical,
  Home,
  Link2,
  Menu,
  Pin,
  Play,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import type { PlaylistDTO, PlaylistSortMode } from "@shared/types";
import { useI18n } from "../i18n";
import { CadenceBanner } from "./CadenceBrand";

export type MainView =
  | "home"
  | "explore"
  | "library"
  | "playlist"
  | "search"
  | "artist"
  | "settings";

interface Props {
  activeView: MainView;
  nowPlayingOpen?: boolean;
  selectedPlaylistId: string | null;
  playlists: PlaylistDTO[];
  playlistSort: PlaylistSortMode;
  onSelectView: (view: MainView) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onCreatePlaylist: (name: string) => void;
  onImportPlaylist: (url: string, name?: string) => void;
  onReorderPlaylists: (playlistIds: string[]) => void;
  onPlayPlaylist: (playlistId: string) => void;
  onPlaylistContextMenu: (e: MouseEvent, playlist: PlaylistDTO) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: Extract<MainView, "home" | "explore" | "library">; labelKey: "nav.home" | "nav.explore" | "nav.library"; icon: typeof Home }[] = [
  { id: "home", labelKey: "nav.home", icon: Home },
  { id: "explore", labelKey: "nav.explore", icon: Compass },
  { id: "library", labelKey: "nav.library", icon: Bookmark },
];

export function Sidebar({
  activeView,
  nowPlayingOpen = false,
  selectedPlaylistId,
  playlists,
  playlistSort,
  onSelectView,
  onSelectPlaylist,
  onCreatePlaylist,
  onImportPlaylist,
  onReorderPlaylists,
  onPlayPlaylist,
  onPlaylistContextMenu,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const { t } = useI18n();
  const [panelMode, setPanelMode] = useState<"none" | "create" | "import">("none");
  const [newName, setNewName] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreatePlaylist(newName.trim());
    setNewName("");
    setPanelMode("none");
  };

  const handleImport = (e: FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    onImportPlaylist(importUrl.trim(), importName.trim() || undefined);
    setImportUrl("");
    setImportName("");
    setPanelMode("none");
  };

  const handleDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const customIds = playlists.filter((p) => !p.isLiked).map((p) => p.id);
    const fromIdx = customIds.indexOf(dragId);
    const toIdx = customIds.indexOf(targetId);
    if (fromIdx >= 0 && toIdx >= 0) {
      const next = [...customIds];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      onReorderPlaylists(next);
    }
    setDragId(null);
    setDragOverId(null);
  };

  const sidebarBody = (
    <aside className="flex h-full w-60 flex-col border-r border-white/10 bg-[#030303] text-zinc-200 select-none">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4">
        <button
          type="button"
          onClick={() => {
            onSelectView("home");
            onCloseMobile();
          }}
          className="flex items-center text-left transition hover:opacity-90"
        >
          <CadenceBanner className="h-7" />
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primary 3 Nav Items */}
      <nav className="space-y-1 px-2.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = !nowPlayingOpen && activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectView(item.id);
                onCloseMobile();
              }}
              className={`flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-white/12 text-white"
                  : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-zinc-300"}`} />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className="mx-4 my-4 border-t border-white/10" />

      {/* New & Import Playlist Pills + Inline Forms */}
      <div className="px-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPanelMode((m) => (m === "create" ? "none" : "create"))}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition ${
              panelMode === "create"
                ? "bg-white text-black"
                : "bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New</span>
          </button>

          <button
            type="button"
            onClick={() => setPanelMode((m) => (m === "import" ? "none" : "import"))}
            title="Save & sync an online playlist URL"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition ${
              panelMode === "import"
                ? "bg-white text-black"
                : "bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            <span>Import</span>
          </button>
        </div>

        {panelMode === "create" && (
          <form onSubmit={handleCreate} className="mt-2.5 flex items-center gap-1.5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Playlist name..."
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#121212] px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-white/40"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40"
            >
              Add
            </button>
          </form>
        )}

        {panelMode === "import" && (
          <form onSubmit={handleImport} className="mt-2.5 space-y-1.5">
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Playlist URL (YT/Spotify)..."
              autoFocus
              className="w-full rounded-lg border border-white/15 bg-[#121212] px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-white/40"
            />
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Name (optional)"
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#121212] px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-white/40"
              />
              <button
                type="submit"
                disabled={!importUrl.trim()}
                className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40"
              >
                Sync
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Scrollable Playlists List */}
      <div className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
        {playlists.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-500">
            No playlists yet. Click New or Import above to start one.
          </p>
        ) : (
          playlists.map((pl) => {
            const selected = activeView === "playlist" && selectedPlaylistId === pl.id;
            const canDrag = playlistSort === "manual" && !pl.isLiked;
            return (
              <div
                key={pl.id}
                draggable={canDrag}
                onDragStart={() => canDrag && setDragId(pl.id)}
                onDragOver={(e: DragEvent<HTMLDivElement>) => {
                  if (!canDrag || !dragId || dragId === pl.id) return;
                  e.preventDefault();
                  setDragOverId(pl.id);
                }}
                onDragLeave={() => {
                  if (dragOverId === pl.id) setDragOverId(null);
                }}
                onDrop={(e: DragEvent<HTMLDivElement>) => {
                  if (!canDrag) return;
                  e.preventDefault();
                  handleDropOn(pl.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
                onClick={() => {
                  onSelectPlaylist(pl.id);
                  onCloseMobile();
                }}
                onContextMenu={(e) => onPlaylistContextMenu(e, pl)}
                className={`group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 transition ${
                  !nowPlayingOpen && selected ? "bg-white/12 text-white" : "text-zinc-300 hover:bg-white/[0.06]"
                } ${dragOverId === pl.id ? "ring-1 ring-white/50 bg-white/10" : ""} ${
                  dragId === pl.id ? "opacity-50" : ""
                }`}
              >
                {canDrag && (
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-500 group-hover:text-zinc-300" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium leading-tight">{pl.name}</p>
                    {pl.sourceUrl && (
                      <RefreshCw
                        className="h-3 w-3 shrink-0 text-zinc-400"
                        aria-label="Synced online playlist"
                      />
                    )}
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-zinc-500">
                    {pl.isLiked ? (
                      <>
                        <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-zinc-400" />
                        <span>
                          Auto playlist • {pl.tracks.length}{" "}
                          {pl.tracks.length === 1 ? "track" : "tracks"}
                        </span>
                      </>
                    ) : pl.isPinned ? (
                      <>
                        <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-zinc-400" />
                        <span>
                          Pinned • {pl.tracks.length}{" "}
                          {pl.tracks.length === 1 ? "track" : "tracks"}
                        </span>
                      </>
                    ) : (
                      <span>
                        {pl.tracks.length} {pl.tracks.length === 1 ? "track" : "tracks"}
                      </span>
                    )}
                  </p>
                </div>
                {pl.tracks.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlayPlaylist(pl.id);
                    }}
                    title="Play playlist"
                    className="rounded-full p-1.5 text-zinc-300 opacity-0 transition hover:bg-white/15 hover:text-white group-hover:opacity-100"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden h-full lg:block">{sidebarBody}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-black/70" onClick={onCloseMobile} />
          <div className="relative z-10 h-full">{sidebarBody}</div>
        </div>
      )}
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white lg:hidden"
      aria-label="Open menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
