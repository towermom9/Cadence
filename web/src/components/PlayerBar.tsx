import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Disc3,
  ListPlus,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { PlayerStateDTO, PlaylistDTO, RepeatModeType, TrackDTO } from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";

interface Props {
  playerState: PlayerStateDTO | null;
  displayPosition: number;
  playlists: PlaylistDTO[];
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  onTogglePause: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onSeek: (ms: number) => void;
  onVolume: (vol: number) => void;
  onRepeat: (mode: RepeatModeType) => void;
  onShuffle: () => void;
  onToggleAutoplay: (enabled: boolean) => void;
  onAddToPlaylist: (playlistId: string, track: TrackDTO) => void;
}

export function PlayerBar({
  playerState,
  displayPosition,
  playlists,
  drawerOpen,
  onToggleDrawer,
  onTogglePause,
  onSkip,
  onPrevious,
  onSeek,
  onVolume,
  onRepeat,
  onShuffle,
  onToggleAutoplay,
  onAddToPlaylist,
}: Props) {
  const [playlistMenuOpen, setPlaylistMenuOpen] = useState(false);

  const track = playerState?.current ?? null;
  const duration = track?.duration || 0;
  const clampedPos = duration > 0 ? Math.min(duration, Math.max(0, displayPosition)) : 0;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (clampedPos / duration) * 100)) : 0;
  const hasPlayer = Boolean(playerState?.connected && track);

  const cycleRepeat = () => {
    const current = playerState?.repeatMode ?? "off";
    const next: RepeatModeType =
      current === "off" ? "queue" : current === "queue" ? "track" : "off";
    onRepeat(next);
  };

  return (
    <footer className="relative z-40 bg-[#212121]">
      {/* Thin YouTube Music red seek bar across the top edge */}
      <div className="relative h-1 w-full bg-white/15">
        <div
          className="pointer-events-none absolute left-0 top-0 h-full bg-[#ff0033]"
          style={{ width: `${progressPct}%` }}
        />
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 100}
          value={duration > 0 ? clampedPos : 0}
          disabled={!hasPlayer || Boolean(track?.isStream)}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Seek track position"
          className="ytm-progress absolute inset-x-0 -top-1.5 h-4 w-full disabled:cursor-default"
        />
      </div>

      <div className="flex h-[72px] items-center justify-between gap-3 px-4">
        {/* Left: Playback transport + timestamp */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            disabled={!hasPlayer}
            onClick={onPrevious}
            title="Previous"
            className="rounded-full p-2 text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <SkipBack className="h-5 w-5 fill-current" />
          </button>

          <button
            type="button"
            disabled={!hasPlayer}
            onClick={onTogglePause}
            title={playerState?.paused ? "Play" : "Pause"}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-40"
          >
            {playerState?.paused || !hasPlayer ? (
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            ) : (
              <Pause className="h-6 w-6 fill-current" />
            )}
          </button>

          <button
            type="button"
            disabled={!hasPlayer}
            onClick={onSkip}
            title="Next"
            className="rounded-full p-2 text-zinc-200 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </button>

          <span className="ml-2 hidden text-xs tabular-nums text-zinc-400 md:inline">
            {track?.isStream ? (
              <span className="inline-flex items-center gap-1 text-[#ff0033]">
                <Radio className="h-3 w-3" />
                LIVE
              </span>
            ) : (
              `${formatMs(clampedPos)} / ${formatMs(duration)}`
            )}
          </span>
        </div>

        {/* Center: Track info (click toggles Now Playing drawer) */}
        <div className="flex min-w-0 max-w-md flex-1 items-center justify-center gap-3">
          <button
            type="button"
            onClick={onToggleDrawer}
            className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-white/[0.06]"
          >
            {track?.artworkUrl ? (
              <img
                src={track.artworkUrl}
                alt={track.title}
                className="h-10 w-10 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                <Disc3 className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {track ? track.title : "Nothing playing"}
              </p>
              <p className="truncate text-xs text-zinc-400">
                {track
                  ? `${track.author} • ${sourceLabel(track.sourceName)}`
                  : playerState?.voiceChannelName
                    ? `Connected to #${playerState.voiceChannelName}`
                    : "Search or pick a track to play"}
              </p>
            </div>
          </button>

          {track && playlists.length > 0 && (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setPlaylistMenuOpen((v) => !v)}
                title="Save to playlist"
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <ListPlus className="h-4 w-4" />
              </button>
              {playlistMenuOpen && (
                <div className="absolute bottom-11 left-0 z-50 w-48 rounded-xl border border-white/12 bg-[#282828] p-1.5 shadow-2xl">
                  <p className="px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                    Save to playlist
                  </p>
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        onAddToPlaylist(pl.id, track);
                        setPlaylistMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
                    >
                      <span className="truncate">{pl.name}</span>
                      <span className="text-[10px] text-zinc-500">{pl.tracks.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Volume, Repeat, Shuffle, Autoplay, Drawer toggle */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="hidden items-center gap-1.5 md:flex">
            <button
              type="button"
              disabled={!playerState?.connected}
              onClick={() => onVolume(playerState?.volume === 0 ? 100 : 0)}
              title="Mute / Unmute"
              className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
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
              aria-label="Volume"
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/25 accent-white disabled:opacity-40"
            />
          </div>

          <button
            type="button"
            disabled={!hasPlayer}
            onClick={cycleRepeat}
            title={`Repeat: ${playerState?.repeatMode ?? "off"}`}
            className={`hidden rounded-full p-2 transition hover:bg-white/10 disabled:opacity-40 sm:inline-flex ${
              playerState?.repeatMode !== "off" ? "text-white" : "text-zinc-400"
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
            disabled={!hasPlayer}
            onClick={onShuffle}
            title="Shuffle queue"
            className="hidden rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40 sm:inline-flex"
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <button
            type="button"
            disabled={!playerState}
            onClick={() => onToggleAutoplay(!playerState?.autoplay)}
            title="Toggle Autoplay"
            className={`hidden rounded-full p-2 transition hover:bg-white/10 disabled:opacity-40 sm:inline-flex ${
              playerState?.autoplay ? "text-emerald-400" : "text-zinc-400"
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleDrawer}
            title={drawerOpen ? "Close player drawer" : "Open Up Next, Lyrics & Effects"}
            className="inline-flex items-center gap-1 rounded-full p-2 text-zinc-200 transition hover:bg-white/10 hover:text-white"
          >
            {drawerOpen ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronUp className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </footer>
  );
}
