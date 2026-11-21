import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AutoplayMood,
  EnqueueMode,
  FilterPreset,
  GuildSettingsDTO,
  HistoryEntryDTO,
  LyricsDTO,
  PlayerStateDTO,
  PlaylistDTO,
  RepeatModeType,
  SearchSource,
  ToastLevel,
  TrackDTO,
  WsClientMessage,
  WsServerMessage,
} from "@shared/types";

export interface ToastItem {
  id: number;
  level: ToastLevel;
  message: string;
}

export function useCadenceSocket(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const toastIdRef = useRef(1);
  const seekLockRef = useRef<{
    target: number;
    until: number;
    trackId: string | null;
  } | null>(null);

  const [connected, setConnected] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerStateDTO | null>(null);
  const [displayPosition, setDisplayPosition] = useState(0);
  const [searchResults, setSearchResults] = useState<{
    query: string;
    source: SearchSource;
    tracks: TrackDTO[];
    playlistName: string | null;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistDTO[]>([]);
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
          case "playerState": {
            const lock = seekLockRef.current;
            const incomingTrackId = msg.state.current?.identifier ?? null;
            let nextState = msg.state;
            if (lock) {
              if (Date.now() < lock.until && incomingTrackId === lock.trackId) {
                if (Math.abs(msg.state.position - lock.target) > 2500) {
                  nextState = {
                    ...msg.state,
                    position: lock.target,
                    updatedAt: Date.now(),
                  };
                } else {
                  seekLockRef.current = null;
                }
              } else {
                seekLockRef.current = null;
              }
            }
            setPlayerState(nextState);
            setSelectedGuildId(nextState.guildId);
            setDisplayPosition(nextState.position);
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
    if (!playerState?.playing || playerState.paused || !playerState.current || playerState.current.isStream) {
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - playerState.updatedAt;
      const max = playerState.current?.duration ?? 0;
      const estimated = Math.min(max, Math.max(0, playerState.position + elapsed));
      setDisplayPosition(estimated);
    }, 250);

    return () => clearInterval(interval);
  }, [playerState]);

  const selectGuild = useCallback(
    (guildId: string) => {
      setSelectedGuildId(guildId);
      setSettings(null);
      setLyricsState({ guildId, lyrics: null, loading: false });
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
    (tracks: TrackDTO[], mode: EnqueueMode = "end") => {
      if (!selectedGuildId) {
        pushToast("error", "Select a server first.");
        return;
      }
      send({ type: "enqueue", guildId: selectedGuildId, tracks, mode });
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

  return {
    connected,
    selectedGuildId,
    playerState,
    displayPosition,
    searchResults,
    searching,
    playlists,
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
    seek: (position: number) => {
      if (!selectedGuildId) return;
      seekLockRef.current = {
        target: position,
        until: Date.now() + 2000,
        trackId: playerState?.current?.identifier ?? null,
      };
      setDisplayPosition(position);
      setPlayerState((prev) =>
        prev ? { ...prev, position, updatedAt: Date.now() } : prev
      );
      send({ type: "seek", guildId: selectedGuildId, position });
    },
    setVolume: (volume: number) =>
      selectedGuildId && send({ type: "volume", guildId: selectedGuildId, volume }),
    setRepeat: (mode: RepeatModeType) =>
      selectedGuildId && send({ type: "repeat", guildId: selectedGuildId, mode }),
    shuffle: () => selectedGuildId && send({ type: "shuffle", guildId: selectedGuildId }),
    moveTrack: (from: number, to: number) =>
      selectedGuildId && send({ type: "moveTrack", guildId: selectedGuildId, from, to }),
    removeTrack: (index: number) =>
      selectedGuildId && send({ type: "removeTrack", guildId: selectedGuildId, index }),
    clearQueue: () => selectedGuildId && send({ type: "clearQueue", guildId: selectedGuildId }),
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
    addTrackToPlaylist: (playlistId: string, track: TrackDTO) =>
      send({ type: "addTrackToPlaylist", playlistId, track }),
    addTracksToPlaylist: (playlistId: string, tracks: TrackDTO[]) =>
      send({ type: "addTracksToPlaylist", playlistId, tracks }),
    removeTrackFromPlaylist: (playlistId: string, index: number) =>
      send({ type: "removeTrackFromPlaylist", playlistId, index }),
    playPlaylist: (playlistId: string, shuffle = false) =>
      selectedGuildId && send({ type: "playPlaylist", guildId: selectedGuildId, playlistId, shuffle }),
    refreshHistory: () => send({ type: "getHistory" }),
    clearHistory: () => send({ type: "clearHistory" }),
  };
}
