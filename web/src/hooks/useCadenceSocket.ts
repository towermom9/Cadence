import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppMetaDTO,
  AutoplayMood,
  EnqueueMode,
  FilterPreset,
  GuildSettingsDTO,
  HistoryEntryDTO,
  LyricsDTO,
  PinnedTrackDTO,
  PlayerStateDTO,
  PlaylistDTO,
  PlaylistSortMode,
  RepeatModeType,
  SearchSource,
  ToastLevel,
  TrackDTO,
  UserPreferencesDTO,
  WsClientMessage,
  WsServerMessage,
} from "@shared/types";
import {
  applyThemePreferences,
  loadCachedPreferences,
  saveCachedPreferences,
  saveUiPrefs,
} from "../utils/theme";

export interface PlaybackAnchor {
  position: number;
  syncedAt: number;
  playing: boolean;
  paused: boolean;
  duration: number;
  trackId: string | null;
  isStream: boolean;
}

export interface ToastItem {
  id: number;
  level: ToastLevel;
  message: string;
}

export function useCadenceSocket(
  enabled: boolean,
  initialPreferences?: UserPreferencesDTO | null
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const toastIdRef = useRef(1);
  const anchorRef = useRef<PlaybackAnchor | null>(null);
  const seekLockRef = useRef<{
    target: number;
    startedAt: number;
    until: number;
    trackId: string | null;
  } | null>(null);
  const volumeLockRef = useRef<{
    value: number;
    until: number;
  } | null>(null);

  const [connected, setConnected] = useState(false);
  const [liveMeta, setLiveMeta] = useState<AppMetaDTO | null>(null);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerStateDTO | null>(null);
  const [playbackAnchor, setPlaybackAnchor] = useState<PlaybackAnchor | null>(null);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [searchResults, setSearchResults] = useState<{
    query: string;
    source: SearchSource;
    tracks: TrackDTO[];
    playlistName: string | null;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistDTO[]>([]);
  const [pinnedTracks, setPinnedTracks] = useState<PinnedTrackDTO[]>([]);
  const [preferences, setPreferences] = useState<UserPreferencesDTO>(() =>
    loadCachedPreferences()
  );

  useEffect(() => {
    if (!initialPreferences) return;
    setPreferences(initialPreferences);
    saveCachedPreferences(initialPreferences);
    applyThemePreferences(initialPreferences);
  }, [initialPreferences]);
  const playlistSort: PlaylistSortMode = preferences.playlistSort;
  const [history, setHistory] = useState<HistoryEntryDTO[]>([]);
  const [settings, setSettings] = useState<GuildSettingsDTO | null>(null);
  const [lyricsState, setLyricsState] = useState<{
    guildId: string;
    lyrics: LyricsDTO | null;
    loading: boolean;
  }>({ guildId: "", lyrics: null, loading: false });
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((level: ToastLevel, message: string) => {
    const id = toastIdRef.current++;
    setToasts((prev) => [...prev.slice(-3), { id, level, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const send = useCallback((msg: WsClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        retryCountRef.current = 0;
        setConnected(true);
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" } satisfies WsClientMessage));
          }
        }, 25_000);
      };

      ws.onmessage = (event) => {
        let msg: WsServerMessage;
        try {
          msg = JSON.parse(event.data) as WsServerMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case "ready":
            setSelectedGuildId(msg.selectedGuildId);
            break;
          case "meta":
            setLiveMeta(msg.meta);
            break;
          case "playerState": {
            const now = performance.now();
            const lock = seekLockRef.current;
            const incomingTrackId = msg.state.current?.identifier ?? null;
            const duration = msg.state.current?.duration ?? 0;
            const isStream = Boolean(msg.state.current?.isStream);
            const prevAnchor = anchorRef.current;

            let resolvedPos = msg.state.position;
            if (lock) {
              if (now < lock.until && incomingTrackId === lock.trackId) {
                const expected = msg.state.paused
                  ? lock.target
                  : lock.target + (now - lock.startedAt);
                if (Math.abs(msg.state.position - expected) > 2000) {
                  resolvedPos = Math.min(duration || expected, Math.max(0, expected));
                } else {
                  seekLockRef.current = null;
                }
              } else {
                seekLockRef.current = null;
              }
            } else if (
              prevAnchor &&
              prevAnchor.trackId === incomingTrackId &&
              prevAnchor.playing &&
              !prevAnchor.paused &&
              msg.state.playing &&
              !msg.state.paused &&
              !isStream &&
              duration > 0
            ) {
              const estimated = Math.min(
                duration,
                Math.max(0, prevAnchor.position + (now - prevAnchor.syncedAt))
              );
              if (Math.abs(msg.state.position - estimated) < 1200) {
                resolvedPos = estimated;
              }
            }

            const nextAnchor: PlaybackAnchor = {
              position: resolvedPos,
              syncedAt: now,
              playing: msg.state.playing,
              paused: msg.state.paused,
              duration,
              trackId: incomingTrackId,
              isStream,
            };

            let resolvedVolume = msg.state.volume;
            const volLock = volumeLockRef.current;
            if (volLock) {
              if (now < volLock.until && msg.state.volume !== volLock.value) {
                resolvedVolume = volLock.value;
              } else {
                volumeLockRef.current = null;
              }
            }

            anchorRef.current = nextAnchor;
            setPlaybackAnchor(nextAnchor);
            setPlayerState(
              resolvedVolume === msg.state.volume
                ? msg.state
                : { ...msg.state, volume: resolvedVolume }
            );
            setSelectedGuildId(msg.state.guildId);
            setDisplayPosition(Math.round(resolvedPos));
            break;
          }
          case "searchResults":
            setSearching(false);
            setSearchResults({
              query: msg.query,
              source: msg.source,
              tracks: msg.tracks,
              playlistName: msg.playlistName ?? null,
            });
            break;
          case "playlists":
            setPlaylists(msg.playlists);
            if (msg.playlistSort) {
              setPreferences((prev) => {
                if (prev.playlistSort === msg.playlistSort) return prev;
                const next = { ...prev, playlistSort: msg.playlistSort! };
                saveCachedPreferences(next);
                return next;
              });
            }
            break;
          case "pinnedTracks":
            setPinnedTracks(msg.tracks);
            break;
          case "preferences":
            setPreferences(msg.preferences);
            saveCachedPreferences(msg.preferences);
            applyThemePreferences(msg.preferences);
            break;
          case "history":
            setHistory(msg.entries);
            break;
          case "settings":
            setSettings(msg.settings);
            break;
          case "lyrics":
            setLyricsState({
              guildId: msg.guildId,
              lyrics: msg.lyrics,
              loading: false,
            });
            break;
          case "toast":
            setSearching(false);
            pushToast(msg.level, msg.message);
            break;
          case "pong":
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (!disposed) {
          const delay = Math.min(1500 * Math.pow(2, retryCountRef.current), 20_000);
          retryCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, pushToast]);

  // Smooth client-side playback progress interpolation between server updates
  useEffect(() => {
    if (!playbackAnchor?.playing || playbackAnchor.paused || playbackAnchor.isStream || playbackAnchor.duration <= 0) {
      return;
    }

    const interval = setInterval(() => {
      const a = anchorRef.current;
      if (!a || !a.playing || a.paused || a.isStream || a.duration <= 0) return;
      const estimated = Math.round(
        Math.min(a.duration, Math.max(0, a.position + (performance.now() - a.syncedAt)))
      );
      setDisplayPosition(estimated);
    }, 100);

    return () => clearInterval(interval);
  }, [playbackAnchor]);

  const selectGuild = useCallback(
    (guildId: string) => {
      setSelectedGuildId(guildId);
      setSettings(null);
      setLyricsState({ guildId, lyrics: null, loading: false });
      saveUiPrefs({ selectedGuildId: guildId });
      send({ type: "selectGuild", guildId });
    },
    [send]
  );

  const search = useCallback(
    (query: string, source: SearchSource) => {
      if (!query.trim()) return;
      setSearching(true);
      send({ type: "search", query, source });
    },
    [send]
  );

  const enqueue = useCallback(
    (tracks: TrackDTO[], mode: EnqueueMode = "end", queueName?: string) => {
      if (!selectedGuildId) {
        pushToast("error", "Select a server first.");
        return;
      }
      send({ type: "enqueue", guildId: selectedGuildId, tracks, mode, queueName });
    },
    [pushToast, selectedGuildId, send]
  );

  const startMix = useCallback(
    (track: TrackDTO) => {
      if (!selectedGuildId) {
        pushToast("error", "Select a server first.");
        return;
      }
      send({ type: "startMix", guildId: selectedGuildId, track });
    },
    [pushToast, selectedGuildId, send]
  );

  const requestLyrics = useCallback(
    (title?: string, artist?: string, duration?: number) => {
      if (!selectedGuildId) return;
      setLyricsState((prev) => ({ ...prev, guildId: selectedGuildId, loading: true }));
      send({ type: "getLyrics", guildId: selectedGuildId, title, artist, duration });
    },
    [selectedGuildId, send]
  );

  const requestSettings = useCallback(
    (guildId?: string) => {
      const target = guildId || selectedGuildId;
      if (!target) return;
      send({ type: "getSettings", guildId: target });
    },
    [selectedGuildId, send]
  );

  const updateSettings = useCallback(
    (patch: Partial<Omit<GuildSettingsDTO, "guildId" | "roles">>) => {
      if (!selectedGuildId) return;
      send({ type: "updateSettings", guildId: selectedGuildId, settings: patch });
    },
    [selectedGuildId, send]
  );

  const seekTo = useCallback(
    (position: number) => {
      if (!selectedGuildId) return;
      const now = performance.now();
      const duration = playerState?.current?.duration ?? position;
      const clamped = Math.round(Math.max(0, Math.min(position, duration || position)));
      seekLockRef.current = {
        target: clamped,
        startedAt: now,
        until: now + 3500,
        trackId: playerState?.current?.identifier ?? null,
      };
      const nextAnchor: PlaybackAnchor = {
        position: clamped,
        syncedAt: now,
        playing: Boolean(playerState?.playing),
        paused: Boolean(playerState?.paused),
        duration,
        trackId: playerState?.current?.identifier ?? null,
        isStream: Boolean(playerState?.current?.isStream),
      };
      anchorRef.current = nextAnchor;
      setPlaybackAnchor(nextAnchor);
      setDisplayPosition(clamped);
      setPlayerState((prev) => (prev ? { ...prev, position: clamped } : prev));
      send({ type: "seek", guildId: selectedGuildId, position: clamped });
    },
    [playerState, selectedGuildId, send]
  );

  const seekBy = useCallback(
    (deltaMs: number) => {
      const a = anchorRef.current;
      const dur = a?.duration || playerState?.current?.duration || 0;
      const basePos = a
        ? a.playing && !a.paused
          ? a.position + (performance.now() - a.syncedAt)
          : a.position
        : displayPosition;
      const rawTarget = basePos + deltaMs;
      const target = dur > 0 ? Math.min(dur, Math.max(0, rawTarget)) : Math.max(0, rawTarget);
      seekTo(Math.round(target));
    },
    [displayPosition, playerState?.current?.duration, seekTo]
  );

  const persistPrefsHttp = useCallback((patch: Partial<UserPreferencesDTO>) => {
    void fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  return {
    connected,
    meta: liveMeta,
    selectedGuildId,
    playerState,
    playbackAnchor,
    displayPosition,
    searchResults,
    searching,
    playlists,
    pinnedTracks,
    playlistSort,
    preferences,
    history,
    settings,
    lyricsState,
    toasts,
    pushToast,
    dismissToast,
    selectGuild,
    search,
    enqueue,
    startMix,
    playTrack: (index: number) =>
      selectedGuildId && send({ type: "playTrack", guildId: selectedGuildId, index }),
    playPrevious: (index: number) =>
      selectedGuildId && send({ type: "playPrevious", guildId: selectedGuildId, index }),
    togglePause: () => {
      if (!selectedGuildId || !playerState) return;
      send({ type: playerState.paused ? "resume" : "pause", guildId: selectedGuildId });
    },
    skip: () => selectedGuildId && send({ type: "skip", guildId: selectedGuildId }),
    previous: () => selectedGuildId && send({ type: "previous", guildId: selectedGuildId }),
    seek: seekTo,
    seekBy,
    setVolume: (volume: number) => {
      if (!selectedGuildId) return;
      const clamped = Math.max(0, Math.min(100, Math.round(volume)));
      volumeLockRef.current = { value: clamped, until: performance.now() + 1200 };
      send({ type: "volume", guildId: selectedGuildId, volume: clamped });
    },
    setRepeat: (mode: RepeatModeType) =>
      selectedGuildId && send({ type: "repeat", guildId: selectedGuildId, mode }),
    shuffle: () => selectedGuildId && send({ type: "shuffle", guildId: selectedGuildId }),
    moveTrack: (from: number, to: number) =>
      selectedGuildId && send({ type: "moveTrack", guildId: selectedGuildId, from, to }),
    movePreviousTrack: (from: number, to: number) =>
      selectedGuildId && send({ type: "movePreviousTrack", guildId: selectedGuildId, from, to }),
    movePreviousToQueue: (previousIndex: number, queueIndex: number) =>
      selectedGuildId &&
      send({ type: "movePreviousToQueue", guildId: selectedGuildId, previousIndex, queueIndex }),
    moveQueueToPrevious: (queueIndex: number, previousIndex: number) =>
      selectedGuildId &&
      send({ type: "moveQueueToPrevious", guildId: selectedGuildId, queueIndex, previousIndex }),
    moveCurrentToQueue: (queueIndex: number) =>
      selectedGuildId && send({ type: "moveCurrentToQueue", guildId: selectedGuildId, queueIndex }),
    moveCurrentToPrevious: (previousIndex: number) =>
      selectedGuildId &&
      send({ type: "moveCurrentToPrevious", guildId: selectedGuildId, previousIndex }),
    removeTrack: (index: number) =>
      selectedGuildId && send({ type: "removeTrack", guildId: selectedGuildId, index }),
    removePreviousTrack: (index: number) =>
      selectedGuildId && send({ type: "removePreviousTrack", guildId: selectedGuildId, index }),
    clearQueue: () => selectedGuildId && send({ type: "clearQueue", guildId: selectedGuildId }),
    dismissQueue: () => selectedGuildId && send({ type: "dismissQueue", guildId: selectedGuildId }),
    stop: () => selectedGuildId && send({ type: "stop", guildId: selectedGuildId }),
    toggleAutoplay: (enabledValue: boolean) =>
      selectedGuildId &&
      send({ type: "toggleAutoplay", guildId: selectedGuildId, enabled: enabledValue }),
    setAutoplayMood: (mood: AutoplayMood) =>
      selectedGuildId && send({ type: "setAutoplayMood", guildId: selectedGuildId, mood }),
    setFilter: (preset: FilterPreset) =>
      selectedGuildId && send({ type: "setFilter", guildId: selectedGuildId, preset }),
    requestLyrics,
    requestSettings,
    updateSettings,
    createPlaylist: (name: string) => send({ type: "createPlaylist", name }),
    createPlaylistWithTracks: (name: string, tracks: TrackDTO[]) =>
      send({ type: "createPlaylistWithTracks", name, tracks }),
    importPlaylist: (url: string, name?: string) =>
      send({ type: "importPlaylist", url, name }),
    syncPlaylist: (playlistId: string, url?: string) =>
      send({ type: "syncPlaylist", playlistId, url }),
    renamePlaylist: (playlistId: string, name: string) =>
      send({ type: "renamePlaylist", playlistId, name }),
    deletePlaylist: (playlistId: string) => send({ type: "deletePlaylist", playlistId }),
    togglePinPlaylist: (playlistId: string) =>
      send({ type: "togglePinPlaylist", playlistId }),
    addTrackToPlaylist: (playlistId: string, track: TrackDTO) =>
      send({ type: "addTrackToPlaylist", playlistId, track }),
    addTracksToPlaylist: (playlistId: string, tracks: TrackDTO[]) =>
      send({ type: "addTracksToPlaylist", playlistId, tracks }),
    removeTrackFromPlaylist: (playlistId: string, index: number) =>
      send({ type: "removeTrackFromPlaylist", playlistId, index }),
    reorderPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) =>
      send({ type: "reorderPlaylistTracks", playlistId, fromIndex, toIndex }),
    toggleLike: (track: TrackDTO) => send({ type: "toggleLike", track }),
    togglePinTrack: (track: TrackDTO) => send({ type: "togglePinTrack", track }),
    reorderPinnedTracks: (trackIds: string[]) => send({ type: "reorderPinnedTracks", trackIds }),
    setPlaylistSort: (sort: PlaylistSortMode) => {
      setPreferences((prev) => {
        const next = { ...prev, playlistSort: sort };
        saveCachedPreferences(next);
        return next;
      });
      persistPrefsHttp({ playlistSort: sort });
      send({ type: "setPlaylistSort", sort });
    },
    reorderPlaylists: (playlistIds: string[]) => {
      setPreferences((prev) => {
        const next = { ...prev, playlistSort: "manual" as const };
        saveCachedPreferences(next);
        return next;
      });
      persistPrefsHttp({ playlistSort: "manual" });
      send({ type: "reorderPlaylists", playlistIds });
    },
    updatePreferences: (patch: Partial<UserPreferencesDTO>) => {
      setPreferences((prev) => {
        const next = { ...prev, ...patch };
        saveCachedPreferences(next);
        applyThemePreferences(next);
        return next;
      });
      persistPrefsHttp(patch);
      send({ type: "updatePreferences", preferences: patch });
    },
    playPlaylist: (playlistId: string, shuffle = false, startIndex?: number) =>
      selectedGuildId &&
      send({ type: "playPlaylist", guildId: selectedGuildId, playlistId, shuffle, startIndex }),
    refreshHistory: () => send({ type: "getHistory" }),
    clearHistory: () => send({ type: "clearHistory" }),
    removeHistoryEntry: (opts: { historyId?: number; trackIdentifier?: string }) =>
      send({
        type: "removeHistoryEntry",
        historyId: opts.historyId,
        trackIdentifier: opts.trackIdentifier,
      }),
  };
}
