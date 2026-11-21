import { useState, type FormEvent, type MouseEvent } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Link2,
  MoreVertical,
  Pencil,
  Play,
  RefreshCw,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import type { EnqueueMode, PlaylistDTO, TrackDTO } from "@shared/types";
import { formatMs, formatRelativeTime, sourceLabel } from "../utils/format";
import type { TrackMenuContext } from "./ContextMenu";
import { PlaylistArtwork } from "./PlaylistArtwork";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  playlist: PlaylistDTO | null;
  onBack: () => void;
  onPlayPlaylist: (playlistId: string, shuffle?: boolean) => void;
  onRenamePlaylist: (playlistId: string, name: string) => void;
  onSyncPlaylist: (playlistId: string, url?: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveTrack: (playlistId: string, index: number) => void;
  onEnqueueTrack: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
}

export function PlaylistDetailView({
  playlist,
  onBack,
  onPlayPlaylist,
  onRenamePlaylist,
  onSyncPlaylist,
  onDeletePlaylist,
  onRemoveTrack,
  onEnqueueTrack,
  onOpenArtist,
  onTrackContextMenu,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [linkingUrl, setLinkingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  if (!playlist) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#121212] p-10 text-center text-sm text-zinc-400">
        Playlist not found.
        <button
          type="button"
          onClick={onBack}
          className="ml-3 text-white underline hover:text-zinc-200"
        >
          Back to Library
        </button>
      </div>
    );
  }

  const totalMs = playlist.tracks.reduce((sum, t) => sum + (t.duration || 0), 0);

  const handleRenameSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim()) return;
    onRenamePlaylist(playlist.id, renameValue.trim());
    setRenaming(false);
  };

  const handleLinkSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    onSyncPlaylist(playlist.id, urlInput.trim());
    setLinkingUrl(false);
    setUrlInput("");
  };

  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Library
      </button>

      {/* Hero Header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="h-44 w-44 shrink-0 overflow-hidden rounded-xl bg-[#181818] shadow-2xl ring-1 ring-white/10 sm:h-52 sm:w-52">
          <PlaylistArtwork playlist={playlist} className="h-full w-full" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Playlist
            </span>
            {playlist.sourceUrl && (
              <a
                href={playlist.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-zinc-200 transition hover:bg-white/15"
              >
                <RefreshCw className="h-3 w-3" />
                Synced {formatRelativeTime(playlist.lastSyncedAt)}
                <ExternalLink className="h-2.5 w-2.5 opacity-70" />
              </a>
            )}
          </div>

          {renaming ? (
            <form onSubmit={handleRenameSubmit} className="flex max-w-md items-center gap-2">
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-white/20 bg-[#121212] px-3 py-1.5 text-xl font-bold text-white outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="rounded-full px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-3">
              <h2 className="truncate text-3xl font-bold tracking-tight text-white">
                {playlist.name}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setRenameValue(playlist.name);
                  setRenaming(true);
                }}
                title="Rename playlist"
                className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}

          <p className="text-sm text-zinc-400">
            {playlist.tracks.length} {playlist.tracks.length === 1 ? "song" : "songs"} •{" "}
            {formatMs(totalMs)}
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={playlist.tracks.length === 0}
              onClick={() => onPlayPlaylist(playlist.id, false)}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
            >
              <Play className="h-4 w-4 fill-current" />
              Play
            </button>
            <button
              type="button"
              disabled={playlist.tracks.length === 0}
              onClick={() => onPlayPlaylist(playlist.id, true)}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:opacity-40"
            >
              <Shuffle className="h-4 w-4" />
              Shuffle
            </button>

            {playlist.sourceUrl ? (
              <button
                type="button"
                onClick={() => onSyncPlaylist(playlist.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
              >
                <RefreshCw className="h-4 w-4" />
                Sync
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setUrlInput("");
                  setLinkingUrl((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-200 transition hover:bg-white/15 hover:text-white"
              >
                <Link2 className="h-4 w-4" />
                Link URL
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onDeletePlaylist(playlist.id);
                onBack();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-200"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>

          {linkingUrl && (
            <form
              onSubmit={handleLinkSubmit}
              className="flex max-w-xl flex-wrap items-center gap-2 pt-2"
            >
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste online playlist URL to sync..."
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#121212] px-3 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/40"
              />
              <button
                type="submit"
                disabled={!urlInput.trim()}
                className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-40"
              >
                Save &amp; Sync
              </button>
              <button
                type="button"
                onClick={() => setLinkingUrl(false)}
                className="rounded-full px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Tracks */}
      {playlist.tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-[#121212] p-10 text-center text-sm text-zinc-400">
          This playlist has no tracks yet. Add songs from Search or the Player bar.
        </div>
      ) : (
        <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#121212]">
          {playlist.tracks.map((track, idx) => (
            <div
              key={`${track.identifier}-${idx}`}
              onClick={() => onEnqueueTrack([track], "now", playlist.name)}
              onContextMenu={(e) =>
                onTrackContextMenu(e, track, {
                  playlistId: playlist.id,
                  playlistTrackIndex: idx,
                })
              }
              className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]"
            >
              <span className="w-6 text-center text-xs tabular-nums text-zinc-500">
                {idx + 1}
              </span>
              <TrackArtwork
                track={track}
                className="h-10 w-10 shrink-0 rounded"
                iconClassName="h-4 w-4"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{track.title}</p>
                <p className="truncate text-xs text-zinc-400">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenArtist(track.author);
                    }}
                    className="hover:text-white hover:underline"
                  >
                    {track.author}
                  </button>
                  <span> • {sourceLabel(track.sourceName)}</span>
                </p>
              </div>
              <span className="hidden text-xs tabular-nums text-zinc-400 sm:inline">
                {track.isStream ? "LIVE" : formatMs(track.duration)}
              </span>
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5"
              >
                <button
                  type="button"
                  onClick={() => onEnqueueTrack([track], "now", playlist.name)}
                  title="Play now"
                  className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                >
                  <Play className="h-4 w-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveTrack(playlist.id, idx)}
                  title="Remove from playlist"
                  className="rounded-full p-2 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) =>
                    onTrackContextMenu(e, track, {
                      playlistId: playlist.id,
                      playlistTrackIndex: idx,
                    })
                  }
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
    </div>
  );
}
