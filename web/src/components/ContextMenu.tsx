import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpToLine,
  BookmarkPlus,
  Check,
  ChevronRight,
  ListPlus,
  ListStart,
  Mic2,
  Play,
  Plus,
  Radio,
  Share2,
  Shuffle,
  Trash2,
} from "lucide-react";
import type { EnqueueMode, PlaylistDTO, ToastLevel, TrackDTO } from "@shared/types";

export interface TrackMenuContext {
  queueIndex?: number;
  isCurrent?: boolean;
  playlistId?: string;
  playlistTrackIndex?: number;
}

export type ContextMenuState =
  | ({
      kind: "track";
      x: number;
      y: number;
      track: TrackDTO;
    } & TrackMenuContext)
  | {
      kind: "playlist";
      x: number;
      y: number;
      playlist: PlaylistDTO;
    };

interface Props {
  menu: ContextMenuState | null;
  playlists: PlaylistDTO[];
  privileged: boolean;
  onClose: () => void;
  onStartMix: (track: TrackDTO) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onAddToPlaylist: (playlistId: string, track: TrackDTO) => void;
  onCreatePlaylistWithTracks: (name: string, tracks: TrackDTO[]) => void;
  onViewLyrics: (track: TrackDTO) => void;
  onMoveTrack: (from: number, to: number) => void;
  onRemoveTrack: (index: number) => void;
  onRemoveFromPlaylist: (playlistId: string, index: number) => void;
  onPlayPlaylist: (playlistId: string, shuffle?: boolean) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onToast: (level: ToastLevel, message: string) => void;
}

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function ContextMenu({
  menu,
  playlists,
  privileged,
  onClose,
  onStartMix,
  onEnqueue,
  onAddToPlaylist,
  onCreatePlaylistWithTracks,
  onViewLyrics,
  onMoveTrack,
  onRemoveTrack,
  onRemoveFromPlaylist,
  onPlayPlaylist,
  onDeletePlaylist,
  onToast,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [saveOpen, setSaveOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  useEffect(() => {
    setSaveOpen(false);
    setNewPlaylistName("");
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    setPosition({
      left: Math.min(Math.max(margin, menu.x), maxLeft),
      top: Math.min(Math.max(margin, menu.y), maxTop),
    });
  }, [menu, saveOpen, playlists.length]);

  useEffect(() => {
    if (!menu) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      onClose();
    };
    const handleResize = () => onClose();

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const handleShareTrack = async (track: TrackDTO) => {
    const shareText =
      track.uri ||
      (YOUTUBE_ID_REGEX.test(track.identifier) && track.sourceName === "youtube"
        ? `https://www.youtube.com/watch?v=${track.identifier}`
        : `${track.title} - ${track.author}`);
    const copied = await copyText(shareText);
    onToast(copied ? "success" : "error", copied ? "Link copied to clipboard" : "Failed to copy link");
    onClose();
  };

  const handleCreatePlaylist = (e: FormEvent, track: TrackDTO) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    onCreatePlaylistWithTracks(trimmed, [track]);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      className="fixed z-50 w-64 rounded-lg border border-white/10 bg-[#212121] py-1.5 text-sm text-zinc-100 shadow-2xl select-none"
    >
      {menu.kind === "track" ? (
        <>
          <div className="border-b border-white/8 px-4 py-2">
            <p className="truncate text-xs font-semibold text-white">{menu.track.title}</p>
            <p className="truncate text-[11px] text-zinc-400">{menu.track.author}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              onStartMix(menu.track);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
          >
            <Radio className="h-4 w-4 text-zinc-300" />
            <span>Start mix</span>
          </button>

          {!menu.isCurrent && (
            <button
              type="button"
              onClick={() => {
                onEnqueue([menu.track], "now");
                onClose();
              }}
              className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
            >
              <Play className="h-4 w-4 text-zinc-300" />
              <span>Play now</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onEnqueue([menu.track], "next");
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
          >
            <ListStart className="h-4 w-4 text-zinc-300" />
            <span>Play next</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onEnqueue([menu.track], "end");
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
          >
            <ListPlus className="h-4 w-4 text-zinc-300" />
            <span>Add to queue</span>
          </button>

          <button
            type="button"
            onClick={() => setSaveOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-2 text-left transition hover:bg-white/10"
          >
            <span className="flex items-center gap-3.5">
              <BookmarkPlus className="h-4 w-4 text-zinc-300" />
              <span>Save to playlist</span>
            </span>
            <ChevronRight
              className={`h-4 w-4 text-zinc-400 transition-transform ${saveOpen ? "rotate-90" : ""}`}
            />
          </button>

          {saveOpen && (
            <div className="mx-2 my-1 rounded-md border border-white/10 bg-[#181818] p-1.5">
              <div className="max-h-36 space-y-0.5 overflow-y-auto">
                {playlists.map((pl) => {
                  const alreadyIn = pl.tracks.some((t) => t.identifier === menu.track.identifier);
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        onAddToPlaylist(pl.id, menu.track);
                        onClose();
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs text-zinc-200 transition hover:bg-white/10"
                    >
                      <span className="truncate">{pl.name}</span>
                      {alreadyIn ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <span className="text-[10px] text-zinc-500">{pl.tracks.length}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <form
                onSubmit={(e) => handleCreatePlaylist(e, menu.track)}
                className="mt-1.5 flex items-center gap-1 border-t border-white/10 pt-1.5"
              >
                <input
                  type="text"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  placeholder="New playlist..."
                  className="min-w-0 flex-1 rounded bg-[#242424] px-2 py-1 text-xs text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-white/30"
                />
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  title="Create and save"
                  className="rounded bg-white px-2 py-1 text-xs font-medium text-black hover:bg-zinc-200 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onViewLyrics(menu.track);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
          >
            <Mic2 className="h-4 w-4 text-zinc-300" />
            <span>View lyrics</span>
          </button>

          <button
            type="button"
            onClick={() => void handleShareTrack(menu.track)}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
          >
            <Share2 className="h-4 w-4 text-zinc-300" />
            <span>Share</span>
          </button>

          {((typeof menu.queueIndex === "number" && privileged) ||
            (menu.playlistId && typeof menu.playlistTrackIndex === "number")) && (
            <>
              <div className="my-1 border-t border-white/10" />

              {typeof menu.queueIndex === "number" && privileged && (
                <>
                  {menu.queueIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onMoveTrack(menu.queueIndex!, 0);
                        onClose();
                      }}
                      className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
                    >
                      <ArrowUpToLine className="h-4 w-4 text-zinc-300" />
                      <span>Move to top</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onRemoveTrack(menu.queueIndex!);
                      onClose();
                    }}
                    className="flex w-full items-center gap-3.5 px-4 py-2 text-left text-zinc-200 transition hover:bg-rose-500/15 hover:text-rose-200"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Remove from queue</span>
                  </button>
                </>
              )}

              {menu.playlistId && typeof menu.playlistTrackIndex === "number" && (
                <button
                  type="button"
                  onClick={() => {
                    onRemoveFromPlaylist(menu.playlistId!, menu.playlistTrackIndex!);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3.5 px-4 py-2 text-left text-zinc-200 transition hover:bg-rose-500/15 hover:text-rose-200"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Remove from playlist</span>
                </button>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="border-b border-white/8 px-4 py-2">
            <p className="truncate text-xs font-semibold text-white">{menu.playlist.name}</p>
            <p className="truncate text-[11px] text-zinc-400">
              {menu.playlist.tracks.length}{" "}
              {menu.playlist.tracks.length === 1 ? "track" : "tracks"}
            </p>
          </div>

          <button
            type="button"
            disabled={menu.playlist.tracks.length === 0}
            onClick={() => {
              onPlayPlaylist(menu.playlist.id, false);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10 disabled:opacity-40"
          >
            <Play className="h-4 w-4 text-zinc-300" />
            <span>Play</span>
          </button>

          <button
            type="button"
            disabled={menu.playlist.tracks.length === 0}
            onClick={() => {
              onPlayPlaylist(menu.playlist.id, true);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10 disabled:opacity-40"
          >
            <Shuffle className="h-4 w-4 text-zinc-300" />
            <span>Shuffle play</span>
          </button>

          <button
            type="button"
            disabled={menu.playlist.tracks.length === 0}
            onClick={() => {
              onEnqueue(menu.playlist.tracks, "end", menu.playlist.name);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10 disabled:opacity-40"
          >
            <ListPlus className="h-4 w-4 text-zinc-300" />
            <span>Add to queue</span>
          </button>

          <div className="my-1 border-t border-white/10" />

          <button
            type="button"
            onClick={() => {
              onDeletePlaylist(menu.playlist.id);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left text-zinc-200 transition hover:bg-rose-500/15 hover:text-rose-200"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete playlist</span>
          </button>
        </>
      )}
    </div>
  );
}
