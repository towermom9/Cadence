import {
  Disc3,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { PlayerStateDTO, RepeatModeType } from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";

interface Props {
  playerState: PlayerStateDTO | null;
  displayPosition: number;
  onTogglePause: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onSeek: (ms: number) => void;
  onVolume: (vol: number) => void;
  onRepeat: (mode: RepeatModeType) => void;
  onShuffle: () => void;
  onToggleAutoplay: (enabled: boolean) => void;
  onStop: () => void;
}

export function PlayerBar({
  playerState,
  displayPosition,
  onTogglePause,
  onSkip,
  onPrevious,
  onSeek,
  onVolume,
  onRepeat,
  onShuffle,
  onToggleAutoplay,
  onStop,
}: Props) {
  const track = playerState?.current ?? null;
  const duration = track?.duration || 0;
  const clampedPos = duration > 0 ? Math.min(duration, Math.max(0, displayPosition)) : 0;
  const hasPlayer = Boolean(playerState?.connected && track);

  const cycleRepeat = () => {
    const current = playerState?.repeatMode ?? "off";
    const next: RepeatModeType =
      current === "off" ? "queue" : current === "queue" ? "track" : "off";
    onRepeat(next);
  };

  return (
    <footer className="border-t border-white/8 bg-[#111116]/95 px-4 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Track metadata */}
        <div className="flex min-w-0 items-center gap-3 md:w-72">
          {track?.artworkUrl ? (
            <img
              src={track.artworkUrl}
              alt={track.title}
              className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-zinc-500">
              <Disc3 className="h-6 w-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {track ? track.title : "Nothing playing"}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
              <span className="truncate">{track ? track.author : "Queue a track to start"}</span>
              {track && (
                <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                  {sourceLabel(track.sourceName)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center transport & progress */}
        <div className="flex flex-1 flex-col items-center gap-1.5 md:max-w-xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!hasPlayer}
              onClick={onShuffle}
              title="Shuffle queue"
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!hasPlayer}
              onClick={onPrevious}
              title="Previous track"
              className="rounded-lg p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!hasPlayer}
              onClick={onTogglePause}
              title={playerState?.paused ? "Resume" : "Pause"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-950 shadow-md transition hover:scale-105 disabled:opacity-40"
            >
              {playerState?.paused ? (
                <Play className="ml-0.5 h-4 w-4 fill-current" />
              ) : (
                <Pause className="h-4 w-4 fill-current" />
              )}
            </button>
            <button
              type="button"
              disabled={!hasPlayer}
              onClick={onSkip}
              title="Skip track"
              className="rounded-lg p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!hasPlayer}
              onClick={cycleRepeat}
              title={`Repeat: ${playerState?.repeatMode ?? "off"}`}
              className={`rounded-lg p-2 transition hover:bg-white/10 disabled:opacity-40 ${
                playerState?.repeatMode !== "off" ? "text-violet-400" : "text-zinc-400"
              }`}
            >
              {playerState?.repeatMode === "track" ? (
                <Repeat1 className="h-4 w-4" />
              ) : (
                <Repeat className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              disabled={!playerState}
              onClick={() => onToggleAutoplay(!playerState?.autoplay)}
              title="Toggle Autoplay"
              className={`rounded-lg p-2 transition hover:bg-white/10 disabled:opacity-40 ${
                playerState?.autoplay ? "text-emerald-400" : "text-zinc-400"
              }`}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>

          <div className="flex w-full items-center gap-2.5 text-[11px] tabular-nums text-zinc-400">
            <span className="w-10 text-right">{formatMs(clampedPos)}</span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 100}
              value={duration > 0 ? clampedPos : 0}
              disabled={!hasPlayer || Boolean(track?.isStream)}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-violet-500 disabled:cursor-default disabled:opacity-50"
            />
            <span className="w-10">
              {track?.isStream ? (
                <span className="inline-flex items-center gap-1 text-rose-400">
                  <Radio className="h-3 w-3" />
                  LIVE
                </span>
              ) : (
                formatMs(duration)
              )}
            </span>
          </div>
        </div>

        {/* Volume & VC status */}
        <div className="flex items-center justify-between gap-3 md:w-72 md:justify-end">
          {playerState?.voiceChannelName && (
            <div className="hidden items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-300 xl:flex">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span className="max-w-28 truncate">{playerState.voiceChannelName}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!playerState?.connected}
              onClick={() => onVolume(playerState?.volume === 0 ? 100 : 0)}
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              title="Mute / Unmute"
            >
              {playerState?.volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={150}
              value={playerState?.volume ?? 100}
              disabled={!playerState?.connected}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-zinc-800 accent-violet-500 disabled:opacity-40"
            />
            <span className="w-9 text-right text-xs tabular-nums text-zinc-400">
              {playerState?.volume ?? 100}%
            </span>
          </div>

          {playerState?.connected && (
            <button
              type="button"
              onClick={onStop}
              title="Stop & disconnect"
              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
            >
              <Square className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
