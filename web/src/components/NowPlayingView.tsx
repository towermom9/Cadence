import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  GripVertical,
  ListPlus,
  Loader2,
  MoreVertical,
  Pause,
  PhoneOff,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  ThumbsUp,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type {
  AutoplayMood,
  EnqueueMode,
  LyricsDTO,
  PlayerStateDTO,
  RepeatModeType,
  TrackDTO,
  UserPreferencesDTO,
} from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import { ArtistLinks } from "./ArtistLinks";
import type { TrackMenuContext } from "./ContextMenu";
import { TrackArtwork } from "./TrackArtwork";

export type NowPlayingTab = "upnext" | "lyrics" | "related";

const AUTOPLAY_MOODS: { id: AutoplayMood; label: string }[] = [
  { id: "all", label: "All" },
  { id: "familiar", label: "Familiar" },
  { id: "discover", label: "Discover" },
  { id: "popular", label: "Popular" },
  { id: "deep_cuts", label: "Deep cuts" },
  { id: "chill", label: "Chill" },
  { id: "upbeat", label: "Upbeat" },
];

interface Props {
  playerState: PlayerStateDTO | null;
  displayPosition: number;
  lyricsState: {
    guildId: string;
    lyrics: LyricsDTO | null;
    loading: boolean;
  };
  lyricsSubjectTrack: TrackDTO | null;
  relatedSubjectTrack: TrackDTO | null;
  activeTab: NowPlayingTab;
  ambienceMode: boolean;
  showArtworkSeekButtons: boolean;
  artworkSeekSeconds: number;
  lyricsAutoScroll: boolean;
  likedTrackIds: Set<string>;
  onTabChange: (tab: NowPlayingTab) => void;
  onCloseMobile?: () => void;
  onTogglePause: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onRepeat: (mode: RepeatModeType) => void;
  onVolume: (vol: number) => void;
  onStop: () => void;
  onSeek: (ms: number) => void;
  onSeekBy: (deltaMs: number) => void;
  onPlayTrack: (index: number) => void;
  onPlayPrevious: (index: number) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onStartMix: (track: TrackDTO) => void;
  onMoveTrack: (from: number, to: number) => void;
  onMovePreviousTrack: (from: number, to: number) => void;
  onMovePreviousToQueue: (previousIndex: number, queueIndex: number) => void;
  onMoveQueueToPrevious: (queueIndex: number, previousIndex: number) => void;
  onMoveCurrentToQueue: (queueIndex: number) => void;
  onMoveCurrentToPrevious: (previousIndex: number) => void;
  onRemoveTrack: (index: number) => void;
  onRemovePreviousTrack: (index: number) => void;
  onShuffle: () => void;
  onClear: () => void;
  onToggleLike: (track: TrackDTO) => void;
  onToggleAutoplay: (enabled: boolean) => void;
  onSetAutoplayMood: (mood: AutoplayMood) => void;
  onUpdatePreferences: (patch: Partial<UserPreferencesDTO>) => void;
  onFetchLyrics: (title?: string, artist?: string, duration?: number) => void;
  onOpenSaveModal: (tracks: TrackDTO[]) => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
  appVersion?: string;
}

interface SyncedWord {
  timeMs: number;
  text: string;
}

interface SyncedLine {
  timeMs: number;
  text: string;
  words?: SyncedWord[];
}

function toTimestampMs(minStr: string, secStr: string, fracStr?: string): number {
  const min = Number(minStr);
  const sec = Number(secStr);
  const frac = fracStr ? Number(fracStr.padEnd(3, "0").slice(0, 3)) : 0;
  return min * 60_000 + sec * 1000 + frac;
}

function stripInlineTags(raw: string): string {
  return raw
    .replace(/<\d{1,3}:\d{2}(?:\.\d{1,3})?>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^ +| +$/gm, "");
}

function parseEnhancedBody(
  body: string,
  lineTimeMs: number,
  offsetMs: number
): { text: string; words?: SyncedWord[] } {
  const inlineRegex = /<(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?>/g;
  if (!inlineRegex.test(body)) {
    const clean = body.trim() || "♪";
    return { text: clean };
  }

  inlineRegex.lastIndex = 0;
  const words: SyncedWord[] = [];
  let lastIdx = 0;
  let activeTime = lineTimeMs;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(body)) !== null) {
    const chunk = body.slice(lastIdx, match.index);
    const cleaned = chunk.replace(/\s+/g, " ").trim();
    if (cleaned) {
      words.push({ timeMs: activeTime, text: cleaned });
    }
    activeTime = Math.max(0, toTimestampMs(match[1], match[2], match[3]) - offsetMs);
    lastIdx = match.index + match[0].length;
  }

  const tail = body.slice(lastIdx).replace(/\s+/g, " ").trim();
  if (tail) {
    words.push({ timeMs: activeTime, text: tail });
  }

  const plain = words.map((w) => w.text).join(" ").trim() || "♪";
  return words.length > 0 ? { text: plain, words } : { text: plain };
}

function parseSyncedLyrics(raw: string | null | undefined): SyncedLine[] {
  if (!raw) return [];
  const rawLines = raw.split(/\r?\n/);

  let offsetMs = 0;
  for (const l of rawLines) {
    const om = l.match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (om) {
      offsetMs = Number(om[1]) || 0;
      break;
    }
  }

  const lines: SyncedLine[] = [];
  const prefixPattern = /^((?:\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]\s*)+)(.*)$/;
  const singleTagPattern = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  for (const rawLine of rawLines) {
    const match = rawLine.match(prefixPattern);
    if (!match) continue;
    const tagBlock = match[1];
    const body = match[2] ?? "";

    singleTagPattern.lastIndex = 0;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = singleTagPattern.exec(tagBlock)) !== null) {
      const timeMs = Math.max(
        0,
        toTimestampMs(tagMatch[1], tagMatch[2], tagMatch[3]) - offsetMs
      );
      const parsed = parseEnhancedBody(body, timeMs, offsetMs);
      lines.push({ timeMs, text: parsed.text, words: parsed.words });
    }
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

