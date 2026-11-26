import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export function clampVolume(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

interface UseVolumeControlOptions {
  serverVolume: number;
  disabled?: boolean;
  onCommit: (volume: number) => void;
}

export function useVolumeControl({
  serverVolume,
  disabled = false,
  onCommit,
}: UseVolumeControlOptions) {
  const safeServer = clampVolume(serverVolume);
  const [localVolume, setLocalVolume] = useState(safeServer);
  const [draft, setDraft] = useState(String(safeServer));
  const [isEditing, setIsEditing] = useState(false);

  const localVolumeRef = useRef(safeServer);
  const isDraggingRef = useRef(false);
  const lastNonZeroRef = useRef(safeServer > 0 ? safeServer : 100);
  const lastSentRef = useRef(safeServer);
  const pendingRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowCleanupRef = useRef<(() => void) | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const detachWindowListeners = useCallback(() => {
    if (windowCleanupRef.current) {
      windowCleanupRef.current();
      windowCleanupRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (safeServer > 0) {
      lastNonZeroRef.current = safeServer;
    }
    if (!isDraggingRef.current && !isEditing) {
      lastSentRef.current = safeServer;
      localVolumeRef.current = safeServer;
      setLocalVolume(safeServer);
      setDraft(String(safeServer));
    }
  }, [isEditing, safeServer]);

  useEffect(() => {
    return () => {
      clearDebounce();
      detachWindowListeners();
    };
  }, [clearDebounce, detachWindowListeners]);

  const flushCommit = useCallback(
    (vol: number) => {
      const clamped = clampVolume(vol);
      if (clamped > 0) {
        lastNonZeroRef.current = clamped;
      }
      pendingRef.current = null;
      clearDebounce();
      if (clamped === lastSentRef.current) return;
      lastSentRef.current = clamped;
      onCommitRef.current(clamped);
    },
    [clearDebounce]
  );

  const handleSliderCommit = useCallback(() => {
    const wasDragging = isDraggingRef.current;
    isDraggingRef.current = false;
    detachWindowListeners();
    clearDebounce();
    if (pendingRef.current !== null) {
      const target = pendingRef.current;
      pendingRef.current = null;
      if (target !== lastSentRef.current) {
        lastSentRef.current = target;
        onCommitRef.current(target);
      }
    } else if (wasDragging && localVolumeRef.current !== lastSentRef.current) {
      const target = localVolumeRef.current;
      lastSentRef.current = target;
      onCommitRef.current(target);
    }
  }, [clearDebounce, detachWindowListeners]);

  const handleSliderPointerDown = useCallback(() => {
    if (disabled) return;
    isDraggingRef.current = true;
    detachWindowListeners();
    const onGlobalRelease = () => {
      handleSliderCommit();
    };
    window.addEventListener("pointerup", onGlobalRelease, { once: true });
    window.addEventListener("pointercancel", onGlobalRelease, { once: true });
    window.addEventListener("touchend", onGlobalRelease, { once: true });
    windowCleanupRef.current = () => {
      window.removeEventListener("pointerup", onGlobalRelease);
      window.removeEventListener("pointercancel", onGlobalRelease);
      window.removeEventListener("touchend", onGlobalRelease);
    };
  }, [detachWindowListeners, disabled, handleSliderCommit]);

  const handleSliderChange = useCallback(
    (rawValue: number) => {
      if (disabled) return;
      const clamped = clampVolume(rawValue);
      localVolumeRef.current = clamped;
      setLocalVolume(clamped);
      setDraft(String(clamped));
      if (clamped > 0) {
        lastNonZeroRef.current = clamped;
      }
      pendingRef.current = clamped;
      clearDebounce();
      const delayMs = isDraggingRef.current ? 140 : 120;
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (pendingRef.current !== null) {
          flushCommit(pendingRef.current);
        }
      }, delayMs);
    },
    [clearDebounce, disabled, flushCommit]
  );

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setDraft(String(localVolumeRef.current));
  }, []);

  const updateDraft = useCallback((rawText: string) => {
    setDraft(rawText.replace(/[^0-9]/g, "").slice(0, 3));
  }, []);

  const commitDraft = useCallback(() => {
    setIsEditing(false);
    const parsed = Number.parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(localVolumeRef.current));
      return;
    }
    const clamped = clampVolume(parsed);
    localVolumeRef.current = clamped;
    setLocalVolume(clamped);
    setDraft(String(clamped));
    flushCommit(clamped);
  }, [draft, flushCommit]);

  const cancelEditing = useCallback(() => {
    setDraft(String(localVolumeRef.current));
    setIsEditing(false);
  }, []);

  const handleDraftKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        cancelEditing();
        e.currentTarget.blur();
      }
    },
    [cancelEditing]
  );

  const toggleMute = useCallback(() => {
    if (disabled) return;
    const next = localVolumeRef.current === 0 ? lastNonZeroRef.current || 100 : 0;
    localVolumeRef.current = next;
    setLocalVolume(next);
    setDraft(String(next));
    flushCommit(next);
  }, [disabled, flushCommit]);

  return {
    localVolume,
    draft: isEditing ? draft : String(localVolume),
    isEditing,
    handleSliderPointerDown,
    handleSliderChange,
    handleSliderCommit,
    startEditing,
    updateDraft,
    commitDraft,
    handleDraftKeyDown,
    toggleMute,
  };
}
