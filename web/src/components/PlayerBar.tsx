import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  ListPlus,
  Pause,
  PhoneOff,
  Play,
  Radio,
  Repeat,
  Repeat1,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import type {
  FilterPreset,
  PlayerStateDTO,
  RepeatModeType,
  TrackDTO,
} from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import type { TrackMenuContext } from "./ContextMenu";
import { TrackArtwork } from "./TrackArtwork";

const FILTER_PRESETS: { id: FilterPreset; name: string }[] = [
  { id: "none", name: "Clean / Off" },
  { id: "bassboost", name: "Bass Boost" },
  { id: "nightcore", name: "Nightcore" },
  { id: "vaporwave", name: "Vaporwave" },
  { id: "8d", name: "8D Audio" },
  { id: "karaoke", name: "Karaoke" },
  { id: "lowpass", name: "Low Pass" },
  { id: "tremolo", name: "Tremolo" },
  { id: "vibrato", name: "Vibrato" },
];

interface Props {
  playerState: PlayerStateDTO | null;
  displayPosition: number;
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
  onSetFilter: (preset: FilterPreset) => void;
  onStop: () => void;
  onOpenSaveModal: (tracks: TrackDTO[]) => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
}

export function PlayerBar({
  playerState,
  displayPosition,
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
  onSetFilter,
  onStop,
  onOpenSaveModal,
  onOpenArtist,
  onTrackContextMenu,
}: Props) {
  const [isSeeking, setIsSeeking] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(String(playerState?.volume ?? 100));
  const [isEditingVolume, setIsEditingVolume] = useState(false);

  const scrubPosRef = useRef(0);
  const isSeekingRef = useRef(false);
  const effectsRef = useRef<HTMLDivElement>(null);

  const track = playerState?.current ?? null;
  const duration = track?.duration || 0;
  const clampedPos = duration > 0 ? Math.min(duration, Math.max(0, displayPosition)) : 0;
  const effectivePos = isSeeking ? scrubPosition : clampedPos;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (effectivePos / duration) * 100)) : 0;
  const hasPlayer = Boolean(playerState?.connected && track);
  const activeFilter = playerState?.activeFilter ?? "none";
  const privileged = Boolean(playerState?.isPrivileged);
  const serverVolume = playerState?.volume ?? 100;

  useEffect(() => {
    if (!isEditingVolume) {
      setVolumeDraft(String(serverVolume));
    }
  }, [isEditingVolume, serverVolume]);

  useEffect(() => {
    if (!isSeeking) return;

    const commitSeek = () => {
      if (!isSeekingRef.current) return;
      isSeekingRef.current = false;
      setIsSeeking(false);
      onSeek(scrubPosRef.current);
    };

    window.addEventListener("pointerup", commitSeek);
    window.addEventListener("pointercancel", commitSeek);
    window.addEventListener("touchend", commitSeek);
    return () => {
      window.removeEventListener("pointerup", commitSeek);
      window.removeEventListener("pointercancel", commitSeek);
      window.removeEventListener("touchend", commitSeek);
    };
  }, [isSeeking, onSeek]);

  useEffect(() => {
    if (!effectsOpen) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (effectsRef.current && !effectsRef.current.contains(e.target as Node)) {
        setEffectsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [effectsOpen]);

  const cycleRepeat = () => {
    const current = playerState?.repeatMode ?? "off";
    const next: RepeatModeType =
      current === "off" ? "queue" : current === "queue" ? "track" : "off";
    onRepeat(next);
  };

  const commitVolumeDraft = () => {
    setIsEditingVolume(false);
    const parsed = Number.parseInt(volumeDraft.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      setVolumeDraft(String(serverVolume));
      return;
    }
    const clamped = Math.max(0, Math.min(150, parsed));
    setVolumeDraft(String(clamped));
    if (clamped !== serverVolume) {
      onVolume(clamped);
    }
  };

  const handleVolumeKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setVolumeDraft(String(serverVolume));
      setIsEditingVolume(false);
      e.currentTarget.blur();
    }
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
          value={duration > 0 ? effectivePos : 0}
          disabled={!hasPlayer || Boolean(track?.isStream)}
          onPointerDown={(e) => {
            if (!hasPlayer || track?.isStream) return;
            const val = Number(e.currentTarget.value);
            isSeekingRef.current = true;
            scrubPosRef.current = val;
            setScrubPosition(val);
            setIsSeeking(true);
          }}
          onTouchStart={(e) => {
            if (!hasPlayer || track?.isStream) return;
            const val = Number(e.currentTarget.value);
            isSeekingRef.current = true;
            scrubPosRef.current = val;
            setScrubPosition(val);
            setIsSeeking(true);
          }}
          onChange={(e) => {
            const val = Number(e.target.value);
            scrubPosRef.current = val;
            setScrubPosition(val);
            if (!isSeekingRef.current) {
              isSeekingRef.current = true;
              setIsSeeking(true);
            }
          }}
          onKeyUp={(e) => {
            if (
              e.key === "ArrowLeft" ||
              e.key === "ArrowRight" ||
              e.key === "Home" ||
              e.key === "End" ||
              e.key === "PageUp" ||
              e.key === "PageDown"
            ) {
              const val = Number(e.currentTarget.value);
              isSeekingRef.current = false;
              setIsSeeking(false);
              onSeek(val);
            }
          }}
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
              `${formatMs(effectivePos)} / ${formatMs(duration)}`
            )}
          </span>
        </div>

        {/* Center: Track info (click toggles Now Playing view) */}
        <div className="flex min-w-0 max-w-md flex-1 items-center justify-center gap-2">
          <div
            onClick={onToggleDrawer}
            onContextMenu={(e) => {
              if (!track) return;
              onTrackContextMenu(e, track, { isCurrent: true });
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleDrawer();
              }
            }}
            className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-white/[0.06]"
          >
            <TrackArtwork
              track={track}
              className="h-10 w-10 shrink-0 rounded"
              iconClassName="h-5 w-5"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {track ? track.title : "Nothing playing"}
              </p>
              <p className="truncate text-xs text-zinc-400">
                {track ? (
                  <>
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
                  </>
                ) : playerState?.voiceChannelName ? (
                  `Connected to #${playerState.voiceChannelName}`
                ) : (
                  "Search or pick a track to play"
                )}
              </p>
            </div>
          </div>

          {track && (
            <button
              type="button"
              onClick={() => onOpenSaveModal([track])}
              title="Save to playlist"
              className="hidden rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <ListPlus className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Right: Volume + Percentage, Effects, Repeat, Shuffle, Autoplay, Disconnect, Now Playing toggle */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <div className="hidden items-center gap-1.5 md:flex">
            <button
              type="button"
              disabled={!playerState?.connected || !privileged}
              onClick={() => onVolume(serverVolume === 0 ? 100 : 0)}
              title="Mute / Unmute"
              className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              {serverVolume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={150}
              value={serverVolume}
              disabled={!playerState?.connected || !privileged}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolumeDraft(String(v));
                onVolume(v);
              }}
              aria-label="Volume slider"
              className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/25 accent-white disabled:opacity-40"
            />
            <div className="flex items-center rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 focus-within:border-white/35">
              <input
                type="text"
                inputMode="numeric"
                aria-label="Volume percentage"
                disabled={!playerState?.connected || !privileged}
                value={volumeDraft}
                onFocus={(e) => {
                  setIsEditingVolume(true);
                  e.currentTarget.select();
                }}
                onChange={(e) => setVolumeDraft(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                onBlur={commitVolumeDraft}
                onKeyDown={handleVolumeKeyDown}
                className="w-7 bg-transparent text-right text-xs tabular-nums text-zinc-200 outline-none disabled:opacity-40"
              />
              <span className="ml-0.5 text-[11px] text-zinc-400">%</span>
            </div>
          </div>

          {/* DSP Audio Effects Popover */}
          <div ref={effectsRef} className="relative hidden sm:block">
            <button
              type="button"
              disabled={!playerState?.connected || !privileged}
              onClick={() => setEffectsOpen((v) => !v)}
              title="Audio effects"
              className={`rounded-full p-2 transition hover:bg-white/10 disabled:opacity-40 ${
                activeFilter !== "none" ? "text-[#ff0033]" : "text-zinc-400 hover:text-white"
              }`}
            >
              <Sliders className="h-4 w-4" />
            </button>

            {effectsOpen && (
              <div className="absolute bottom-11 right-0 z-50 w-52 rounded-xl border border-white/12 bg-[#212121] p-1.5 shadow-2xl">
                <div className="flex items-center justify-between px-2.5 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Audio effects
                  </span>
                  {activeFilter !== "none" && (
                    <button
                      type="button"
                      onClick={() => {
                        onSetFilter("none");
                        setEffectsOpen(false);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </button>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {FILTER_PRESETS.map((preset) => {
                    const selected = activeFilter === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          onSetFilter(selected && preset.id !== "none" ? "none" : preset.id);
                          setEffectsOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                          selected
                            ? "bg-white/15 font-semibold text-white"
                            : "text-zinc-300 hover:bg-white/10"
                        }`}
                      >
                        <span>{preset.name}</span>
                        {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
            disabled={!playerState?.connected || !privileged}
            onClick={onStop}
            title={
              playerState?.voiceChannelName
                ? `Disconnect from #${playerState.voiceChannelName}`
                : "Disconnect"
            }
            className="rounded-full p-2 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-35"
          >
            <PhoneOff className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleDrawer}
            title={drawerOpen ? "Close Now Playing" : "Open Up Next, Lyrics & Related"}
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