export function NowPlayingView({
  playerState,
  displayPosition,
  lyricsState,
  lyricsSubjectTrack,
  relatedSubjectTrack,
  activeTab,
  ambienceMode,
  showArtworkSeekButtons,
  artworkSeekSeconds,
  lyricsAutoScroll,
  likedTrackIds,
  onTabChange,
  onCloseMobile,
  onTogglePause,
  onSkip,
  onPrevious,
  onRepeat,
  onVolume,
  onStop,
  onSeek,
  onSeekBy,
  onPlayTrack,
  onPlayPrevious,
  onEnqueue,
  onStartMix,
  onMoveTrack,
  onMovePreviousTrack,
  onMovePreviousToQueue,
  onMoveQueueToPrevious,
  onMoveCurrentToQueue,
  onMoveCurrentToPrevious,
  onRemoveTrack,
  onRemovePreviousTrack,
  onShuffle,
  onClear,
  onToggleLike,
  onToggleAutoplay,
  onSetAutoplayMood,
  onUpdatePreferences,
  onFetchLyrics,
  onOpenSaveModal,
  onOpenArtist,
  onTrackContextMenu,
  appVersion = __CADENCE_VERSION__,
}: Props) {
  type DragTimelineItem =
    | { section: "previous"; prevIndex: number; displayIdx: number }
    | { section: "current" }
    | { section: "manual"; queueIndex: number }
    | { section: "autoplay"; queueIndex: number };

  const [relatedCache, setRelatedCache] = useState<Record<string, TrackDTO[]>>({});
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [userScrolledAway, setUserScrolledAway] = useState(false);
  const [mobileVolume, setMobileVolume] = useState(() => playerState?.volume ?? 100);
  const [mobileScrub, setMobileScrub] = useState<number | null>(null);
  const [dragSource, setDragSource] = useState<DragTimelineItem | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTimelineItem | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"above" | "below" | null>(null);
  const isDraggingMobileVolRef = useRef(false);
  const justDraggedRef = useRef(false);
  const dragClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lyricLineRefs = useRef<(HTMLElement | null)[]>([]);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = playerState?.current ?? null;
  const queue = playerState?.queue ?? [];
  const autoplayEnabled = Boolean(playerState?.autoplay);
  const autoplayMood = playerState?.autoplayMood ?? "all";
  const privileged = Boolean(playerState?.isPrivileged);
  const stepSeconds = Math.max(5, Math.min(30, Math.round(artworkSeekSeconds || 10)));
  const resolvedQueueName =
    playerState?.queueName || current?.title || playerState?.guildName || "Queue";

  const previousEntries = useMemo(
    () =>
      (playerState?.previous ?? [])
        .map((track, prevIndex) => ({ track, prevIndex }))
        .reverse(),
    [playerState?.previous]
  );

  const resetDragState = useCallback(() => {
    setDragSource(null);
    setDragTarget(null);
    setDragOverPosition(null);
  }, []);

  useEffect(() => {
    resetDragState();
  }, [queue.length, previousEntries.length, resetDragState]);

  const markJustDragged = useCallback(() => {
    justDraggedRef.current = true;
    if (dragClearTimerRef.current) clearTimeout(dragClearTimerRef.current);
    dragClearTimerRef.current = setTimeout(() => {
      justDraggedRef.current = false;
    }, 150);
  }, []);

  const canDropTimeline = useCallback(
    (source: DragTimelineItem, target: DragTimelineItem): boolean => {
      // Strictly disallow dragging between Autoplay and main/past/current queue
      if (source.section === "autoplay" || target.section === "autoplay") {
        return source.section === "autoplay" && target.section === "autoplay";
      }
      return true;
    },
    []
  );

  const handleTimelineDrop = useCallback(
    (target: DragTimelineItem) => {
      if (!privileged || !dragSource || !canDropTimeline(dragSource, target)) {
        resetDragState();
        return;
      }
      const source = dragSource;
      const pos = dragOverPosition ?? "above";
      resetDragState();

      if (
        (source.section === "manual" && target.section === "manual") ||
        (source.section === "autoplay" && target.section === "autoplay")
      ) {
        const rawSlot = pos === "below" ? target.queueIndex + 1 : target.queueIndex;
        const to = rawSlot > source.queueIndex ? rawSlot - 1 : rawSlot;
        if (to !== source.queueIndex && to >= 0 && to < queue.length) {
          markJustDragged();
          onMoveTrack(source.queueIndex, to);
        }
        return;
      }

      if (source.section === "previous" && target.section === "previous") {
        const rawDisplaySlot = pos === "below" ? target.displayIdx + 1 : target.displayIdx;
        const finalDisplayIdx =
          rawDisplaySlot > source.displayIdx ? rawDisplaySlot - 1 : rawDisplaySlot;
        if (finalDisplayIdx !== source.displayIdx && previousEntries.length > 0) {
          const toPrev = Math.max(
            0,
            Math.min(previousEntries.length - 1, previousEntries.length - 1 - finalDisplayIdx)
          );
          if (toPrev !== source.prevIndex) {
            markJustDragged();
            onMovePreviousTrack(source.prevIndex, toPrev);
          }
        }
        return;
      }

      if (source.section === "previous" && target.section === "manual") {
        const rawQueueIdx = pos === "below" ? target.queueIndex + 1 : target.queueIndex;
        markJustDragged();
        onMovePreviousToQueue(source.prevIndex, Math.max(0, rawQueueIdx));
        return;
      }

      if (source.section === "manual" && target.section === "previous") {
        const rawDisplaySlot = pos === "below" ? target.displayIdx + 1 : target.displayIdx;
        const insertPrevIdx = Math.max(
          0,
          Math.min(previousEntries.length, previousEntries.length - rawDisplaySlot)
        );
        markJustDragged();
        onMoveQueueToPrevious(source.queueIndex, insertPrevIdx);
        return;
      }

      if (source.section === "manual" && target.section === "current") {
        markJustDragged();
        if (pos === "above") {
          onMoveQueueToPrevious(source.queueIndex, 0);
        } else if (source.queueIndex !== 0) {
          onMoveTrack(source.queueIndex, 0);
        }
        return;
      }

      if (source.section === "previous" && target.section === "current") {
        markJustDragged();
        if (pos === "above") {
          if (source.prevIndex !== 0) {
            onMovePreviousTrack(source.prevIndex, 0);
          }
        } else {
          onMovePreviousToQueue(source.prevIndex, 0);
        }
        return;
      }

      if (source.section === "current" && target.section === "manual") {
        const rawQueueIdx = pos === "below" ? target.queueIndex + 1 : target.queueIndex;
        if (rawQueueIdx > 0) {
          markJustDragged();
          onMoveCurrentToQueue(rawQueueIdx);
        }
        return;
      }

      if (source.section === "current" && target.section === "previous") {
        const rawDisplaySlot = pos === "below" ? target.displayIdx + 1 : target.displayIdx;
        const insertPrevIdx = Math.max(
          0,
          Math.min(previousEntries.length, previousEntries.length - rawDisplaySlot)
        );
        if (insertPrevIdx > 0) {
          markJustDragged();
          onMoveCurrentToPrevious(insertPrevIdx);
        }
      }
    },
    [
      canDropTimeline,
      dragOverPosition,
      dragSource,
      markJustDragged,
      onMoveCurrentToPrevious,
      onMoveCurrentToQueue,
      onMovePreviousToQueue,
      onMovePreviousTrack,
      onMoveQueueToPrevious,
      onMoveTrack,
      previousEntries.length,
      privileged,
      queue.length,
      resetDragState,
    ]
  );

  useEffect(() => {
    if (!isDraggingMobileVolRef.current && typeof playerState?.volume === "number") {
      setMobileVolume(playerState.volume);
    }
  }, [playerState?.volume]);

  const { manualEntries, autoplayEntries } = useMemo(() => {
    const manual: { track: TrackDTO; queueIndex: number }[] = [];
    const auto: { track: TrackDTO; queueIndex: number }[] = [];
    queue.forEach((track, queueIndex) => {
      if (track.isAutoplay) {
        auto.push({ track, queueIndex });
      } else {
        manual.push({ track, queueIndex });
      }
    });
    return { manualEntries: manual, autoplayEntries: auto };
  }, [queue]);

  const activeLyricsTrack = lyricsSubjectTrack ?? current;
  const canSeekLyrics = Boolean(
    current &&
      !current.isStream &&
      activeLyricsTrack &&
      activeLyricsTrack.identifier === current.identifier
  );
  const parsedSynced = useMemo(
    () => parseSyncedLyrics(lyricsState.lyrics?.syncedLyrics),
    [lyricsState.lyrics?.syncedLyrics]
  );

  const activeSyncedIndex = useMemo(() => {
    if (
      parsedSynced.length === 0 ||
      !current ||
      !activeLyricsTrack ||
      current.identifier !== activeLyricsTrack.identifier
    ) {
      return -1;
    }
    let idx = -1;
    for (let i = 0; i < parsedSynced.length; i++) {
      if (parsedSynced[i].timeMs <= displayPosition + 250) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [activeLyricsTrack, current, displayPosition, parsedSynced]);

  useEffect(() => {
    if (activeTab === "lyrics" && !lyricsSubjectTrack && current) {
      onFetchLyrics(current.title, current.author, current.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, current?.identifier, lyricsSubjectTrack?.identifier]);

  // Reset manual scroll pause when track or tab changes
  useEffect(() => {
    setUserScrolledAway(false);
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, [activeTab, activeLyricsTrack?.identifier]);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (dragClearTimerRef.current) clearTimeout(dragClearTimerRef.current);
    };
  }, []);

  const scrollActiveLyricIntoView = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const container = lyricsContainerRef.current;
      const lineEl = lyricLineRefs.current[index];
      if (!container || !lineEl) return;
      const containerRect = container.getBoundingClientRect();
      const lineRect = lineEl.getBoundingClientRect();
      const offsetInContainer = lineRect.top - containerRect.top + container.scrollTop;
      const targetTop = Math.max(
        0,
        offsetInContainer - container.clientHeight * 0.36 + lineEl.clientHeight / 2
      );
      container.scrollTo({ top: targetTop, behavior });
    },
    []
  );

  useEffect(() => {
    if (
      activeTab !== "lyrics" ||
      !lyricsAutoScroll ||
      userScrolledAway ||
      activeSyncedIndex < 0
    ) {
      return;
    }
    scrollActiveLyricIntoView(activeSyncedIndex, "smooth");
  }, [
    activeSyncedIndex,
    activeTab,
    lyricsAutoScroll,
    scrollActiveLyricIntoView,
    userScrolledAway,
  ]);

  const handleManualLyricsScroll = useCallback(() => {
    if (!lyricsAutoScroll) return;
    setUserScrolledAway(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setUserScrolledAway(false);
    }, 5000);
  }, [lyricsAutoScroll]);

  const loadRelated = useCallback(async (seed: TrackDTO, force = false) => {
    if (!force && relatedCache[seed.identifier]) return;
    setRelatedLoading(true);
    try {
      const params = new URLSearchParams({
        id: seed.identifier,
        title: seed.title,
        author: seed.author,
        source: seed.sourceName,
      });
      if (seed.uri) params.set("uri", seed.uri);
      const res = await fetch(`/api/related?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { tracks?: TrackDTO[] };
        setRelatedCache((prev) => ({
          ...prev,
          [seed.identifier]: data.tracks ?? [],
        }));
      }
    } catch {
      // Ignore transient lookup errors
    } finally {
      setRelatedLoading(false);
    }
  }, [relatedCache]);

  const activeRelatedTrack = relatedSubjectTrack ?? current;

  useEffect(() => {
    if (activeTab === "related" && activeRelatedTrack && !relatedCache[activeRelatedTrack.identifier]) {
      void loadRelated(activeRelatedTrack);
    }
  }, [activeTab, activeRelatedTrack, loadRelated, relatedCache]);

  const tracksToSave: TrackDTO[] = useMemo(() => {
    const items: TrackDTO[] = [];
    if (current && !current.isStream) items.push(current);
    for (const track of queue) {
      if (!track.isStream) items.push(track);
    }
    return items;
  }, [current, queue]);

  const relatedTracks = activeRelatedTrack ? relatedCache[activeRelatedTrack.identifier] ?? [] : [];
  const duration = current?.duration || 0;
  const canSeekCurrent = Boolean(current && !current.isStream && duration > 0);
  const clampedMobilePos =
    mobileScrub !== null
      ? mobileScrub
      : duration > 0
        ? Math.min(duration, Math.max(0, displayPosition))
        : 0;
  const commitMobileSeek = () => {
    if (mobileScrub === null) return;
    const target = Math.round(mobileScrub);
    setMobileScrub(null);
    onSeek(target);
  };
  const cycleRepeat = () => {
    const mode = playerState?.repeatMode ?? "off";
    const next: RepeatModeType = mode === "off" ? "queue" : mode === "queue" ? "track" : "off";
    onRepeat(next);
  };

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-7xl flex-col gap-5 pb-4 lg:grid lg:h-full lg:grid-cols-12 lg:gap-10 lg:pb-0">
      {ambienceMode && current && (
        <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden opacity-25 blur-3xl">
          <TrackArtwork track={current} className="h-full w-full scale-110" iconClassName="h-24 w-24" />
        </div>
      )}

      {/* Mobile Now Playing Header (< lg) */}
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 lg:hidden">
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Minimize Now Playing"
          className="rounded-full bg-white/[0.06] p-2 text-zinc-200 hover:bg-white/15"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400">Playing from</p>
          <p className="truncate text-xs font-semibold text-white">{resolvedQueueName}</p>
        </div>
        <button
          type="button"
          disabled={!playerState?.connected || !privileged}
          onClick={onStop}
          title="Disconnect"
          aria-label="Disconnect voice"
          className="rounded-full bg-white/[0.06] p-2 text-zinc-300 hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-35"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>

      {/* Left Clean Artwork Column (click to Play / Pause + configurable +/-Ns seek) */}
      <div className="relative z-10 flex min-h-0 shrink-0 flex-col items-center justify-center lg:col-span-7">
        <div className="flex w-full max-w-[340px] flex-col items-center sm:max-w-[400px] lg:max-w-[460px]">
          <div
            role={current ? "button" : undefined}
            tabIndex={current ? 0 : undefined}
            aria-label={
              current
                ? playerState?.paused
                  ? `Resume ${current.title}`
                  : `Pause ${current.title}`
                : undefined
            }
            title={
              current ? (playerState?.paused ? "Click to play" : "Click to pause") : undefined
            }
            onClick={() => {
              if (current) onTogglePause();
            }}
            onKeyDown={(e) => {
              if (!current) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onTogglePause();
              }
            }}
            onContextMenu={(e) => {
              if (!current) return;
              onTrackContextMenu(e, current, { isCurrent: true });
            }}
            className={`group relative aspect-square w-full overflow-hidden rounded-xl bg-[#181818] shadow-2xl ring-1 ring-white/10 ${
              current ? "cursor-pointer" : ""
            }`}
          >
            <TrackArtwork
              track={current}
              className="h-full w-full transition duration-200 group-hover:brightness-90"
              iconClassName="h-20 w-20"
            />
            {current && (
              <div
                className={`pointer-events-none absolute inset-0 flex items-center justify-center gap-4 transition-opacity duration-150 sm:gap-5 ${
                  playerState?.paused
                    ? "bg-black/35 opacity-100"
                    : "bg-black/25 opacity-0 group-hover:opacity-100"
                }`}
              >
                {showArtworkSeekButtons && canSeekCurrent && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeekBy(-stepSeconds * 1000);
                    }}
                    title={`Rewind ${stepSeconds} seconds`}
                    aria-label={`Rewind ${stepSeconds} seconds`}
                    className="pointer-events-auto relative flex h-12 w-12 flex-col items-center justify-center rounded-full bg-black/70 text-white shadow-xl backdrop-blur-xs transition hover:scale-105 hover:bg-black/90"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span className="mt-0.5 text-[10px] font-bold leading-none">
                      {stepSeconds}s
                    </span>
                  </button>
                )}

                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/70 text-white shadow-xl backdrop-blur-xs">
                  {playerState?.paused ? (
                    <Play className="ml-1 h-8 w-8 fill-current" />
                  ) : (
                    <Pause className="h-8 w-8 fill-current" />
                  )}
                </span>

                {showArtworkSeekButtons && canSeekCurrent && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeekBy(stepSeconds * 1000);
                    }}
                    title={`Forward ${stepSeconds} seconds`}
                    aria-label={`Forward ${stepSeconds} seconds`}
                    className="pointer-events-auto relative flex h-12 w-12 flex-col items-center justify-center rounded-full bg-black/70 text-white shadow-xl backdrop-blur-xs transition hover:scale-105 hover:bg-black/90"
                  >
                    <RotateCw className="h-4 w-4" />
                    <span className="mt-0.5 text-[10px] font-bold leading-none">
                      {stepSeconds}s
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Mobile Full Controls (< lg) */}
          <div className="mt-4 w-full space-y-3 lg:hidden">
            {current ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 text-left">
                    <h2 className="truncate text-lg font-bold text-white">{current.title}</h2>
                    <p className="mt-0.5 truncate text-xs text-zinc-400">
                      <ArtistLinks author={current.author} onOpenArtist={onOpenArtist} />
                      <span> • {sourceLabel(current.sourceName)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={current.isStream}
                      onClick={() => onToggleLike(current)}
                      title={
                        likedTrackIds.has(current.identifier)
                          ? "Remove from Liked Music"
                          : "Save to Liked Music"
                      }
                      className={`rounded-full p-2 transition hover:bg-white/10 disabled:opacity-35 ${
                        likedTrackIds.has(current.identifier) ? "text-white" : "text-zinc-400"
                      }`}
                    >
                      <ThumbsUp
                        className={`h-4 w-4 ${
                          likedTrackIds.has(current.identifier) ? "fill-current" : ""
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenSaveModal([current])}
                      title="Save to playlist"
                      className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <ListPlus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Mobile seek slider */}
                <div className="space-y-1">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, duration)}
                    value={clampedMobilePos}
                    disabled={!canSeekCurrent}
                    onChange={(e) => setMobileScrub(Number(e.target.value))}
                    onPointerUp={commitMobileSeek}
                    onTouchEnd={commitMobileSeek}
                    onMouseUp={commitMobileSeek}
                    onBlur={commitMobileSeek}
                    onKeyUp={(e) => {
                      if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
                        commitMobileSeek();
                      }
                    }}
                    aria-label="Seek track position"
                    style={{ accentColor: "var(--cadence-accent)" }}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 disabled:opacity-40"
                  />
                  <div className="flex items-center justify-between text-[11px] tabular-nums text-zinc-400">
                    <span>{current.isStream ? "LIVE" : formatMs(clampedMobilePos)}</span>
                    <span>{current.isStream ? "LIVE" : formatMs(duration)}</span>
                  </div>
                </div>

                {/* Mobile transport buttons */}
                <div className="flex items-center justify-between px-2">
                  <button
                    type="button"
                    onClick={onShuffle}
                    disabled={queue.length < 2}
                    title="Shuffle queue"
                    className="rounded-full p-2 text-zinc-300 hover:bg-white/10 hover:text-white disabled:opacity-35"
                  >
                    <Shuffle className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onPrevious}
                    title="Previous"
                    className="rounded-full p-2.5 text-zinc-100 hover:bg-white/10"
                  >
                    <SkipBack className="h-5 w-5 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={onTogglePause}
                    title={playerState?.paused ? "Play" : "Pause"}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-lg transition active:scale-95"
                  >
                    {playerState?.paused ? (
                      <Play className="ml-0.5 h-6 w-6 fill-current" />
                    ) : (
                      <Pause className="h-6 w-6 fill-current" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onSkip}
                    title="Skip"
                    className="rounded-full p-2.5 text-zinc-100 hover:bg-white/10"
                  >
                    <SkipForward className="h-5 w-5 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={cycleRepeat}
                    title={`Repeat: ${playerState?.repeatMode ?? "off"}`}
                    className={`rounded-full p-2 hover:bg-white/10 ${
                      playerState?.repeatMode !== "off" ? "text-white" : "text-zinc-400"
                    }`}
                  >
                    {playerState?.repeatMode === "track" ? (
                      <Repeat1 className="h-4 w-4" />
                    ) : (
                      <Repeat className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Mobile volume slider */}
                <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
                  <button
                    type="button"
                    disabled={!privileged}
                    onClick={() => {
                      const next = mobileVolume === 0 ? 100 : 0;
                      setMobileVolume(next);
                      onVolume(next);
                    }}
                    className="text-zinc-300 disabled:opacity-40"
                    aria-label="Toggle mute"
                  >
                    {mobileVolume === 0 ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={mobileVolume}
                    disabled={!privileged}
                    onPointerDown={() => {
                      isDraggingMobileVolRef.current = true;
                    }}
                    onPointerUp={() => {
                      isDraggingMobileVolRef.current = false;
                      onVolume(mobileVolume);
                    }}
                    onTouchEnd={() => {
                      isDraggingMobileVolRef.current = false;
                      onVolume(mobileVolume);
                    }}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setMobileVolume(val);
                      onVolume(val);
                    }}
                    style={{ accentColor: "var(--cadence-accent)" }}
                    aria-label="Mobile volume slider"
                    className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/25 disabled:opacity-40"
                  />
                  <span className="w-9 text-right text-xs tabular-nums text-zinc-300">
                    {mobileVolume}%
                  </span>
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-zinc-400">
                Pick a track to start playing in Discord.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Queue / Lyrics / Related Column */}
      <div className="relative z-10 flex min-h-[380px] flex-1 flex-col lg:col-span-5 lg:min-h-0">
        <div className="flex shrink-0 items-center border-b border-white/10">
          {(
            [
              { id: "upnext", label: "Up next" },
              { id: "lyrics", label: "Lyrics" },
              { id: "related", label: "Related" },
            ] as const
          ).map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex-1 border-b-2 py-3 text-xs font-semibold uppercase tracking-wider transition ${
                  active
                    ? "border-white text-white"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* UP NEXT */}
        {activeTab === "upnext" && (
          <div className="flex min-h-0 flex-1 flex-col pt-3">
            {/* Playing from header + white + Save pill */}
            <div className="mb-2.5 flex shrink-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-zinc-400">Playing from</p>
                <p className="truncate text-sm font-semibold text-white">
                  {resolvedQueueName}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {queue.length > 0 && privileged && (
                  <>
                    <button
                      type="button"
                      disabled={queue.length < 2}
                      onClick={onShuffle}
                      title="Shuffle queue"
                      className="rounded-full bg-white/[0.08] p-2 text-zinc-200 transition hover:bg-white/15 hover:text-white disabled:opacity-40"
                    >
                      <Shuffle className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={onClear}
                      title="Clear upcoming queue"
                      className="rounded-full bg-white/[0.08] p-2 text-zinc-200 transition hover:bg-rose-500/20 hover:text-rose-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={tracksToSave.length === 0}
                  onClick={() => onOpenSaveModal(tracksToSave)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
                >
                  <ListPlus className="h-3.5 w-3.5" />
                  Save
                </button>
              </div>
            </div>

            {/* Scrollable Queue Timeline */}
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {!current && queue.length === 0 && previousEntries.length === 0 && (
                <div className="mb-3 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-400">
                  Nothing in the queue yet. Search or click a song to play.
                </div>
              )}

              {/* Previous tracks in queue timeline */}
              {previousEntries.map(({ track, prevIndex }, displayIdx) => {
                const liked = likedTrackIds.has(track.identifier);
                const isDragging =
                  dragSource?.section === "previous" && dragSource.prevIndex === prevIndex;
                const isOver =
                  dragTarget?.section === "previous" &&
                  dragTarget.prevIndex === prevIndex &&
                  !isDragging;
                return (
                  <div
                    key={`prev-${track.identifier}-${prevIndex}`}
                    draggable={privileged}
                    onDragStart={(e) => {
                      if (!privileged) return;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", `prev:${prevIndex}`);
                      setDragSource({ section: "previous", prevIndex, displayIdx });
                    }}
                    onDragOver={(e) => {
                      const targetItem: DragTimelineItem = {
                        section: "previous",
                        prevIndex,
                        displayIdx,
                      };
                      if (!privileged || !dragSource || !canDropTimeline(dragSource, targetItem)) {
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = e.clientY >= rect.top + rect.height / 2 ? "below" : "above";
                      if (
                        dragTarget?.section !== "previous" ||
                        dragTarget.prevIndex !== prevIndex ||
                        dragOverPosition !== pos
                      ) {
                        setDragTarget(targetItem);
                        setDragOverPosition(pos);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleTimelineDrop({ section: "previous", prevIndex, displayIdx });
                    }}
                    onDragEnd={resetDragState}
                    onClick={() => {
                      if (justDraggedRef.current) return;
                      onPlayPrevious(prevIndex);
                    }}
                    onContextMenu={(e) =>
                      onTrackContextMenu(e, track, { previousIndex: prevIndex })
                    }
                    className={`group relative flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 opacity-65 transition hover:bg-white/[0.06] hover:opacity-100 ${
                      isDragging ? "opacity-35" : ""
                    }`}
                  >
                    {isOver && dragOverPosition === "above" && (
                      <div
                        style={{ backgroundColor: "var(--cadence-accent)" }}
                        className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full"
                      />
                    )}
                    {isOver && dragOverPosition === "below" && (
                      <div
                        style={{ backgroundColor: "var(--cadence-accent)" }}
                        className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full"
                      />
                    )}
                    {privileged && (
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-600 transition group-hover:text-zinc-300 active:cursor-grabbing" />
                    )}
                    <TrackArtwork
                      track={track}
                      className="h-10 w-10 shrink-0 rounded"
                      iconClassName="h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-200">{track.title}</p>
                      <p className="truncate text-xs text-zinc-400">
                        <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
                        {track.sourceName && (
                          <span className="text-zinc-500"> · {sourceLabel(track.sourceName)}</span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-400 group-hover:hidden">
                      {track.isStream ? "LIVE" : formatMs(track.duration)}
                    </span>
                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      {!track.isStream && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLike(track);
                          }}
                          title={liked ? "Remove from Liked Music" : "Save to Liked Music"}
                          className={`rounded-full p-1 transition hover:bg-white/10 ${
                            liked ? "text-white" : "text-zinc-300 hover:text-white"
                          }`}
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                        </button>
                      )}
                      {privileged && (
                        <>
                          <button
                            type="button"
                            disabled={displayIdx === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMovePreviousTrack(prevIndex, prevIndex + 1);
                            }}
                            title="Move up"
                            className="rounded-full p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (prevIndex === 0) {
                                onMovePreviousToQueue(0, 0);
                              } else {
                                onMovePreviousTrack(prevIndex, prevIndex - 1);
                              }
                            }}
                            title="Move down"
                            className="rounded-full p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemovePreviousTrack(prevIndex);
                            }}
                            title="Remove from queue"
                            className="rounded-full p-1 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTrackContextMenu(e, track, { previousIndex: prevIndex });
                        }}
                        title="More options"
                        className="rounded-full p-1 text-zinc-300 hover:bg-white/10 hover:text-white"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Currently playing highlighted row (draggable & drop boundary between past & manual) */}
              {current && (() => {
                const liked = likedTrackIds.has(current.identifier);
                const isDraggingCurrent = dragSource?.section === "current";
                return (
                  <div
                    draggable={privileged}
                    onDragStart={(e) => {
                      if (!privileged) return;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", "current");
                      setDragSource({ section: "current" });
                    }}
                    onDragOver={(e) => {
                      if (!privileged || !dragSource || dragSource.section === "autoplay" || dragSource.section === "current") {
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = e.clientY >= rect.top + rect.height / 2 ? "below" : "above";
                      if (dragSource.section === "manual" && pos === "above") {
                        setDragTarget({
                          section: "previous",
                          prevIndex: 0,
                          displayIdx: Math.max(0, previousEntries.length - 1),
                        });
                        setDragOverPosition("below");
                      } else if (dragSource.section === "previous" && pos === "below") {
                        setDragTarget({ section: "manual", queueIndex: 0 });
                        setDragOverPosition("above");
                      } else {
                        setDragTarget(null);
                        setDragOverPosition(null);
                      }
                    }}
                    onDrop={(e) => {
                      if (!privileged || !dragSource || dragSource.section === "autoplay" || dragSource.section === "current") {
                        resetDragState();
                        return;
                      }
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = e.clientY >= rect.top + rect.height / 2 ? "below" : "above";
                      if (dragSource.section === "manual" && pos === "above") {
                        markJustDragged();
                        const from = dragSource.queueIndex;
                        resetDragState();
                        onMoveQueueToPrevious(from, 0);
                      } else if (dragSource.section === "previous" && pos === "below") {
                        markJustDragged();
                        const fromPrev = dragSource.prevIndex;
                        resetDragState();
                        onMovePreviousToQueue(fromPrev, 0);
                      } else {
                        resetDragState();
                      }
                    }}
                    onDragEnd={resetDragState}
                    onContextMenu={(e) => onTrackContextMenu(e, current, { isCurrent: true })}
                    className={`group flex items-center gap-3 rounded-lg bg-white/[0.10] px-2.5 py-2 ${
                      isDraggingCurrent ? "opacity-40" : ""
                    }`}
                  >
                    {privileged && (
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-500 transition group-hover:text-zinc-200 active:cursor-grabbing" />
                    )}
                    <button
                      type="button"
                      onClick={onTogglePause}
                      title={playerState?.paused ? "Play" : "Pause"}
                      className="group/thumb relative h-10 w-10 shrink-0 overflow-hidden rounded"
                    >
                      <TrackArtwork
                        track={current}
                        className="h-10 w-10"
                        iconClassName="h-4 w-4"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                        {playerState?.paused ? (
                          <Play className="ml-0.5 h-4 w-4 fill-current text-white" />
                        ) : (
                          <>
                            <Volume2 className="h-4 w-4 text-white group-hover/thumb:hidden" />
                            <Pause className="hidden h-4 w-4 fill-current text-white group-hover/thumb:block" />
                          </>
                        )}
                      </div>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{current.title}</p>
                      <p className="truncate text-xs text-zinc-300">
                        <ArtistLinks author={current.author} onOpenArtist={onOpenArtist} />
                        {current.sourceName && (
                          <span className="text-zinc-400"> · {sourceLabel(current.sourceName)}</span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-300 group-hover:hidden">
                      {current.isStream ? "LIVE" : formatMs(current.duration)}
                    </span>
                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      {!current.isStream && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLike(current);
                          }}
                          title={liked ? "Remove from Liked Music" : "Save to Liked Music"}
                          className={`rounded-full p-1 transition hover:bg-white/10 ${
                            liked ? "text-white" : "text-zinc-200 hover:text-white"
                          }`}
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                        </button>
                      )}
                      {privileged && (
                        <>
                          <button
                            type="button"
                            disabled={previousEntries.length === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveCurrentToPrevious(1);
                            }}
                            title="Move up in queue"
                            className="rounded-full p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={manualEntries.length === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveCurrentToQueue(1);
                            }}
                            title="Move down in queue"
                            className="rounded-full p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTrackContextMenu(e, current, { isCurrent: true });
                        }}
                        title="More options"
                        className="rounded-full p-1 text-zinc-200 hover:bg-white/10 hover:text-white"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* User-queued upcoming tracks */}
              {manualEntries.map(({ track, queueIndex }, manualPos) => {
                const liked = likedTrackIds.has(track.identifier);
                const isDragging =
                  dragSource?.section === "manual" && dragSource.queueIndex === queueIndex;
                const isOver =
                  dragTarget?.section === "manual" &&
                  dragTarget.queueIndex === queueIndex &&
                  !isDragging;
                return (
                  <div
                    key={`q-${track.identifier}-${queueIndex}`}
                    draggable={privileged}
                    onDragStart={(e) => {
                      if (!privileged) return;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", `manual:${queueIndex}`);
                      setDragSource({ section: "manual", queueIndex });
                    }}
                    onDragOver={(e) => {
                      const targetItem: DragTimelineItem = { section: "manual", queueIndex };
                      if (!privileged || !dragSource || !canDropTimeline(dragSource, targetItem)) {
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = e.clientY >= rect.top + rect.height / 2 ? "below" : "above";
                      if (
                        dragTarget?.section !== "manual" ||
                        dragTarget.queueIndex !== queueIndex ||
                        dragOverPosition !== pos
                      ) {
                        setDragTarget(targetItem);
                        setDragOverPosition(pos);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleTimelineDrop({ section: "manual", queueIndex });
                    }}
                    onDragEnd={resetDragState}
                    onClick={() => {
                      if (justDraggedRef.current) return;
                      onPlayTrack(queueIndex);
                    }}
                    onContextMenu={(e) => onTrackContextMenu(e, track, { queueIndex })}
                    className={`group relative flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-white/[0.06] ${
                      isDragging ? "opacity-40" : ""
                    }`}
                  >
                    {isOver && dragOverPosition === "above" && (
                      <div
                        style={{ backgroundColor: "var(--cadence-accent)" }}
                        className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full"
                      />
                    )}
                    {isOver && dragOverPosition === "below" && (
                      <div
                        style={{ backgroundColor: "var(--cadence-accent)" }}
                        className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full"
                      />
                    )}
                    {privileged && (
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-600 transition group-hover:text-zinc-300 active:cursor-grabbing" />
                    )}
                    <TrackArtwork
                      track={track}
                      className="h-10 w-10 shrink-0 rounded"
                      iconClassName="h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{track.title}</p>
                      <p className="truncate text-xs text-zinc-400">
                        <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
                        {track.sourceName && (
                          <span className="text-zinc-500"> · {sourceLabel(track.sourceName)}</span>
                        )}
                      </p>
                    </div>

                    <span className="shrink-0 text-xs tabular-nums text-zinc-400 group-hover:hidden">
                      {track.isStream ? "LIVE" : formatMs(track.duration)}
                    </span>

                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      {!track.isStream && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleLike(track);
                          }}
                          title={liked ? "Remove from Liked Music" : "Save to Liked Music"}
                          className={`rounded-full p-1 transition hover:bg-white/10 ${
                            liked ? "text-white" : "text-zinc-300 hover:text-white"
                          }`}
                        >
                          <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                        </button>
                      )}
                      {privileged && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (manualPos === 0) {
                                onMoveQueueToPrevious(queueIndex, 0);
                              } else {
                                const prevTarget = manualEntries[manualPos - 1];
                                if (prevTarget) onMoveTrack(queueIndex, prevTarget.queueIndex);
                              }
                            }}
                            title="Move up"
                            className="rounded-full p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={manualPos === manualEntries.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              const nextTarget = manualEntries[manualPos + 1];
                              if (nextTarget) onMoveTrack(queueIndex, nextTarget.queueIndex);
                            }}
                            title="Move down"
                            className="rounded-full p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveTrack(queueIndex);
                            }}
                            title="Remove from queue"
                            className="rounded-full p-1 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTrackContextMenu(e, track, { queueIndex });
                        }}
                        title="More options"
                        className="rounded-full p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* YouTube Music Autoplay Switch Section (also acts as bottom drop zone for manual queue) */}
              <div
                onDragOver={(e) => {
                  if (
                    !privileged ||
                    !dragSource ||
                    dragSource.section === "autoplay" ||
                    manualEntries.length === 0
                  ) {
                    return;
                  }
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const lastManual = manualEntries[manualEntries.length - 1];
                  if (
                    dragTarget?.section !== "manual" ||
                    dragTarget.queueIndex !== lastManual.queueIndex ||
                    dragOverPosition !== "below"
                  ) {
                    setDragTarget({ section: "manual", queueIndex: lastManual.queueIndex });
                    setDragOverPosition("below");
                  }
                }}
                onDrop={(e) => {
                  if (
                    !privileged ||
                    !dragSource ||
                    dragSource.section === "autoplay" ||
                    manualEntries.length === 0
                  ) {
                    resetDragState();
                    return;
                  }
                  e.preventDefault();
                  const lastManual = manualEntries[manualEntries.length - 1];
                  handleTimelineDrop({ section: "manual", queueIndex: lastManual.queueIndex });
                }}
                className="mt-4 border-t border-white/10 px-2.5 pb-2 pt-3.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Autoplay</p>
                    <p className="text-xs text-zinc-400">
                      Add similar content to the end of the queue
                    </p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoplayEnabled}
                    disabled={!playerState}
                    onClick={() => onToggleAutoplay(!autoplayEnabled)}
                    style={
                      autoplayEnabled ? { backgroundColor: "var(--cadence-accent)" } : undefined
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-40 ${
                      autoplayEnabled ? "" : "bg-zinc-600"
                    }`}
                    title={autoplayEnabled ? "Disable Autoplay" : "Enable Autoplay"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        autoplayEnabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                {autoplayEnabled && (
                  <div className="mt-3.5 space-y-2.5">
                    <p className="text-sm font-medium text-zinc-400">Autoplay is on</p>

                    <div className="flex items-center gap-2 overflow-x-auto pb-1.5">
                      {AUTOPLAY_MOODS.map((chip) => {
                        const selected = autoplayMood === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => onSetAutoplayMood(chip.id)}
                            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                              selected
                                ? "bg-white text-black"
                                : "bg-white/10 text-zinc-200 hover:bg-white/15"
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Autoplay Upcoming Track List */}
              {autoplayEnabled && (
                autoplayEntries.length > 0 ? (
                  autoplayEntries.map(({ track, queueIndex }) => {
                    const liked = likedTrackIds.has(track.identifier);
                    const isDragging =
                      dragSource?.section === "autoplay" && dragSource.queueIndex === queueIndex;
                    const isOver =
                      dragTarget?.section === "autoplay" &&
                      dragTarget.queueIndex === queueIndex &&
                      !isDragging;
                    return (
                      <div
                        key={`auto-${track.identifier}-${queueIndex}`}
                        draggable={privileged}
                        onDragStart={(e) => {
                          if (!privileged) return;
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", `autoplay:${queueIndex}`);
                          setDragSource({ section: "autoplay", queueIndex });
                        }}
                        onDragOver={(e) => {
                          const targetItem: DragTimelineItem = { section: "autoplay", queueIndex };
                          if (!privileged || !dragSource || !canDropTimeline(dragSource, targetItem)) {
                            return;
                          }
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = e.clientY >= rect.top + rect.height / 2 ? "below" : "above";
                          if (
                            dragTarget?.section !== "autoplay" ||
                            dragTarget.queueIndex !== queueIndex ||
                            dragOverPosition !== pos
                          ) {
                            setDragTarget(targetItem);
                            setDragOverPosition(pos);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleTimelineDrop({ section: "autoplay", queueIndex });
                        }}
                        onDragEnd={resetDragState}
                        onClick={() => {
                          if (justDraggedRef.current) return;
                          onPlayTrack(queueIndex);
                        }}
                        onContextMenu={(e) => onTrackContextMenu(e, track, { queueIndex })}
                        className={`group relative flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-white/[0.06] ${
                          isDragging ? "opacity-40" : ""
                        }`}
                      >
                        {isOver && dragOverPosition === "above" && (
                          <div
                            style={{ backgroundColor: "var(--cadence-accent)" }}
                            className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full"
                          />
                        )}
                        {isOver && dragOverPosition === "below" && (
                          <div
                            style={{ backgroundColor: "var(--cadence-accent)" }}
                            className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full"
                          />
                        )}
                        {privileged && (
                          <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-zinc-600 transition group-hover:text-zinc-300 active:cursor-grabbing" />
                        )}
                        <TrackArtwork
                          track={track}
                          className="h-10 w-10 shrink-0 rounded"
                          iconClassName="h-4 w-4"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{track.title}</p>
                          <p className="truncate text-xs text-zinc-400">
                            <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
                            {track.sourceName && (
                              <span className="text-zinc-500"> · {sourceLabel(track.sourceName)}</span>
                            )}
                          </p>
                        </div>

                        <span className="shrink-0 text-xs tabular-nums text-zinc-400 group-hover:hidden">
                          {track.isStream ? "LIVE" : formatMs(track.duration)}
                        </span>

                        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                          {!track.isStream && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleLike(track);
                              }}
                              title={liked ? "Remove from Liked Music" : "Save to Liked Music"}
                              className={`rounded-full p-1 transition hover:bg-white/10 ${
                                liked ? "text-white" : "text-zinc-300 hover:text-white"
                              }`}
                            >
                              <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveTrack(queueIndex);
                            }}
                            title="Remove suggestion"
                            className="rounded-full p-1 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTrackContextMenu(e, track, { queueIndex });
                            }}
                            title="More options"
                            className="rounded-full p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : current ? (
                  <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-300" />
                    <span>Finding similar tracks...</span>
                  </div>
                ) : null
              )}

              <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] px-2.5 py-3 text-[11px] text-zinc-500">
                <span>Cadence v{appVersion}</span>
                <span>Up Next Queue</span>
              </div>
            </div>
          </div>
        )}

        {/* LYRICS */}
        {activeTab === "lyrics" && (
          <div className="flex min-h-0 flex-1 flex-col pt-3">
            {!activeLyricsTrack ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                Play a track to load lyrics.
              </div>
            ) : lyricsState.loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                Searching lyrics for &ldquo;{activeLyricsTrack.title}&rdquo;...
              </div>
            ) : parsedSynced.length > 0 || lyricsState.lyrics?.plainLyrics ? (
              <>
                <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 pb-2.5 text-xs text-zinc-400">
                  <span className="min-w-0 truncate">
                    {activeLyricsTrack.title} • {lyricsState.lyrics?.source}
                    {canSeekLyrics && parsedSynced.length > 0 ? " • Click line to seek" : ""}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {parsedSynced.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdatePreferences({ lyricsAutoScroll: !lyricsAutoScroll })
                        }
                        aria-pressed={lyricsAutoScroll}
                        title={
                          lyricsAutoScroll
                            ? "Auto-scroll is on (click to pause)"
                            : "Auto-scroll is off (click to enable)"
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                          lyricsAutoScroll
                            ? "bg-white/15 text-white"
                            : "bg-white/[0.06] text-zinc-400 hover:bg-white/12 hover:text-zinc-200"
                        }`}
                      >
                        <span>Auto</span>
                        <span className={lyricsAutoScroll ? "text-emerald-400" : "text-zinc-500"}>
                          {lyricsAutoScroll ? "On" : "Off"}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onFetchLyrics(
                          activeLyricsTrack.title,
                          activeLyricsTrack.author,
                          activeLyricsTrack.duration
                        )
                      }
                      title="Refresh lyrics"
                      aria-label="Refresh lyrics"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="relative flex min-h-0 max-h-[60vh] flex-1 flex-col lg:max-h-none">
                  <div
                    ref={lyricsContainerRef}
                    onWheel={handleManualLyricsScroll}
                    onTouchMove={handleManualLyricsScroll}
                    className={`min-h-0 flex-1 overflow-y-auto pr-1 ${
                      parsedSynced.length > 0 && userScrolledAway && lyricsAutoScroll
                        ? "pb-14"
                        : "pb-8"
                    }`}
                  >
                    {parsedSynced.length > 0 ? (
                      <div className="space-y-1">
                        {parsedSynced.map((line, i) => {
                          const activeLine = i === activeSyncedIndex;
                          const renderLineContent = () => {
                            if (activeLine && line.words && line.words.length > 0) {
                              return (
                                <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                                  {line.words.map((w, wi) => {
                                    const spoken = w.timeMs <= displayPosition + 250;
                                    return (
                                      <span
                                        key={`${w.timeMs}-${wi}`}
                                        className={spoken ? "text-white" : "text-zinc-400"}
                                      >
                                        {w.text}
                                      </span>
                                    );
                                  })}
                                </span>
                              );
                            }
                            return <span>{line.text}</span>;
                          };

                          if (!canSeekLyrics) {
                            return (
                              <div
                                key={`${line.timeMs}-${i}`}
                                ref={(el) => {
                                  lyricLineRefs.current[i] = el;
                                }}
                                className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1 text-base leading-relaxed text-zinc-400"
                              >
                                {renderLineContent()}
                                <span className="shrink-0 text-[11px] tabular-nums text-zinc-600">
                                  {formatMs(line.timeMs)}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={`${line.timeMs}-${i}`}
                              ref={(el) => {
                                lyricLineRefs.current[i] = el;
                              }}
                              type="button"
                              onClick={() => {
                                if (resumeTimerRef.current) {
                                  clearTimeout(resumeTimerRef.current);
                                  resumeTimerRef.current = null;
                                }
                                setUserScrolledAway(false);
                                onSeek(line.timeMs);
                              }}
                              title={`Jump to ${formatMs(line.timeMs)}`}
                              className={`group/line flex w-full items-baseline justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-base leading-relaxed transition ${
                                activeLine
                                  ? "bg-white/[0.08] font-semibold text-white"
                                  : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
                              }`}
                            >
                              {renderLineContent()}
                              <span
                                className={`shrink-0 text-[11px] tabular-nums transition-opacity ${
                                  activeLine
                                    ? "text-zinc-300 opacity-100"
                                    : "text-zinc-400 opacity-0 group-hover/line:opacity-100"
                                }`}
                              >
                                {formatMs(line.timeMs)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-base leading-8 text-zinc-200">
                        {stripInlineTags(lyricsState.lyrics!.plainLyrics!)}
                      </pre>
                    )}

                    <div className="mt-6 border-t border-white/[0.06] pt-3 text-[11px] text-zinc-500">
                      Cadence v{appVersion}
                    </div>
                  </div>

                  {parsedSynced.length > 0 && userScrolledAway && lyricsAutoScroll && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (resumeTimerRef.current) {
                            clearTimeout(resumeTimerRef.current);
                            resumeTimerRef.current = null;
                          }
                          setUserScrolledAway(false);
                          if (activeSyncedIndex >= 0) {
                            scrollActiveLyricIntoView(activeSyncedIndex, "smooth");
                          }
                        }}
                        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-zinc-900/90 px-3.5 py-1.5 text-xs font-medium text-white shadow-lg backdrop-blur-md transition hover:bg-zinc-800"
                      >
                        Sync to current line
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                No lyrics found for &ldquo;{activeLyricsTrack.title}&rdquo;.
              </div>
            )}
          </div>
        )}

        {/* RELATED / SUGGESTIONS */}
        {activeTab === "related" && (
          <div className="flex min-h-0 flex-1 flex-col pt-3">
            {!activeRelatedTrack ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                Play or right-click a track to see related song suggestions.
              </div>
            ) : (
              <>
                <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-zinc-400">Related to</p>
                    <p className="truncate text-sm font-semibold text-white">
                      {activeRelatedTrack.title}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onStartMix(activeRelatedTrack)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200"
                    >
                      <Radio className="h-3.5 w-3.5" />
                      Start mix
                    </button>
                    <button
                      type="button"
                      disabled={relatedLoading}
                      onClick={() => void loadRelated(activeRelatedTrack, true)}
                      title="Refresh suggestions"
                      className="rounded-full bg-white/[0.06] p-1.5 text-zinc-300 transition hover:bg-white/12 hover:text-white disabled:opacity-40"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${relatedLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
                  {relatedLoading && relatedTracks.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      Finding related tracks...
                    </div>
                  ) : relatedTracks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                      No related suggestions available for this track yet.
                    </div>
                  ) : (
                    relatedTracks.map((track, idx) => {
                      const liked = likedTrackIds.has(track.identifier);
                      return (
                        <div
                          key={`rel-${track.identifier}-${idx}`}
                          onClick={() => onEnqueue([track], "now")}
                          onContextMenu={(e) => onTrackContextMenu(e, track)}
                          className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-white/[0.06]"
                        >
                          <TrackArtwork
                            track={track}
                            className="h-10 w-10 shrink-0 rounded"
                            iconClassName="h-4 w-4"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{track.title}</p>
                            <p className="truncate text-xs text-zinc-400">
                              <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
                            </p>
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-zinc-400 group-hover:hidden">
                            {track.isStream ? "LIVE" : formatMs(track.duration)}
                          </span>
                          <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                            {!track.isStream && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleLike(track);
                                }}
                                title={liked ? "Remove from Liked Music" : "Save to Liked Music"}
                                className={`rounded-full p-1 transition hover:bg-white/10 ${
                                  liked ? "text-white" : "text-zinc-300 hover:text-white"
                                }`}
                              >
                                <ThumbsUp className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEnqueue([track], "end");
                              }}
                              title="Add to queue"
                              className="rounded-full p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTrackContextMenu(e, track);
                              }}
                              title="More options"
                              className="rounded-full p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div className="mt-4 border-t border-white/[0.06] px-2.5 py-3 text-[11px] text-zinc-500">
                    Cadence v{appVersion}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
