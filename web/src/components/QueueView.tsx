import {
  ArrowDown,
  ArrowUp,
  Disc3,
  ListPlus,
  Play,
  Shuffle,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { PlayerStateDTO, PlaylistDTO, TrackDTO } from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";

interface Props {
  playerState: PlayerStateDTO | null;
  playlists: PlaylistDTO[];
  onPlayTrack: (index: number) => void;
  onMoveTrack: (from: number, to: number) => void;
  onRemoveTrack: (index: number) => void;
  onShuffle: () => void;
  onClear: () => void;
  onAddToPlaylist: (playlistId: string, track: TrackDTO) => void;
}

export function QueueView({
  playerState,
  playlists,
  onPlayTrack,
  onMoveTrack,
  onRemoveTrack,
  onShuffle,
  onClear,
  onAddToPlaylist,
}: Props) {
  const current = playerState?.current ?? null;
  const queue = playerState?.queue ?? [];
  const privileged = Boolean(playerState?.isPrivileged);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/8 bg-[#111116] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Now Playing</h2>
            <p className="text-xs text-zinc-400">
              {playerState?.voiceChannelName
                ? `Connected to #${playerState.voiceChannelName}`
                : "Not connected to a voice channel"}
            </p>
          </div>
          {playerState && playerState.listeners.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                {playerState.listeners.length} listener
                {playerState.listeners.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        {current ? (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            {current.artworkUrl ? (
              <img
                src={current.artworkUrl}
                alt={current.title}
                className="h-24 w-24 shrink-0 rounded-2xl border border-white/10 object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500">
                <Disc3 className="h-10 w-10" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-violet-600/20 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                  {sourceLabel(current.sourceName)}
                </span>
                {playerState?.activeFilter && playerState.activeFilter !== "none" && (
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                    Effect: {playerState.activeFilter}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 truncate text-xl font-semibold text-white">
                {current.title}
              </h3>
              <p className="truncate text-sm text-zinc-400">{current.author}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {current.isStream ? "Live stream" : formatMs(current.duration)}
                {current.requester ? ` • Requested by ${current.requester.username}` : ""}
              </p>
            </div>
            {playlists.length > 0 && (
              <button
                type="button"
                onClick={() => onAddToPlaylist(playlists[0].id, current)}
                className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 sm:self-center"
              >
                <ListPlus className="h-4 w-4" />
                Save to {playlists[0].name}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm text-zinc-400">
            No song is currently playing. Search for a track in Discover to start playback.
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/8 bg-[#111116] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white">
            Up Next ({queue.length})
          </h3>
          {queue.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!privileged || queue.length < 2}
                onClick={onShuffle}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
              >
                <Shuffle className="h-3.5 w-3.5" />
                Shuffle
              </button>
              <button
                type="button"
                disabled={!privileged}
                onClick={onClear}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          )}
        </div>

        {queue.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">The upcoming queue is empty.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {queue.map((track, idx) => (
              <div
                key={`${track.identifier}-${idx}`}
                className="flex items-center gap-3 rounded-xl border border-white/6 bg-[#14141b] p-2.5 transition hover:border-white/12"
              >
                <span className="w-6 text-center text-xs font-medium tabular-nums text-zinc-500">
                  {idx + 1}
                </span>
                {track.artworkUrl ? (
                  <img
                    src={track.artworkUrl}
                    alt={track.title}
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-[10px] text-zinc-500">
                    Audio
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{track.title}</p>
                  <p className="truncate text-xs text-zinc-400">
                    {track.author} • {track.isStream ? "LIVE" : formatMs(track.duration)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onPlayTrack(idx)}
                    title="Play this track now"
                    className="rounded-lg p-1.5 text-zinc-300 transition hover:bg-violet-600/30 hover:text-white"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </button>
                  {privileged && (
                    <>
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => onMoveTrack(idx, idx - 1)}
                        title="Move up"
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === queue.length - 1}
                        onClick={() => onMoveTrack(idx, idx + 1)}
                        title="Move down"
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveTrack(idx)}
                        title="Remove from queue"
                        className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
