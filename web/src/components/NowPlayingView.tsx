import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Equal,
  GripVertical,
  ListPlus,
  Loader2,
  MessageSquareText,
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
  Sparkles,
  ThumbsUp,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { splitArtists } from "@shared/artists";
import type {
  AutoplayMood,
  EnqueueMode,
  LyricsDTO,
  PlayerStateDTO,
  RepeatModeType,
  TrackDTO,
  UserPreferencesDTO,
} from "@shared/types";
import { useVolumeControl } from "../hooks/useVolumeControl";
import { formatMs, sourceLabel } from "../utils/format";
import { parseSyncedLyrics, stripInlineTags } from "../utils/lrc";
import {
  MOBILE_SHEET_FULL_Y,
  computeMobileSheetBounds,
  computeMobileSheetMetrics,
  type MobileSheetMetrics,
} from "../utils/mobileSheet";
import type { MobileSheetState } from "../utils/navigation";
import { ArtistLinks } from "./ArtistLinks";
import type { TrackMenuContext } from "./ContextMenu";
import { SwipeableQueueRow } from "./SwipeableQueueRow";
import { TrackArtwork } from "./TrackArtwork";

export type { MobileSheetState };
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
  longPressMs?: number;
  mobileSheetState?: MobileSheetState;
  onMobileSheetStateChange?: (state: MobileSheetState) => void;
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
  longPressMs = 450,
  mobileSheetState: mobileSheetStateProp,
  onMobileSheetStateChange,
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
  const [internalSheetState, setInternalSheetState] = useState<MobileSheetState>("collapsed");
  const isControlledSheet = mobileSheetStateProp !== undefined;
  const mobileSheetState = isControlledSheet ? mobileSheetStateProp : internalSheetState;
  const setMobileSheetState = useCallback(
    (next: MobileSheetState) => {
      if (!isControlledSheet) {
        setInternalSheetState(next);
      }
      onMobileSheetStateChange?.(next);
    },
    [isControlledSheet, onMobileSheetStateChange]
  );
  const isSheetOpen = mobileSheetState !== "collapsed";
  const [mobileVolumeOpen, setMobileVolumeOpen] = useState(false);
  const [mobileScrub, setMobileScrub] = useState<number | null>(null);
  const [dragSource, setDragSource] = useState<DragTimelineItem | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTimelineItem | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"above" | "below" | null>(null);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const [rootHeight, setRootHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight || 780 : 780
  );
  const [canHtmlDrag, setCanHtmlDrag] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(hover: hover) and (pointer: fine)").matches
      : true
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetDraggedRef = useRef(false);
  const dragLiveRef = useRef<MobileSheetMetrics | null>(null);
  const sheetDragStartRef = useRef<{
    startY: number;
    lastY: number;
    lastTime: number;
    vy: number;
    baseOffset: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHtmlDrag(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  const listPullRef = useRef<{
    startX: number;
    startY: number;
    engaged: boolean;
  } | null>(null);
  const topBarDismissRef = useRef<{
    startY: number;
    lastY: number;
    lastTime: number;
    vy: number;
    mode: "pending" | "sheet" | "dismiss";
  } | null>(null);
  const justDraggedRef = useRef(false);
  const dragClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const privileged = Boolean(playerState?.isPrivileged);
  const mobileVol = useVolumeControl({
    serverVolume: playerState?.volume ?? 100,
    disabled: !privileged,
    onCommit: onVolume,
  });

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const queueScrollRef = useRef<HTMLDivElement>(null);
  const touchDragSourceRef = useRef<DragTimelineItem | null>(null);
  const touchDragTargetRef = useRef<DragTimelineItem | null>(null);
  const touchDragPosRef = useRef<"above" | "below" | null>(null);
  const lyricLineRefs = useRef<(HTMLElement | null)[]>([]);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = playerState?.current ?? null;
  const queue = playerState?.queue ?? [];
  const autoplayEnabled = Boolean(playerState?.autoplay);
  const autoplayMood = playerState?.autoplayMood ?? "all";
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
    touchDragSourceRef.current = null;
    touchDragTargetRef.current = null;
    touchDragPosRef.current = null;
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
    (
      target: DragTimelineItem,
      sourceOverride?: DragTimelineItem | null,
      posOverride?: "above" | "below" | null
    ) => {
      const source = sourceOverride ?? dragSource;
      const pos = posOverride ?? dragOverPosition ?? "above";
      if (!privileged || !source || !canDropTimeline(source, target)) {
        resetDragState();
        return;
      }
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

  const parseTimelineElement = useCallback((el: HTMLElement | null): DragTimelineItem | null => {
    const row = el?.closest<HTMLElement>("[data-timeline-row='true']");
    if (!row) return null;
    const section = row.dataset.timelineSection;
    if (section === "current") {
      return { section: "current" };
    }
    if (section === "previous") {
      const prevIndex = Number.parseInt(row.dataset.timelineIndex ?? "", 10);
      const displayIdx = Number.parseInt(row.dataset.timelineDisplayIdx ?? "", 10);
      if (Number.isFinite(prevIndex) && Number.isFinite(displayIdx)) {
        return { section: "previous", prevIndex, displayIdx };
      }
      return null;
    }
    if (section === "manual" || section === "autoplay") {
      const queueIndex = Number.parseInt(row.dataset.timelineIndex ?? "", 10);
      if (Number.isFinite(queueIndex)) {
        return { section, queueIndex };
      }
    }
    return null;
  }, []);

  const handleTouchDragStart = useCallback(
    (e: ReactPointerEvent<HTMLElement>, item: DragTimelineItem) => {
      if (!privileged || e.pointerType === "mouse") return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore pointer capture rejection
      }
      touchDragSourceRef.current = item;
      touchDragTargetRef.current = null;
      touchDragPosRef.current = null;
      setDragSource(item);
      setDragTarget(null);
      setDragOverPosition(null);
    },
    [privileged]
  );

  const handleTouchDragMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const source = touchDragSourceRef.current;
      if (!privileged || !source || e.pointerType === "mouse") return;
      e.preventDefault();

      const container = queueScrollRef.current;
      if (container) {
        const bounds = container.getBoundingClientRect();
        if (e.clientY < bounds.top + 48) {
          container.scrollTop -= 12;
        } else if (e.clientY > bounds.bottom - 48) {
          container.scrollTop += 12;
        }
      }

      const underPointer = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const row = underPointer?.closest<HTMLElement>("[data-timeline-row='true']") ?? null;
      const targetItem = parseTimelineElement(row);
      if (!row || !targetItem || !canDropTimeline(source, targetItem)) {
        touchDragTargetRef.current = null;
        touchDragPosRef.current = null;
        setDragTarget(null);
        setDragOverPosition(null);
        return;
      }

      const rect = row.getBoundingClientRect();
      const pos = e.clientY >= rect.top + rect.height / 2 ? "below" : "above";
      touchDragTargetRef.current = targetItem;
      touchDragPosRef.current = pos;
      setDragTarget(targetItem);
      setDragOverPosition(pos);
    },
    [canDropTimeline, parseTimelineElement, privileged]
  );

  const handleTouchDragEnd = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse") return;
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore release errors
      }
      const source = touchDragSourceRef.current;
      const target = touchDragTargetRef.current;
      const pos = touchDragPosRef.current;
      if (source && target && pos) {
        handleTimelineDrop(target, source, pos);
      } else {
        resetDragState();
      }
    },
    [handleTimelineDrop, resetDragState]
  );

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
  const mobileProgressPct =
    duration > 0 ? Math.min(100, Math.max(0, (clampedMobilePos / duration) * 100)) : 0;
  const mobileVolumePct = Math.min(100, Math.max(0, mobileVol.localVolume));
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
  const primaryArtist = current ? splitArtists(current.author)[0] || current.author : "";

  const openTrackMenuAt = useCallback(
    (x: number, y: number, track: TrackDTO, ctx?: TrackMenuContext) => {
      onTrackContextMenu(
        {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: x,
          clientY: y,
        } as unknown as MouseEvent,
        track,
        ctx
      );
    },
    [onTrackContextMenu]
  );

  const sheetBounds = useMemo(
    () => computeMobileSheetBounds(rootHeight, mobileVolumeOpen),
    [rootHeight, mobileVolumeOpen]
  );

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) {
        setRootHeight((prev) => (prev === h ? prev : h));
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const restSheetY =
    mobileSheetState === "full"
      ? sheetBounds.fullY
      : mobileSheetState === "half"
        ? sheetBounds.halfY
        : sheetBounds.collapsedY;

  const writeSheetCssVars = useCallback(
    (metrics: MobileSheetMetrics) => {
      const root = rootRef.current;
      if (!root) return;
      root.style.setProperty("--mobile-sheet-y", `${metrics.sheetY}px`);
      root.style.setProperty("--np-controls-bottom-y", `${metrics.controlsBottomY}px`);
      root.style.setProperty("--np-half-y", `${sheetBounds.halfY}px`);
      root.style.setProperty("--np-p-half", String(metrics.pHalf));
      root.style.setProperty("--np-p-full", String(metrics.pFull));
    },
    [sheetBounds.halfY]
  );

  const applyLiveSheetOffset = useCallback(
    (y: number) => {
      const metrics = computeMobileSheetMetrics(y, sheetBounds);
      dragLiveRef.current = metrics;
      writeSheetCssVars(metrics);
    },
    [sheetBounds, writeSheetCssVars]
  );

  const clearLiveSheetDrag = useCallback(
    (targetState: MobileSheetState) => {
      dragLiveRef.current = null;
      const targetY =
        targetState === "full"
          ? sheetBounds.fullY
          : targetState === "half"
            ? sheetBounds.halfY
            : sheetBounds.collapsedY;
      writeSheetCssVars(computeMobileSheetMetrics(targetY, sheetBounds));
      setIsDraggingSheet(false);
    },
    [sheetBounds, writeSheetCssVars]
  );

  const beginSheetDrag = useCallback(
    (clientY: number) => {
      const baseOffset =
        mobileSheetState === "full"
          ? sheetBounds.fullY
          : mobileSheetState === "half"
            ? sheetBounds.halfY
            : sheetBounds.collapsedY;
      sheetDragStartRef.current = {
        startY: clientY,
        lastY: clientY,
        lastTime: performance.now(),
        vy: 0,
        baseOffset,
      };
    },
    [mobileSheetState, sheetBounds]
  );

  const updateSheetDrag = useCallback(
    (clientY: number) => {
      const start = sheetDragStartRef.current;
      if (!start) return;
      const now = performance.now();
      const dt = Math.max(1, now - start.lastTime);
      start.vy = (clientY - start.lastY) / dt;
      start.lastY = clientY;
      start.lastTime = now;

      const dy = clientY - start.startY;
      if (Math.abs(dy) > 6 && !sheetDraggedRef.current) {
        sheetDraggedRef.current = true;
        setIsDraggingSheet(true);
      }
      if (sheetDraggedRef.current) {
        applyLiveSheetOffset(start.baseOffset + dy);
      }
    },
    [applyLiveSheetOffset]
  );

  const endSheetDrag = useCallback(
    (clientY: number | undefined) => {
      const start = sheetDragStartRef.current;
      sheetDragStartRef.current = null;
      if (!start || typeof clientY !== "number") {
        clearLiveSheetDrag(mobileSheetState);
        return;
      }

      const dy = clientY - start.startY;
      const vy = start.vy;
      const endOffset = Math.max(
        sheetBounds.fullY,
        Math.min(sheetBounds.collapsedY, start.baseOffset + dy)
      );
      const DIST_THRESHOLD = 28;
      const VEL_THRESHOLD = 0.32;
      const flickUp = vy < -VEL_THRESHOLD && dy < -12;
      const flickDown = vy > VEL_THRESHOLD && dy > 12;

      let nextState: MobileSheetState = mobileSheetState;
      if (mobileSheetState === "collapsed") {
        if (
          endOffset < (sheetBounds.fullY + sheetBounds.halfY) * 0.55 ||
          (vy < -0.85 && dy < -50)
        ) {
          nextState = "full";
        } else if (dy < -DIST_THRESHOLD || flickUp) {
          nextState = "half";
        }
      } else if (mobileSheetState === "half") {
        if (dy < -DIST_THRESHOLD || flickUp) {
          nextState = "full";
        } else if (dy > DIST_THRESHOLD || flickDown) {
          nextState = "collapsed";
        }
      } else {
        if (
          endOffset > (sheetBounds.halfY + sheetBounds.collapsedY) * 0.55 ||
          (vy > 0.85 && dy > 50)
        ) {
          nextState = "collapsed";
        } else if (dy > DIST_THRESHOLD || flickDown) {
          nextState = "half";
        }
      }

      clearLiveSheetDrag(nextState);
      if (nextState !== mobileSheetState) {
        setMobileSheetState(nextState);
      }
    },
    [clearLiveSheetDrag, mobileSheetState, setMobileSheetState, sheetBounds]
  );

  const handleSheetHandleTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const y = e.touches[0]?.clientY;
      if (typeof y !== "number") return;
      sheetDraggedRef.current = false;
      beginSheetDrag(y);
    },
    [beginSheetDrag]
  );

  const handleSheetHandleTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const curY = e.touches[0]?.clientY;
      if (typeof curY !== "number") return;
      updateSheetDrag(curY);
    },
    [updateSheetDrag]
  );

  const handleSheetHandleTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const endY = e.changedTouches[0]?.clientY;
      endSheetDrag(endY);
    },
    [endSheetDrag]
  );

  const handleListTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      if (!isSheetOpen || e.touches.length !== 1) return;
      const t = e.touches[0];
      listPullRef.current = { startX: t.clientX, startY: t.clientY, engaged: false };
    },
    [isSheetOpen]
  );

  const handleListTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const pull = listPullRef.current;
      if (!pull || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!pull.engaged) {
        const dx = t.clientX - pull.startX;
        const dy = t.clientY - pull.startY;
        if (e.currentTarget.scrollTop <= 0 && dy > 10 && Math.abs(dy) > Math.abs(dx) * 1.25) {
          pull.engaged = true;
          sheetDraggedRef.current = true;
          beginSheetDrag(t.clientY);
          setIsDraggingSheet(true);
        } else if (e.currentTarget.scrollTop > 0 || dy < -8 || Math.abs(dx) > 12) {
          listPullRef.current = null;
        }
        return;
      }
      updateSheetDrag(t.clientY);
    },
    [beginSheetDrag, updateSheetDrag]
  );

  const handleListTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const pull = listPullRef.current;
      listPullRef.current = null;
      if (pull?.engaged) {
        endSheetDrag(e.changedTouches[0]?.clientY);
      }
    },
    [endSheetDrag]
  );

  const restMetrics = useMemo(
    () => computeMobileSheetMetrics(restSheetY, sheetBounds),
    [restSheetY, sheetBounds]
  );
  const activeMetrics = isDraggingSheet && dragLiveRef.current ? dragLiveRef.current : restMetrics;
  const mobileRootStyle = {
    "--mobile-sheet-y": `${activeMetrics.sheetY}px`,
    "--np-controls-bottom-y": `${activeMetrics.controlsBottomY}px`,
    "--np-half-y": `${sheetBounds.halfY}px`,
    "--np-p-half": String(activeMetrics.pHalf),
    "--np-p-full": String(activeMetrics.pFull),
    "--mobile-sheet-pad-b":
      mobileSheetState === "full" ? `${MOBILE_SHEET_FULL_Y}px` : `${sheetBounds.halfY}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      style={mobileRootStyle}
      data-dragging={isDraggingSheet ? "true" : "false"}
      className="mobile-np-root relative mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col lg:grid lg:grid-cols-12 lg:gap-10"
    >
      {ambienceMode && current && !isSheetOpen && (
        <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden opacity-25 blur-3xl">
          <TrackArtwork track={current} className="h-full w-full scale-110" iconClassName="h-24 w-24" />
        </div>
      )}
      {ambienceMode && current && isSheetOpen && (
        <div className="pointer-events-none absolute inset-0 -z-0 hidden overflow-hidden opacity-25 blur-3xl lg:block">
          <TrackArtwork track={current} className="h-full w-full scale-110" iconClassName="h-24 w-24" />
        </div>
      )}

      {/* Fullscreen Compact Top Mini-Player Bar (mobileSheetState === "full") */}
      {current && (
        <div
          onTouchStart={handleSheetHandleTouchStart}
          onTouchMove={handleSheetHandleTouchMove}
          onTouchEnd={handleSheetHandleTouchEnd}
          onTouchCancel={handleSheetHandleTouchEnd}
          className={`mobile-np-mini-bar absolute inset-x-0 top-0 z-30 flex h-[68px] touch-none items-center gap-3 border-b border-white/10 bg-[#111111]/95 px-4 backdrop-blur-md lg:hidden ${
            mobileSheetState === "full" ? "pointer-events-auto" : "pointer-events-none"
          }`}
        >
          <button
            type="button"
            data-inline-btn="true"
            onClick={() => {
              if (sheetDraggedRef.current) {
                sheetDraggedRef.current = false;
                return;
              }
              setMobileSheetState("collapsed");
            }}
            aria-label="Return to full artwork player"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <TrackArtwork
              track={current}
              className="h-11 w-11 shrink-0 rounded-lg"
              iconClassName="h-5 w-5"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{current.title}</p>
              <p className="truncate text-xs text-zinc-400">
                {splitArtists(current.author).join(", ")}
              </p>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-inline-btn="true"
              onClick={onTogglePause}
              aria-label={playerState?.paused ? "Play" : "Pause"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            >
              {playerState?.paused ? (
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              ) : (
                <Pause className="h-5 w-5 fill-current" />
              )}
            </button>
            <button
              type="button"
              data-inline-btn="true"
              onClick={onSkip}
              aria-label="Skip"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition hover:bg-white/10"
            >
              <SkipForward className="h-5 w-5 fill-current" />
            </button>
          </div>
        </div>
      )}

      {/* Left Clean Artwork Column (Desktop) + Smooth 3-State Mobile Player (< lg) */}
      <div className="mobile-np-hero relative z-10 min-h-0 min-w-0 flex-1 overflow-hidden lg:col-span-7 lg:flex lg:flex-initial lg:flex-col lg:justify-center lg:overflow-visible">
        <div
          className={`mobile-np-hero-stage max-lg:absolute max-lg:inset-0 max-lg:z-10 max-lg:flex max-lg:flex-col lg:contents ${
            mobileSheetState === "full" && !isDraggingSheet
              ? "max-lg:pointer-events-none"
              : ""
          }`}
        >
          {/* Mobile Full-Bleed Top Hero Artwork Backdrop (fades in smoothly as pHalf -> 1) */}
          {current && (
            <div className="mobile-np-hero-art pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden lg:hidden">
              <TrackArtwork
                track={current}
                className="h-full w-full scale-105"
                iconClassName="h-16 w-16"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/45 to-[#111111]" />
            </div>
          )}

          {/* Mobile Top Bar (< lg) */}
          <div
            onTouchStart={(e) => {
              const y = e.touches[0]?.clientY;
              if (typeof y !== "number") return;
              if (isSheetOpen) {
                sheetDraggedRef.current = false;
                beginSheetDrag(y);
                topBarDismissRef.current = {
                  startY: y,
                  lastY: y,
                  lastTime: performance.now(),
                  vy: 0,
                  mode: "sheet",
                };
              } else {
                topBarDismissRef.current = {
                  startY: y,
                  lastY: y,
                  lastTime: performance.now(),
                  vy: 0,
                  mode: "dismiss",
                };
              }
            }}
            onTouchMove={(e) => {
              const st = topBarDismissRef.current;
              const y = e.touches[0]?.clientY;
              if (!st || typeof y !== "number") return;
              if (st.mode === "sheet") {
                updateSheetDrag(y);
                return;
              }
              const now = performance.now();
              st.vy = (y - st.lastY) / Math.max(1, now - st.lastTime);
              st.lastY = y;
              st.lastTime = now;
              if (rootRef.current) {
                const dy = Math.max(0, y - st.startY);
                rootRef.current.style.transition = "none";
                rootRef.current.style.setProperty("--np-dismiss-y", `${dy}px`);
              }
            }}
            onTouchEnd={(e) => {
              const st = topBarDismissRef.current;
              topBarDismissRef.current = null;
              if (st?.mode === "sheet") {
                endSheetDrag(e.changedTouches[0]?.clientY);
                return;
              }
              if (rootRef.current) {
                rootRef.current.style.removeProperty("transition");
                rootRef.current.style.removeProperty("--np-dismiss-y");
              }
              const endY = e.changedTouches[0]?.clientY;
              if (!st || typeof endY !== "number") return;
              const dy = endY - st.startY;
              if (dy > 36 || st.vy > 0.35) {
                onCloseMobile?.();
              }
            }}
            onTouchCancel={() => {
              const st = topBarDismissRef.current;
              topBarDismissRef.current = null;
              if (st?.mode === "sheet") {
                endSheetDrag(undefined);
                return;
              }
              if (rootRef.current) {
                rootRef.current.style.removeProperty("transition");
                rootRef.current.style.removeProperty("--np-dismiss-y");
              }
            }}
            className="mobile-np-top-bar relative z-20 flex shrink-0 touch-none items-center justify-between gap-2 px-4 pt-2 pb-1 lg:hidden"
          >
          <button
            type="button"
            onClick={() => {
              if (mobileSheetState === "full") {
                setMobileSheetState("half");
              } else if (mobileSheetState === "half") {
                setMobileSheetState("collapsed");
              } else {
                onCloseMobile?.();
              }
            }}
            aria-label={isSheetOpen ? "Collapse queue sheet" : "Minimize Now Playing"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 transition hover:bg-white/10"
          >
            <ChevronDown className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              disabled={!privileged}
              onClick={() => setMobileVolumeOpen((v) => !v)}
              aria-label="Toggle volume slider"
              style={mobileVolumeOpen ? { color: "var(--cadence-accent)" } : undefined}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 transition hover:bg-white/10 disabled:opacity-35"
            >
              {mobileVol.localVolume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              disabled={!current}
              onClick={(e) => current && onTrackContextMenu(e, current, { isCurrent: true })}
              aria-label="Track options"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 transition hover:bg-white/10 disabled:opacity-35"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          onTouchStart={(e) => {
            if (
              typeof window !== "undefined" &&
              window.matchMedia("(min-width: 1024px)").matches
            ) {
              return;
            }
            const y = e.touches[0]?.clientY;
            if (typeof y !== "number" || isSheetOpen) return;
            topBarDismissRef.current = {
              startY: y,
              lastY: y,
              lastTime: performance.now(),
              vy: 0,
              mode: "pending",
            };
          }}
          onTouchMove={(e) => {
            const st = topBarDismissRef.current;
            const y = e.touches[0]?.clientY;
            if (!st || typeof y !== "number") return;
            const now = performance.now();
            st.vy = (y - st.lastY) / Math.max(1, now - st.lastTime);
            st.lastY = y;
            st.lastTime = now;
            const dy = y - st.startY;
            if (st.mode === "pending") {
              if (dy < -10) {
                st.mode = "sheet";
                sheetDraggedRef.current = false;
                beginSheetDrag(st.startY);
                updateSheetDrag(y);
              } else if (dy > 10) {
                st.mode = "dismiss";
              }
              return;
            }
            if (st.mode === "sheet") {
              updateSheetDrag(y);
            } else if (rootRef.current) {
              rootRef.current.style.transition = "none";
              rootRef.current.style.setProperty("--np-dismiss-y", `${Math.max(0, dy)}px`);
            }
          }}
          onTouchEnd={(e) => {
            const st = topBarDismissRef.current;
            topBarDismissRef.current = null;
            if (!st) return;
            if (st.mode === "sheet") {
              endSheetDrag(e.changedTouches[0]?.clientY);
              return;
            }
            if (rootRef.current) {
              rootRef.current.style.removeProperty("transition");
              rootRef.current.style.removeProperty("--np-dismiss-y");
            }
            const endY = e.changedTouches[0]?.clientY;
            if (typeof endY === "number" && (endY - st.startY > 44 || st.vy > 0.38)) {
              onCloseMobile?.();
            }
          }}
          onTouchCancel={() => {
            const st = topBarDismissRef.current;
            topBarDismissRef.current = null;
            if (st?.mode === "sheet") {
              endSheetDrag(undefined);
              return;
            }
            if (rootRef.current) {
              rootRef.current.style.removeProperty("transition");
              rootRef.current.style.removeProperty("--np-dismiss-y");
            }
          }}
          className="mx-auto flex w-full flex-col items-center max-lg:min-h-0 max-lg:flex-1 max-lg:justify-center max-lg:touch-none max-lg:px-5 max-lg:pt-1 max-lg:pb-[268px] lg:max-w-[460px]"
        >
          {/* Centered Artwork (Desktop: click pauses + hover overlay; Mobile: clean responsive art) */}
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
              if (!current) return;
              if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1024px)").matches) {
                return;
              }
              onTogglePause();
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
            className={`mobile-np-artwork group relative aspect-square w-full max-w-[min(340px,36dvh)] overflow-hidden rounded-2xl bg-[#181818] shadow-2xl ring-1 ring-white/10 lg:max-w-[460px] ${
              current ? "lg:cursor-pointer" : ""
            } ${isSheetOpen ? "max-lg:pointer-events-none" : ""}`}
          >
            <TrackArtwork
              track={current}
              className="h-full w-full transition duration-200 lg:group-hover:brightness-90"
              iconClassName="h-20 w-20"
            />
            {current && (
              <div
                className={`pointer-events-none absolute inset-0 hidden items-center justify-center gap-4 transition-opacity duration-150 sm:gap-5 lg:flex ${
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
          </div>

          {/* Mobile Controls (< lg) anchored 4px above the sliding queue sheet between collapsed and half */}
          <div className="mobile-np-controls max-lg:absolute max-lg:inset-x-0 max-lg:top-0 max-lg:z-20 max-lg:px-5 max-lg:pb-2 lg:hidden">
            {current ? (
              <>
                {/* Title & Artist */}
                <div className="min-w-0 text-left">
                  <button
                    type="button"
                    data-inline-btn="true"
                    onClick={() => primaryArtist && onOpenArtist(primaryArtist)}
                    className="flex max-w-full items-center gap-1 text-left"
                  >
                    <h2 className="truncate text-[22px] font-bold leading-tight tracking-tight text-white">
                      {current.title}
                    </h2>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                  </button>
                  <p className="mt-0.5 truncate text-sm text-zinc-300">
                    <ArtistLinks author={current.author} onOpenArtist={onOpenArtist} />
                    <span className="text-zinc-400"> · {sourceLabel(current.sourceName)}</span>
                  </p>
                </div>

                {/* Horizontal Pill Actions Strip (smoothly collapses & fades out as pHalf -> 1) */}
                <div
                  className={`mobile-np-pills no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 py-0.5 ${
                    isSheetOpen ? "pointer-events-none" : ""
                  }`}
                >
                    <button
                      type="button"
                      disabled={current.isStream}
                      onClick={() => onToggleLike(current)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                        likedTrackIds.has(current.identifier)
                          ? "bg-white text-black"
                          : "bg-white/[0.08] text-zinc-100 hover:bg-white/15"
                      }`}
                    >
                      <ThumbsUp
                        className={`h-3.5 w-3.5 ${
                          likedTrackIds.has(current.identifier) ? "fill-current" : ""
                        }`}
                      />
                      <span>{likedTrackIds.has(current.identifier) ? "Liked" : "Like"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onTabChange("lyrics");
                        setMobileSheetState("half");
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                    >
                      <MessageSquareText className="h-3.5 w-3.5" />
                      <span>Lyrics</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenSaveModal([current])}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                    >
                      <ListPlus className="h-3.5 w-3.5" />
                      <span>Save</span>
                    </button>

                    <button
                      type="button"
                      disabled={!privileged}
                      onClick={() => setMobileVolumeOpen((v) => !v)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                        mobileVolumeOpen
                          ? "bg-white text-black"
                          : "bg-white/[0.08] text-zinc-100 hover:bg-white/15"
                      }`}
                    >
                      {mobileVol.localVolume === 0 ? (
                        <VolumeX className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                      <span>{mobileVol.localVolume}%</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onStartMix(current)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                    >
                      <Radio className="h-3.5 w-3.5" />
                      <span>Mix</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onTabChange("related");
                        setMobileSheetState("half");
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-zinc-100 transition hover:bg-white/15"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Related</span>
                    </button>

                    <button
                      type="button"
                      disabled={!privileged}
                      onClick={onStop}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-40"
                    >
                      <PhoneOff className="h-3.5 w-3.5" />
                      <span>Leave</span>
                    </button>
                  </div>

                <div className="mobile-np-transport-group mt-2.5 space-y-2.5">
                {/* Collapsible Inline Mobile Volume Control */}
                {mobileVolumeOpen && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-white/12 bg-black/45 px-3 py-2 backdrop-blur-sm">
                    <button
                      type="button"
                      disabled={!privileged}
                      onClick={mobileVol.toggleMute}
                      className="text-zinc-300 disabled:opacity-40"
                      aria-label="Toggle mute"
                    >
                      {mobileVol.localVolume === 0 ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={mobileVol.localVolume}
                      disabled={!privileged}
                      onPointerDown={mobileVol.handleSliderPointerDown}
                      onPointerUp={mobileVol.handleSliderCommit}
                      onPointerCancel={mobileVol.handleSliderCommit}
                      onBlur={mobileVol.handleSliderCommit}
                      onChange={(e) => mobileVol.handleSliderChange(Number(e.target.value))}
                      style={{
                        accentColor: "var(--cadence-accent)",
                        background: `linear-gradient(to right, var(--cadence-accent) ${mobileVolumePct}%, rgba(255,255,255,0.25) ${mobileVolumePct}%)`,
                      }}
                      aria-label="Mobile volume slider"
                      className="cadence-range h-1 flex-1 cursor-pointer rounded-full disabled:opacity-40"
                    />
                    <div className="flex items-center rounded-md border border-white/10 bg-white/[0.06] px-1.5 py-0.5 focus-within:border-white/35">
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label="Mobile volume percentage"
                        disabled={!privileged}
                        value={mobileVol.draft}
                        onFocus={(e) => {
                          mobileVol.startEditing();
                          e.currentTarget.select();
                        }}
                        onChange={(e) => mobileVol.updateDraft(e.target.value)}
                        onBlur={mobileVol.commitDraft}
                        onKeyDown={mobileVol.handleDraftKeyDown}
                        className="w-7 bg-transparent text-right text-xs tabular-nums text-zinc-200 outline-none disabled:opacity-40"
                      />
                      <span className="ml-0.5 text-[11px] text-zinc-400">%</span>
                    </div>
                  </div>
                )}

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
                    style={{
                      accentColor: "var(--cadence-accent)",
                      background: `linear-gradient(to right, var(--cadence-accent) ${mobileProgressPct}%, rgba(255,255,255,0.25) ${mobileProgressPct}%)`,
                    }}
                    className="cadence-range h-1 w-full cursor-pointer rounded-full disabled:opacity-40"
                  />
                  <div className="flex items-center justify-between text-[11px] tabular-nums text-zinc-300">
                    <span>{current.isStream ? "LIVE" : formatMs(clampedMobilePos)}</span>
                    <span>{current.isStream ? "LIVE" : formatMs(duration)}</span>
                  </div>
                </div>

                {/* Mobile transport buttons */}
                <div className="flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={onShuffle}
                    disabled={queue.length < 2}
                    title="Shuffle queue"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-zinc-200 hover:bg-white/10 disabled:opacity-35"
                  >
                    <Shuffle className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={onPrevious}
                    title="Previous"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
                  >
                    <SkipBack className="h-6 w-6 fill-current" />
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
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
                  >
                    <SkipForward className="h-6 w-6 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={cycleRepeat}
                    title={`Repeat: ${playerState?.repeatMode ?? "off"}`}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/10 ${
                      playerState?.repeatMode !== "off" ? "text-white" : "text-zinc-300"
                    }`}
                  >
                    {playerState?.repeatMode === "track" ? (
                      <Repeat1 className="h-5 w-5" />
                    ) : (
                      <Repeat className="h-5 w-5" />
                    )}
                  </button>
                </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 py-6 text-center">
                <p className="text-sm text-zinc-400">Pick a track to start playing in Discord.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Queue / Lyrics / Related Column (Desktop sidebar + 3-state Sliding Mobile Sheet: collapsed <-> half <-> full) */}
      <div
        className={`mobile-queue-sheet flex min-h-0 min-w-0 flex-col max-lg:absolute max-lg:inset-0 max-lg:z-20 max-lg:border-t max-lg:border-white/10 max-lg:bg-[#121212]/95 max-lg:px-4 max-lg:pt-1 max-lg:backdrop-blur-md max-lg:will-change-transform lg:static lg:z-10 lg:col-span-5 ${
          mobileSheetState === "full" && !isDraggingSheet
            ? "max-lg:rounded-none"
            : "max-lg:rounded-t-2xl"
        }`}
      >
        {/* Mobile Generous Header Drag Zone (Grab Handle + Tab Bar) */}
        <div
          onTouchStart={handleSheetHandleTouchStart}
          onTouchMove={handleSheetHandleTouchMove}
          onTouchEnd={handleSheetHandleTouchEnd}
          onTouchCancel={handleSheetHandleTouchEnd}
          className="shrink-0 max-lg:touch-none"
        >
          <button
            type="button"
            data-inline-btn="true"
            onClick={() => {
              if (sheetDraggedRef.current) {
                sheetDraggedRef.current = false;
                return;
              }
              if (mobileSheetState === "collapsed") {
                onTabChange("upnext");
                setMobileSheetState("half");
              } else if (mobileSheetState === "half") {
                setMobileSheetState("collapsed");
              } else {
                setMobileSheetState("half");
              }
            }}
            aria-label={isSheetOpen ? "Collapse queue sheet" : "Expand queue sheet"}
            className="mx-auto mb-0.5 flex w-full shrink-0 flex-col items-center justify-center gap-1.5 py-2.5 text-center lg:hidden"
          >
            <span className="h-1 w-12 rounded-full bg-white/35" />
            <span className="mobile-np-peek-label max-w-full truncate text-xs font-semibold text-zinc-200">
              {resolvedQueueName}
            </span>
          </button>

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
                  onClick={() => {
                    if (sheetDraggedRef.current) {
                      sheetDraggedRef.current = false;
                      return;
                    }
                    onTabChange(item.id);
                  }}
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
        </div>

        {/* UP NEXT */}
        {activeTab === "upnext" && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3">
            {/* Horizontal Mood Filter Pills on Mobile & Playing From Header */}
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
            <div
              ref={queueScrollRef}
              onTouchStart={handleListTouchStart}
              onTouchMove={handleListTouchMove}
              onTouchEnd={handleListTouchEnd}
              onTouchCancel={handleListTouchEnd}
              className="min-h-0 min-w-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-1"
            >
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
                  <SwipeableQueueRow
                    key={`prev-${track.identifier}-${prevIndex}`}
                    swipeEnabled={privileged}
                    longPressMs={longPressMs}
                    onSwipeRemove={() => onRemovePreviousTrack(prevIndex)}
                    onLongPress={(x, y) => openTrackMenuAt(x, y, track, { previousIndex: prevIndex })}
                    className="rounded-lg"
                  >
                  <div
                    data-timeline-row="true"
                    data-timeline-section="previous"
                    data-timeline-index={prevIndex}
                    data-timeline-display-idx={displayIdx}
                    draggable={privileged && canHtmlDrag}
                    onDragStart={(e) => {
                      if (!privileged || !canHtmlDrag) return;
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
                        className="pointer-events-none absolute inset-x-2 top-0 z-20 h-[3px] rounded-full"
                      />
                    )}
                    {isOver && dragOverPosition === "below" && (
                      <div
                        style={{ backgroundColor: "var(--cadence-accent)" }}
                        className="pointer-events-none absolute inset-x-2 bottom-0 z-20 h-[3px] rounded-full"
                      />
                    )}
                    {privileged && (
                      <button
                        type="button"
                        data-drag-handle="true"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) =>
                          handleTouchDragStart(e, { section: "previous", prevIndex, displayIdx })
                        }
                        onPointerMove={handleTouchDragMove}
                        onPointerUp={handleTouchDragEnd}
                        onPointerCancel={handleTouchDragEnd}
                        aria-label="Drag track to reorder"
                        className="hidden touch-none shrink-0 cursor-grab rounded p-1 text-zinc-500 transition hover:text-zinc-200 active:cursor-grabbing lg:inline-flex"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
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
                    {privileged && (
                      <button
                        type="button"
                        data-drag-handle="true"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) =>
                          handleTouchDragStart(e, { section: "previous", prevIndex, displayIdx })
                        }
                        onPointerMove={handleTouchDragMove}
                        onPointerUp={handleTouchDragEnd}
                        onPointerCancel={handleTouchDragEnd}
                        aria-label="Drag track to reorder"
                        className="inline-flex touch-none shrink-0 items-center justify-center rounded p-1.5 text-zinc-400 active:text-white lg:hidden"
                      >
                        <Equal className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  </SwipeableQueueRow>
                );
              })}

              {/* Currently playing highlighted row (draggable & drop boundary between past & manual) */}
              {current && (() => {
                const liked = likedTrackIds.has(current.identifier);
                const isDraggingCurrent = dragSource?.section === "current";
                return (
                  <SwipeableQueueRow
                    swipeEnabled={false}
                    longPressMs={longPressMs}
                    onLongPress={(x, y) => openTrackMenuAt(x, y, current, { isCurrent: true })}
                    className="rounded-lg"
                  >
                  <div
                    data-timeline-row="true"
                    data-timeline-section="current"
                    draggable={privileged && canHtmlDrag}
                    onDragStart={(e) => {
                      if (!privileged || !canHtmlDrag) return;
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
                      if (dragTarget?.section !== "current" || dragOverPosition !== pos) {
                        setDragTarget({ section: "current" });
                        setDragOverPosition(pos);
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
                      if (dragSource.section === "manual") {
                        markJustDragged();
                        const from = dragSource.queueIndex;
                        resetDragState();
                        if (pos === "above") {
                          onMoveQueueToPrevious(from, 0);
                        } else if (from !== 0) {
                          onMoveTrack(from, 0);
                        }
                      } else if (dragSource.section === "previous") {
                        markJustDragged();
                        const fromPrev = dragSource.prevIndex;
                        resetDragState();
                        if (pos === "above") {
                          if (fromPrev !== 0) {
                            onMovePreviousTrack(fromPrev, 0);
                          }
                        } else {
                          onMovePreviousToQueue(fromPrev, 0);
                        }
                      } else {
                        resetDragState();
                      }
                    }}
                    onDragEnd={resetDragState}
                    onContextMenu={(e) => onTrackContextMenu(e, current, { isCurrent: true })}
                    className={`group relative flex items-center gap-3 rounded-lg bg-white/[0.10] px-2.5 py-2 ${
                      isDraggingCurrent ? "opacity-40" : ""
                    }`}
                  >
                    {dragTarget?.section === "current" && dragOverPosition === "above" && (
                      <div
                        style={{ backgroundColor: "var(--cadence-accent)" }}
                        className="pointer-events-none absolute inset-x-2 top-0 z-20 h-[3px] rounded-full"
                      />
                    )}
                    {dragTarget?.section === "current" && dragOverPosition === "below" && (
                      <div
                        style={{ backgroundColor: "var(--cadence-accent)" }}
                        className="pointer-events-none absolute inset-x-2 bottom-0 z-20 h-[3px] rounded-full"
                      />
                    )}
                    {privileged && (
                      <button
                        type="button"
                        data-drag-handle="true"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => handleTouchDragStart(e, { section: "current" })}
                        onPointerMove={handleTouchDragMove}
                        onPointerUp={handleTouchDragEnd}
                        onPointerCancel={handleTouchDragEnd}
                        aria-label="Drag active track to reorder"
                        className="hidden touch-none shrink-0 cursor-grab rounded p-1 text-zinc-500 transition hover:text-zinc-200 active:cursor-grabbing lg:inline-flex"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
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
                    {privileged && (
                      <button
                        type="button"
                        data-drag-handle="true"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => handleTouchDragStart(e, { section: "current" })}
                        onPointerMove={handleTouchDragMove}
                        onPointerUp={handleTouchDragEnd}
                        onPointerCancel={handleTouchDragEnd}
                        aria-label="Drag active track to reorder"
                        className="inline-flex touch-none shrink-0 items-center justify-center rounded p-1.5 text-zinc-300 active:text-white lg:hidden"
                      >
                        <Equal className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  </SwipeableQueueRow>
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
                  <SwipeableQueueRow
                    key={`q-${track.identifier}-${queueIndex}`}
                    swipeEnabled={privileged}
                    longPressMs={longPressMs}
                    onSwipeRemove={() => onRemoveTrack(queueIndex)}
                    onLongPress={(x, y) => openTrackMenuAt(x, y, track, { queueIndex })}
                    className="rounded-lg"
                  >
                  <div
                    data-timeline-row="true"
                    data-timeline-section="manual"
                    data-timeline-index={queueIndex}
                    draggable={privileged && canHtmlDrag}
                    onDragStart={(e) => {
                      if (!privileged || !canHtmlDrag) return;
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
                        className="pointer-events-none absolute inset-x-2 top-0 z-20 h-[3px] rounded-full"
                      />
                    )}
                    {isOver && dragOverPosition === "below" && (
                      <div
                        style={{ backgroundColor: "var(--cadence-accent)" }}
                        className="pointer-events-none absolute inset-x-2 bottom-0 z-20 h-[3px] rounded-full"
                      />
                    )}
                    {privileged && (
                      <button
                        type="button"
                        data-drag-handle="true"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) =>
                          handleTouchDragStart(e, { section: "manual", queueIndex })
                        }
                        onPointerMove={handleTouchDragMove}
                        onPointerUp={handleTouchDragEnd}
                        onPointerCancel={handleTouchDragEnd}
                        aria-label="Drag queued track to reorder"
                        className="hidden touch-none shrink-0 cursor-grab rounded p-1 text-zinc-500 transition hover:text-zinc-200 active:cursor-grabbing lg:inline-flex"
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
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

                    <span className="hidden shrink-0 text-xs tabular-nums text-zinc-400 sm:block sm:group-hover:hidden">
                      {track.isStream ? "LIVE" : formatMs(track.duration)}
                    </span>

                    <div className="flex shrink-0 items-center gap-0.5 sm:hidden sm:group-hover:flex">
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
                    {privileged && (
                      <button
                        type="button"
                        data-drag-handle="true"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) =>
                          handleTouchDragStart(e, { section: "manual", queueIndex })
                        }
                        onPointerMove={handleTouchDragMove}
                        onPointerUp={handleTouchDragEnd}
                        onPointerCancel={handleTouchDragEnd}
                        aria-label="Drag queued track to reorder"
                        className="inline-flex touch-none shrink-0 items-center justify-center rounded p-1.5 text-zinc-400 active:text-white lg:hidden"
                      >
                        <Equal className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  </SwipeableQueueRow>
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
                className="relative mt-4 border-t border-white/10 px-2.5 pb-2 pt-3.5"
              >
                {manualEntries.length > 0 &&
                  dragTarget?.section === "manual" &&
                  dragTarget.queueIndex === manualEntries[manualEntries.length - 1]?.queueIndex &&
                  dragOverPosition === "below" &&
                  !(
                    dragSource?.section === "manual" &&
                    dragSource.queueIndex === manualEntries[manualEntries.length - 1]?.queueIndex
                  ) && (
                    <div
                      style={{ backgroundColor: "var(--cadence-accent)" }}
                      className="pointer-events-none absolute inset-x-2 -top-0.5 z-20 h-[3px] rounded-full"
                    />
                  )}
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

                    <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1.5">
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
                      <SwipeableQueueRow
                        key={`auto-${track.identifier}-${queueIndex}`}
                        swipeEnabled={privileged}
                        longPressMs={longPressMs}
                        onSwipeRemove={() => onRemoveTrack(queueIndex)}
                        onLongPress={(x, y) => openTrackMenuAt(x, y, track, { queueIndex })}
                        className="rounded-lg"
                      >
                      <div
                        data-timeline-row="true"
                        data-timeline-section="autoplay"
                        data-timeline-index={queueIndex}
                        draggable={privileged && canHtmlDrag}
                        onDragStart={(e) => {
                          if (!privileged || !canHtmlDrag) return;
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
                            className="pointer-events-none absolute inset-x-2 top-0 z-20 h-[3px] rounded-full"
                          />
                        )}
                        {isOver && dragOverPosition === "below" && (
                          <div
                            style={{ backgroundColor: "var(--cadence-accent)" }}
                            className="pointer-events-none absolute inset-x-2 bottom-0 z-20 h-[3px] rounded-full"
                          />
                        )}
                        {privileged && (
                          <button
                            type="button"
                            data-drag-handle="true"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) =>
                              handleTouchDragStart(e, { section: "autoplay", queueIndex })
                            }
                            onPointerMove={handleTouchDragMove}
                            onPointerUp={handleTouchDragEnd}
                            onPointerCancel={handleTouchDragEnd}
                            aria-label="Drag autoplay track to reorder"
                            className="hidden touch-none shrink-0 cursor-grab rounded p-1 text-zinc-500 transition hover:text-zinc-200 active:cursor-grabbing lg:inline-flex"
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
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
                        {privileged && (
                          <button
                            type="button"
                            data-drag-handle="true"
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) =>
                              handleTouchDragStart(e, { section: "autoplay", queueIndex })
                            }
                            onPointerMove={handleTouchDragMove}
                            onPointerUp={handleTouchDragEnd}
                            onPointerCancel={handleTouchDragEnd}
                            aria-label="Drag autoplay track to reorder"
                            className="inline-flex touch-none shrink-0 items-center justify-center rounded p-1.5 text-zinc-400 active:text-white lg:hidden"
                          >
                            <Equal className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      </SwipeableQueueRow>
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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3">
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

                <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                  <div
                    ref={lyricsContainerRef}
                    onWheel={handleManualLyricsScroll}
                    onTouchStart={handleListTouchStart}
                    onTouchMove={(e) => {
                      handleManualLyricsScroll();
                      handleListTouchMove(e);
                    }}
                    onTouchEnd={handleListTouchEnd}
                    onTouchCancel={handleListTouchEnd}
                    className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 ${
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
          <div className="flex min-h-0 min-w-0 flex-1 flex-col pt-3">
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

                <div
                  onTouchStart={handleListTouchStart}
                  onTouchMove={handleListTouchMove}
                  onTouchEnd={handleListTouchEnd}
                  onTouchCancel={handleListTouchEnd}
                  className="min-h-0 min-w-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-1"
                >
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
