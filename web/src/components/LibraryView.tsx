import { useEffect, useRef, useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Disc3,
  Link2,
  MoreVertical,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type {
  EnqueueMode,
  HistoryEntryDTO,
  PlaylistDTO,
  PlaylistSortMode,
  TrackDTO,
} from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import { PLAYLIST_SORT_OPTIONS, playlistSortLabel } from "../utils/playlists";
import { ArtistLinks } from "./ArtistLinks";
import type { TrackMenuContext } from "./ContextMenu";
import { PlaylistArtwork } from "./PlaylistArtwork";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  playlists: PlaylistDTO[];
  playlistSort: PlaylistSortMode;
  history: HistoryEntryDTO[];
  initialTab?: "playlists" | "history";
  onCreatePlaylist: (name: string) => void;
  onImportPlaylist: (url: string, name?: string) => void;
  onSetPlaylistSort: (sort: PlaylistSortMode) => void;
  onReorderPlaylists: (playlistIds: string[]) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onPlayPlaylist: (playlistId: string) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onClearHistory: () => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
  onPlaylistContextMenu: (e: MouseEvent, playlist: PlaylistDTO) => void;
}

export function LibraryView({
  playlists,
  playlistSort,
  history,
  initialTab = "playlists",
  onCreatePlaylist,
  onImportPlaylist,
  onSetPlaylistSort,
  onReorderPlaylists,
  onSelectPlaylist,
  onPlayPlaylist,
  onEnqueue,
  onClearHistory,
  onOpenArtist,
  onTrackContextMenu,
  onPlaylistContextMenu,
}: Props) {
  const [tab, setTab] = useState<"playlists" | "history">(initialTab);
  const [newName, setNewName] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importName, setImportName] = useState("");
  const [sortOpen, setSortOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sortOpen]);

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreatePlaylist(newName.trim());
    setNewName("");
  };

  const handleImportSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    onImportPlaylist(importUrl.trim(), importName.trim() || undefined);
    setImportUrl("");
    setImportName("");
    setImportOpen(false);
  };

  const customPlaylists = playlists.filter((p) => !p.isLiked);

  const moveCustomPlaylist = (playlistId: string, delta: -1 | 1) => {
    const ids = customPlaylists.map((p) => p.id);
    const idx = ids.indexOf(playlistId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[idx], next[target]] = [next[target], next[idx]];
    onReorderPlaylists(next);
  };

  const handleDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const ids = customPlaylists.map((p) => p.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx >= 0 && toIdx >= 0) {
      const next = [...ids];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      onReorderPlaylists(next);
    }
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("playlists")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === "playlists"
                ? "bg-white text-black"
                : "bg-white/[0.06] text-zinc-300 hover:bg-white/12"
            }`}
          >
            Playlists ({playlists.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === "history"
                ? "bg-white text-black"
                : "bg-white/[0.06] text-zinc-300 hover:bg-white/12"
            }`}
          >
            History ({history.length})
          </button>
        </div>

        {tab === "playlists" && (
          <div className="flex flex-wrap items-center gap-2">
            {/* YTM-style Sort by pill + dropdown */}
            <div ref={sortRef} className="relative">
              <button
                type="button"
                onClick={() => setSortOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-sm font-medium text-zinc-100 transition hover:bg-white/12"
              >
                <span>{playlistSortLabel(playlistSort)}</span>
                <ChevronDown className="h-4 w-4 text-zinc-400" />
              </button>

              {sortOpen && (
                <div className="absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-xl border border-white/12 bg-[#212121] py-1.5 shadow-2xl">
                  <div className="border-b border-white/10 px-4 py-2 text-xs font-semibold text-zinc-400">
                    Sort by
                  </div>
                  {PLAYLIST_SORT_OPTIONS.map((opt) => {
                    const active = opt.id === playlistSort;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          onSetPlaylistSort(opt.id);
                          setSortOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-zinc-100 transition hover:bg-white/10"
                      >
                        <Check
                          className={`h-4 w-4 shrink-0 ${
                            active ? "text-white opacity-100" : "opacity-0"
                          }`}
                        />
                        <span className={active ? "font-semibold text-white" : "text-zinc-200"}>
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setImportOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                importOpen
                  ? "border-white bg-white/15 text-white"
                  : "border-white/15 bg-white/[0.06] text-zinc-200 hover:bg-white/12"
              }`}
            >
              <Link2 className="h-4 w-4" />
              Import URL
            </button>

            <form onSubmit={handleCreate} className="flex items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New playlist name..."
                className="rounded-full border border-white/15 bg-[#121212] px-4 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/40"
              />
              <button
                type="submit"
                disabled={!newName.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
            </form>
          </div>
        )}

        {tab === "history" && history.length > 0 && (
          <button
            type="button"
            onClick={onClearHistory}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-200"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear history
          </button>
        )}
      </div>

      {tab === "playlists" && (
        <>
          {importOpen && (
            <form
              onSubmit={handleImportSubmit}
              className="flex flex-col gap-2.5 rounded-xl border border-white/12 bg-[#141414] p-4 sm:flex-row sm:items-center"
            >
              <input
                type="url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="Paste YouTube, Spotify, or SoundCloud playlist URL..."
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#0b0b0b] px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/40"
              />
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Custom name (optional)"
                className="sm:w-52 rounded-lg border border-white/15 bg-[#0b0b0b] px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/40"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!importUrl.trim()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Save &amp; Sync
                </button>
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-full px-3 py-2 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {playlists.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#121212] p-12 text-center">
              <Disc3 className="mx-auto h-10 w-10 text-zinc-600" />
              <p className="mt-3 text-sm font-medium text-white">No playlists yet</p>
              <p className="mt-1 text-xs text-zinc-400">
                Create a playlist above, or click Import URL to save and sync an online playlist.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {playlists.map((pl) => {
                const canReorder = playlistSort === "manual" && !pl.isLiked;
                const customIdx = canReorder ? customPlaylists.findIndex((c) => c.id === pl.id) : -1;
                return (
                  <div
                    key={pl.id}
                    draggable={canReorder}
                    onDragStart={() => canReorder && setDragId(pl.id)}
                    onDragOver={(e: DragEvent<HTMLDivElement>) => {
                      if (!canReorder || !dragId || dragId === pl.id) return;
                      e.preventDefault();
                      setDragOverId(pl.id);
                    }}
                    onDragLeave={() => {
                      if (dragOverId === pl.id) setDragOverId(null);
                    }}
                    onDrop={(e: DragEvent<HTMLDivElement>) => {
                      if (!canReorder) return;
                      e.preventDefault();
                      handleDropOn(pl.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverId(null);
                    }}
                    onClick={() => onSelectPlaylist(pl.id)}
                    onContextMenu={(e) => onPlaylistContextMenu(e, pl)}
                    className={`group cursor-pointer space-y-2.5 rounded-xl transition ${
                      dragOverId === pl.id ? "ring-2 ring-white/50 p-1 -m-1" : ""
                    } ${dragId === pl.id ? "opacity-50" : ""}`}
                  >
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-[#181818] ring-1 ring-white/10">
                      <PlaylistArtwork
                        playlist={pl}
                        className="h-full w-full transition duration-300 group-hover:brightness-75"
                      />
                      {pl.sourceUrl && (
                        <span
                          title="Synced with online playlist"
                          className="absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-zinc-200 shadow"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </span>
                      )}
                      {canReorder && customPlaylists.length > 1 && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100"
                        >
                          <button
                            type="button"
                            disabled={customIdx <= 0}
                            onClick={() => moveCustomPlaylist(pl.id, -1)}
                            title="Move earlier"
                            className="rounded-full bg-black/75 p-1 text-zinc-200 hover:bg-black hover:text-white disabled:opacity-35"
                          >
                            <ArrowLeft className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            disabled={customIdx >= customPlaylists.length - 1}
                            onClick={() => moveCustomPlaylist(pl.id, 1)}
                            title="Move later"
                            className="rounded-full bg-black/75 p-1 text-zinc-200 hover:bg-black hover:text-white disabled:opacity-35"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {pl.tracks.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayPlaylist(pl.id);
                          }}
                          title="Play playlist"
                          className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white opacity-0 shadow-lg transition hover:scale-105 group-hover:opacity-100"
                        >
                          <Play className="ml-0.5 h-5 w-5 fill-current" />
                        </button>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{pl.name}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-zinc-400">
                        {pl.isLiked ? (
                          <>
                            <Pin className="h-3 w-3 shrink-0 fill-current text-zinc-400" />
                            <span>
                              Auto playlist • {pl.tracks.length}{" "}
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
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        <>
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#121212] p-10 text-center text-sm text-zinc-400">
              Songs you play will show up here.
            </div>
          ) : (
            <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#121212]">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => onEnqueue([entry.track], "now", "History")}
                  onContextMenu={(e) => onTrackContextMenu(e, entry.track)}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]"
                >
                  <TrackArtwork
                    track={entry.track}
                    className="h-10 w-10 shrink-0 rounded"
                    iconClassName="h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{entry.track.title}</p>
                    <p className="truncate text-xs text-zinc-400">
                      <ArtistLinks author={entry.track.author} onOpenArtist={onOpenArtist} />
                      <span> • {sourceLabel(entry.track.sourceName)} • {formatMs(entry.track.duration)}</span>
                    </p>
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => onEnqueue([entry.track], "now", "History")}
                      title="Play now"
                      className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <Play className="h-4 w-4 fill-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEnqueue([entry.track], "end", "History")}
                      title="Add to queue"
                      className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onTrackContextMenu(e, entry.track)}
                      title="More options"
                      className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

    </div>
  );
}
