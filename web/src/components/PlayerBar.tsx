import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  ThumbsUp,
  Volume2,
  VolumeX,
} from "lucide-react";
import type {
  FilterPreset,
  PlayerStateDTO,
  RepeatModeType,
  TrackDTO,
} from "@shared/types";
import type { PlaybackAnchor } from "../hooks/useCadenceSocket";
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
  playbackAnchor: PlaybackAnchor | null;
  displayPosition: number;
  drawerOpen: boolean;
  isCurrentLiked: boolean;
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
  onToggleLike: (track: TrackDTO) => void;
  onOpenSaveModal: (tracks: TrackDTO[]) => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
}

export function PlayerBar({
  playerState,
  playbackAnchor,
  displayPosition,
  drawerOpen,
  isCurrentLiked,
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
  onToggleLike,
  onOpenSaveModal,
  onOpenArtist,
  onTrackContextMenu,
}: Props) {
  const [isSeeking, setIsSeeking] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [hoverInfo, setHoverInfo] = useState<{ pct: number; ms: number } | null>(null);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(String(playerState?.volume ?? 100));
  const [isEditingVolume, setIsEditingVolume] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const scrubPosRef = useRef(0);
  const isSeekingRef = useRef(false);
  const effectsRef = useRef<HTMLDivElement>(null);

  const track = playerState?.current ?? null;
  const duration = track?.duration || 0;
  const clampedPos = duration > 0 ? Math.min(duration, Math.max(0, displayPosition)) : 0;
  const effectivePos = isSeeking ? scrubPosition : clampedPos;
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (effectivePos / duration) * 100)) : 0;
  const hasPlayer = Boolean(playerState?.connected && track);
  const canSeek = Boolean(hasPlayer && !track?.isStream && duration > 0);
  const activeFilter = playerState?.activeFilter ?? "none";
  const privileged = Boolean(playerState?.isPrivileged);
  const serverVolume = playerState?.volume ?? 100;

  useEffect(() => {
    if (!isEditingVolume) {
      setVolumeDraft(String(serverVolume));
    }
  }, [isEditingVolume, serverVolume]);

  const applyBarVisualPct = useCallback((pct: number) => {
    const safe = Math.min(100, Math.max(0, pct));
    if (fillRef.current) {
      fillRef.current.style.width = `${safe}%`;
    }
    if (thumbRef.current) {
      thumbRef.current.style.left = `${safe}%`;
    }
  }, []);

  // 60fps smooth DOM bar updates driven purely by performance.now() anchor
  useEffect(() => {
    if (isSeeking) {
      const pct = duration > 0 ? (scrubPosition / duration) * 100 : 0;
      applyBarVisualPct(pct);
      return;
    }

    if (
      !playbackAnchor ||
      !playbackAnchor.playing ||
      playbackAnchor.paused ||
      playbackAnchor.isStream ||
      playbackAnchor.duration <= 0
    ) {
      const pos = playbackAnchor?.position ?? clampedPos;
      const dur = playbackAnchor?.duration || duration;
      applyBarVisualPct(dur > 0 ? (pos / dur) * 100 : 0);
      return;
    }

    let rafId = 0;
    const tick = () => {
      const elapsed = performance.now() - playbackAnchor.syncedAt;
      const pos = Math.min(playbackAnchor.duration, Math.max(0, playbackAnchor.position + elapsed));
      applyBarVisualPct((pos / playbackAnchor.duration) * 100);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [applyBarVisualPct, clampedPos, duration, isSeeking, playbackAnchor, scrubPosition]);

  const computeFromClientX = useCallback(
    (clientX: number): { pct: number; ms: number } | null => {
      const el = barRef.current;
      if (!el || duration <= 0) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return { pct: ratio * 100, ms: Math.round(ratio * duration) };
    },
    [duration]
  );

  const handleBarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canSeek || e.button !== 0) return;
    const hit = computeFromClientX(e.clientX);
    if (!hit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isSeekingRef.current = true;
    scrubPosRef.current = hit.ms;
    setScrubPosition(hit.ms);
    setHoverInfo(hit);
    setIsSeeking(true);
    applyBarVisualPct(hit.pct);
  };

  const handleBarPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const hit = computeFromClientX(e.clientX);
    if (!hit) return;
    setHoverInfo(hit);
    if (isSeekingRef.current) {
      scrubPosRef.current = hit.ms;
      setScrubPosition(hit.ms);
      applyBarVisualPct(hit.pct);
    }
  };

  const finishPointerSeek = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    if (!isSeekingRef.current) return;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore if pointer capture already released
    }
    const targetMs = scrubPosRef.current;
    isSeekingRef.current = false;
    setIsSeeking(false);
    setHoverInfo(null);
    if (commit) {
      onSeek(targetMs);
    }
  };

  const handleBarKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = Math.max(0, clampedPos - 5000);
    else if (e.key === "ArrowRight") next = Math.min(duration, clampedPos + 5000);
    else if (e.key === "PageDown") next = Math.max(0, clampedPos - 15_000);
    else if (e.key === "PageUp") next = Math.min(duration, clampedPos + 15_000);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = duration;
    if (next !== null) {
      e.preventDefault();
      onSeek(Math.round(next));
    }
  };

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
      {/* Thin YouTube Music red seek bar across the top edge (pointer-captured 60fps scrub) */}
      <div
        ref={barRef}
        role="slider"
        tabIndex={canSeek ? 0 : -1}
        aria-label="Seek track position"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(effectivePos)}
        onPointerDown={handleBarPointerDown}
        onPointerMove={handleBarPointerMove}
        onPointerUp={(e) => finishPointerSeek(e, true)}
        onPointerCancel={(e) => finishPointerSeek(e, false)}
        onPointerLeave={() => {
          if (!isSeekingRef.current) setHoverInfo(null);
        }}
        onKeyDown={handleBarKeyDown}
        className={`group/bar relative flex h-3 w-full touch-none select-none items-start -mt-1 pt-1 outline-none ${
          canSeek ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {hoverInfo && canSeek && (
          <div
            style={{ left: `${Math.min(97, Math.max(3, hoverInfo.pct))}%` }}
            className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-black/90 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white shadow ring-1 ring-white/15"
          >
            {formatMs(hoverInfo.ms)}
          </div>
        )}
        <div
          className={`relative w-full bg-white/15 transition-[height] ${
            canSeek ? "h-[3px] group-hover/bar:h-[5px]" : "h-[3px]"
          } ${isSeeking ? "!h-[5px]" : ""}`}
        >
          <div
            ref={fillRef}
            style={{ width: `${progressPct}%` }}
            className="pointer-events-none h-full bg-[#ff0033]"
          />
          {canSeek && (
            <div
              ref={thumbRef}
              style={{ left: `${progressPct}%` }}
              className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff0033] shadow transition-opacity ${
                isSeeking ? "scale-110 opacity-100" : "opacity-0 group-hover/bar:opacity-100"
              }`}
            />
          )}
        </div>
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
            <div className="hidden items-center gap-0.5 sm:flex">
              <button
                type="button"
                disabled={track.isStream}
                onClick={() => onToggleLike(track)}
                title={isCurrentLiked ? "Remove from Liked Music" : "Save to Liked Music"}
                aria-label={isCurrentLiked ? "Remove from Liked Music" : "Save to Liked Music"}
                className={`rounded-full p-2 transition hover:bg-white/10 disabled:opacity-35 ${
                  isCurrentLiked ? "text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                <ThumbsUp className={`h-4 w-4 ${isCurrentLiked ? "fill-current" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => onOpenSaveModal([track])}
                title="Save to playlist"
                className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              >
                <ListPlus className="h-4 w-4" />
              </button>
            </div>
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
