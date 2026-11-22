import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUpToLine,
  BookmarkPlus,
  CircleMinus,
  ListPlus,
  ListStart,
  ListX,
  Mic2,
  Pin,
  PinOff,
  Play,
  Radio,
  RefreshCw,
  Share2,
  Shuffle,
  SkipForward,
  Sparkles,
  ThumbsUp,
  Trash2,
  UserRound,
} from "lucide-react";
import { splitArtists } from "@shared/artists";
import type { EnqueueMode, PlaylistDTO, ToastLevel, TrackDTO } from "@shared/types";

export interface TrackMenuContext {
  queueIndex?: number;
  previousIndex?: number;
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
  privileged: boolean;
  currentUserId: string;
  likedTrackIds: Set<string>;
  pinnedTrackIds: Set<string>;
  onClose: () => void;
  onStartMix: (track: TrackDTO) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onToggleLike: (track: TrackDTO) => void;
  onTogglePinTrack: (track: TrackDTO) => void;
  onFindRelated: (track: TrackDTO) => void;
  onSkip: () => void;
  onOpenSaveModal: (tracks: TrackDTO[]) => void;
  onOpenArtist: (artistName: string) => void;
  onViewLyrics: (track: TrackDTO) => void;
  onMoveTrack: (from: number, to: number) => void;
  onRemoveTrack: (index: number) => void;
  onRemovePreviousTrack: (index: number) => void;
  onDismissQueue: () => void;
  onRemoveFromPlaylist: (playlistId: string, index: number) => void;
  onPlayPlaylist: (playlistId: string, shuffle?: boolean) => void;
  onTogglePinPlaylist: (playlistId: string) => void;
  onSyncPlaylist: (playlistId: string) => void;
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
  privileged,
  currentUserId,
  likedTrackIds,
  pinnedTrackIds,
  onClose,
  onStartMix,
  onEnqueue,
  onToggleLike,
  onTogglePinTrack,
  onFindRelated,
  onSkip,
  onOpenSaveModal,
  onOpenArtist,
  onViewLyrics,
  onMoveTrack,
  onRemoveTrack,
  onRemovePreviousTrack,
  onDismissQueue,
  onRemoveFromPlaylist,
  onPlayPlaylist,
  onTogglePinPlaylist,
  onSyncPlaylist,
  onDeletePlaylist,
  onToast,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

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
  }, [menu]);

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

  return (
    <div
      ref={menuRef}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: `${position.left}px`, top: `${position.top}px` }}
      className="fixed z-50 max-h-[calc(100vh-16px)] w-64 overflow-y-auto rounded-lg border border-white/10 bg-[#212121] py-1.5 text-sm text-zinc-100 shadow-2xl select-none"
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
            disabled={menu.track.isStream}
            onClick={() => {
              onToggleLike(menu.track);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10 disabled:opacity-40"
          >
            <ThumbsUp
              className={`h-4 w-4 ${
                likedTrackIds.has(menu.track.identifier)
                  ? "fill-current text-white"
                  : "text-zinc-300"
              }`}
            />
            <span>
              {likedTrackIds.has(menu.track.identifier)
                ? "Remove from liked songs"
                : "Add to liked songs"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onOpenSaveModal([menu.track]);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
          >
            <BookmarkPlus className="h-4 w-4 text-zinc-300" />
            <span>Save to playlist</span>
          </button>

          {(typeof menu.queueIndex === "number" || typeof menu.previousIndex === "number") && (
            <>
              {(() => {
                const canRemove =
                  privileged ||
                  Boolean(menu.track.isAutoplay) ||
                  menu.track.requester?.id === currentUserId;
                return (
                  <button
                    type="button"
                    disabled={!canRemove}
                    title={
                      canRemove
                        ? "Remove from queue"
                        : "Requires DJ role or being the track requester"
                    }
                    onClick={() => {
                      if (typeof menu.queueIndex === "number") {
                        onRemoveTrack(menu.queueIndex);
                      } else if (typeof menu.previousIndex === "number") {
                        onRemovePreviousTrack(menu.previousIndex);
                      }
                      onClose();
                    }}
                    className="flex w-full items-center gap-3.5 px-4 py-2 text-left text-zinc-200 transition hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40"
                  >
                    <CircleMinus className="h-4 w-4" />
                    <span>Remove from queue</span>
                  </button>
                );
              })()}

              {privileged && typeof menu.queueIndex === "number" && menu.queueIndex > 0 && (
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
            </>
          )}

          {menu.isCurrent && (
            <button
              type="button"
              disabled={!privileged}
              title={!privileged ? "Requires DJ role" : undefined}
              onClick={() => {
                onSkip();
                onClose();
              }}
              className="flex w-full items-center gap-3.5 px-4 py-2 text-left text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
            >
              <SkipForward className="h-4 w-4 text-zinc-300" />
              <span>Skip current track</span>
            </button>
          )}

          {(() => {
            const artists = splitArtists(menu.track.author).slice(0, 3);
            return artists.map((artistName, idx) => (
              <button
                key={`${artistName}-${idx}`}
                type="button"
                onClick={() => {
                  onOpenArtist(artistName);
                  onClose();
                }}
                className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
              >
                <UserRound className="h-4 w-4 shrink-0 text-zinc-300" />
                <span className="truncate">
                  {artists.length > 1 ? `Go to ${artistName}` : "Go to artist"}
                </span>
              </button>
            ));
          })()}

          <button
            type="button"
            onClick={() => {
              onFindRelated(menu.track);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
          >
            <Sparkles className="h-4 w-4 text-zinc-300" />
            <span>Find related songs</span>
          </button>

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

          <button
            type="button"
            disabled={menu.track.isStream}
            onClick={() => {
              onTogglePinTrack(menu.track);
              onClose();
            }}
            className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10 disabled:opacity-40"
          >
            {pinnedTrackIds.has(menu.track.identifier) ? (
              <>
                <PinOff className="h-4 w-4 text-zinc-300" />
                <span>Unpin from Listen again</span>
              </>
            ) : (
              <>
                <Pin className="h-4 w-4 text-zinc-300" />
                <span>Pin to Listen again</span>
              </>
            )}
          </button>

          {(menu.isCurrent ||
            typeof menu.queueIndex === "number" ||
            typeof menu.previousIndex === "number") && (
            <button
              type="button"
              disabled={!privileged}
              title={!privileged ? "Requires DJ role" : "Clear upcoming queue"}
              onClick={() => {
                onDismissQueue();
                onClose();
              }}
              className="flex w-full items-center gap-3.5 px-4 py-2 text-left text-zinc-200 transition hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40"
            >
              <ListX className="h-4 w-4" />
              <span>Dismiss queue</span>
            </button>
          )}

          {menu.playlistId && typeof menu.playlistTrackIndex === "number" && (
            <>
              <div className="my-1 border-t border-white/10" />
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

          {!menu.playlist.isLiked && (
            <button
              type="button"
              onClick={() => {
                onTogglePinPlaylist(menu.playlist.id);
                onClose();
              }}
              className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
            >
              {menu.playlist.isPinned ? (
                <>
                  <PinOff className="h-4 w-4 text-zinc-300" />
                  <span>Unpin playlist</span>
                </>
              ) : (
                <>
                  <Pin className="h-4 w-4 text-zinc-300" />
                  <span>Pin playlist</span>
                </>
              )}
            </button>
          )}

          {menu.playlist.sourceUrl && (
            <button
              type="button"
              onClick={() => {
                onSyncPlaylist(menu.playlist.id);
                onClose();
              }}
              className="flex w-full items-center gap-3.5 px-4 py-2 text-left transition hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4 text-zinc-300" />
              <span>Sync playlist</span>
            </button>
          )}

          {!menu.playlist.isLiked && (
            <>
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
        </>
      )}
    </div>
  );
}
