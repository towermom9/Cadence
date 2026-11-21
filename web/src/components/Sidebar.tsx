import { useState, type FormEvent, type MouseEvent } from "react";
import { Bookmark, Compass, Home, Menu, Play, Plus, X } from "lucide-react";
import type { PlaylistDTO } from "@shared/types";

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
  onSelectView: (view: MainView) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onCreatePlaylist: (name: string) => void;
  onPlayPlaylist: (playlistId: string) => void;
  onPlaylistContextMenu: (e: MouseEvent, playlist: PlaylistDTO) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: Extract<MainView, "home" | "explore" | "library">; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "library", label: "Library", icon: Bookmark },
];

export function Sidebar({
  activeView,
  nowPlayingOpen = false,
  selectedPlaylistId,
  playlists,
  onSelectView,
  onSelectPlaylist,
  onCreatePlaylist,
  onPlayPlaylist,
  onPlaylistContextMenu,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreatePlaylist(newName.trim());
    setNewName("");
    setCreating(false);
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
          className="flex items-center gap-2.5 text-left"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff0033] text-white shadow-sm">
            <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
          </span>
          <span className="text-lg font-bold tracking-tight text-white">Cadence</span>
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
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mx-4 my-4 border-t border-white/10" />

      {/* New Playlist Pill + Inline Input */}
      <div className="px-3">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
        >
          <Plus className="h-4 w-4" />
          <span>New playlist</span>
        </button>

        {creating && (
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
      </div>

      {/* Scrollable Playlists List */}
      <div className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
        {playlists.length === 0 ? (
          <p className="px-3 py-4 text-xs text-zinc-500">
            No playlists yet. Click New playlist above to start one.
          </p>
        ) : (
          playlists.map((pl) => {
            const selected = activeView === "playlist" && selectedPlaylistId === pl.id;
            return (
              <div
                key={pl.id}
                onClick={() => {
                  onSelectPlaylist(pl.id);
                  onCloseMobile();
                }}
                onContextMenu={(e) => onPlaylistContextMenu(e, pl)}
                className={`group flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 transition ${
                  !nowPlayingOpen && selected ? "bg-white/12 text-white" : "text-zinc-300 hover:bg-white/[0.06]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">{pl.name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                    {pl.tracks.length} {pl.tracks.length === 1 ? "track" : "tracks"}
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
