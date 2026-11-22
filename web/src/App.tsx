import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { Bookmark, Compass, Home, Loader2, Settings } from "lucide-react";
import type {
  AppMetaDTO,
  EnqueueMode,
  GuildSummaryDTO,
  PlaylistDTO,
  SearchSource,
  TrackDTO,
  UserPreferencesDTO,
  UserProfileDTO,
} from "@shared/types";
import { loadUiPrefs } from "./utils/theme";
import { AppFooter } from "./components/AppFooter";
import { ArtistView } from "./components/ArtistView";
import { ContextMenu, type ContextMenuState, type TrackMenuContext } from "./components/ContextMenu";
import { ExploreView } from "./components/ExploreView";
import { HomeView } from "./components/HomeView";
import { KeyboardShortcutsModal } from "./components/KeyboardShortcutsModal";
import { LibraryView } from "./components/LibraryView";
import { LoginView } from "./components/LoginView";
import { NowPlayingView, type NowPlayingTab } from "./components/NowPlayingView";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PlayerBar } from "./components/PlayerBar";
import { PlaylistDetailView } from "./components/PlaylistDetailView";
import { SaveToPlaylistModal } from "./components/SaveToPlaylistModal";
import { SearchResultsView } from "./components/SearchResultsView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type MainView } from "./components/Sidebar";
import { ToastStack } from "./components/ToastStack";
import { TopBar } from "./components/TopBar";
import { useCadenceSocket } from "./hooks/useCadenceSocket";
import { sortPlaylists } from "./utils/playlists";

interface MeResponse {
  authenticated: boolean;
  user?: UserProfileDTO;
  meta: AppMetaDTO;
  guilds?: GuildSummaryDTO[];
  preferences?: UserPreferencesDTO;
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfileDTO | null>(null);
  const [meta, setMeta] = useState<AppMetaDTO | null>(null);
  const [guilds, setGuilds] = useState<GuildSummaryDTO[]>([]);
  const [initialPreferences, setInitialPreferences] = useState<UserPreferencesDTO | null>(null);

  const [activeView, setActiveView] = useState<MainView>("home");
  const prevViewRef = useRef<MainView>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [selectedArtist, setSelectedArtist] = useState("");
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [nowPlayingTab, setNowPlayingTab] = useState<NowPlayingTab>("upnext");
  const [lyricsSubjectTrack, setLyricsSubjectTrack] = useState<TrackDTO | null>(null);
  const [relatedSubjectTrack, setRelatedSubjectTrack] = useState<TrackDTO | null>(null);
  const [saveModalTracks, setSaveModalTracks] = useState<TrackDTO[] | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const gPrefixUntilRef = useRef<number>(0);
  const preMuteVolumeRef = useRef<number>(50);

  const authError = new URLSearchParams(window.location.search).get("error");

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = (await res.json()) as MeResponse;
        setUser(data.user ?? null);
        setMeta(data.meta);
        setGuilds(data.guilds ?? []);
        if (data.preferences) {
          setInitialPreferences(data.preferences);
        }
      } else {
        setUser(null);
        const metaRes = await fetch("/api/meta");
        if (metaRes.ok) {
          setMeta((await metaRes.json()) as AppMetaDTO);
        }
      }
    } catch {
      // Handled cleanly by showing onboarding/login status view
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const socket = useCadenceSocket(Boolean(user), initialPreferences);

  // Auto-select saved/mutual guild with the bot if server didn't preselect one
  useEffect(() => {
    if (!socket.connected || socket.selectedGuildId) return;
    const savedGuildId = loadUiPrefs().selectedGuildId;
    const preferred =
      (savedGuildId ? guilds.find((g) => g.id === savedGuildId && g.botPresent) : null) ??
      guilds.find((g) => g.botPresent);
    if (preferred) {
      socket.selectGuild(preferred.id);
    }
  }, [guilds, socket]);

  const navigateTo = useCallback((view: MainView) => {
    setNowPlayingOpen(false);
    if (view !== "artist") {
      prevViewRef.current = view;
    }
    setActiveView(view);
  }, []);

  const handleSearch = useCallback(
    (query: string, source: SearchSource = socket.preferences.defaultSearchSource) => {
      navigateTo("search");
      socket.search(query, source);
    },
    [navigateTo, socket]
  );

  const handleEnqueue = useCallback(
    (tracks: TrackDTO[], mode: EnqueueMode, queueName?: string) => {
      socket.enqueue(tracks, mode, queueName);
      if (mode === "now" || mode === "replace") {
        setLyricsSubjectTrack(null);
        setRelatedSubjectTrack(null);
        setNowPlayingTab("upnext");
        setNowPlayingOpen(true);
      }
    },
    [socket]
  );

  const handleStartMix = useCallback(
    (track: TrackDTO) => {
      socket.startMix(track);
      setLyricsSubjectTrack(null);
      setRelatedSubjectTrack(null);
      setNowPlayingTab("upnext");
      setNowPlayingOpen(true);
    },
    [socket]
  );

  const handlePlayPlaylist = useCallback(
    (playlistId: string, shuffle = false, startIndex?: number) => {
      socket.playPlaylist(playlistId, shuffle, startIndex);
      setLyricsSubjectTrack(null);
      setRelatedSubjectTrack(null);
      setNowPlayingTab("upnext");
      setNowPlayingOpen(true);
    },
    [socket]
  );

  const handleOpenArtist = useCallback(
    (artistName: string) => {
      const clean = artistName.trim();
      if (!clean) return;
      if (activeView !== "artist") {
        prevViewRef.current = activeView;
      }
      setSelectedArtist(clean);
      setNowPlayingOpen(false);
      setActiveView("artist");
    },
    [activeView]
  );

  const handleOpenSaveModal = useCallback((tracks: TrackDTO[]) => {
    if (tracks.length === 0) return;
    setSaveModalTracks(tracks);
  }, []);

  const handleViewLyrics = useCallback(
    (track: TrackDTO) => {
      const isCurrent = socket.playerState?.current?.identifier === track.identifier;
      setLyricsSubjectTrack(isCurrent ? null : track);
      setNowPlayingTab("lyrics");
      setNowPlayingOpen(true);
      socket.requestLyrics(track.title, track.author, track.duration);
    },
    [socket]
  );

  const handleFindRelated = useCallback(
    (track: TrackDTO) => {
      const isCurrent = socket.playerState?.current?.identifier === track.identifier;
      setRelatedSubjectTrack(isCurrent ? null : track);
      setNowPlayingTab("related");
      setNowPlayingOpen(true);
    },
    [socket.playerState?.current?.identifier]
  );

  const handleTrackContextMenu = useCallback(
    (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        kind: "track",
        x: e.clientX,
        y: e.clientY,
        track,
        ...ctx,
      });
    },
    []
  );

  const handlePlaylistContextMenu = useCallback((e: MouseEvent, playlist: PlaylistDTO) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      kind: "playlist",
      x: e.clientX,
      y: e.clientY,
      playlist,
    });
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    window.location.href = "/";
  };

  const sortedPlaylists = useMemo(
    () => sortPlaylists(socket.playlists, socket.playlistSort),
    [socket.playlists, socket.playlistSort]
  );

  const likedTrackIds = useMemo(() => {
    const liked = socket.playlists.find((p) => p.isLiked);
    return new Set((liked?.tracks ?? []).map((t) => t.identifier));
  }, [socket.playlists]);

  const pinnedTrackIds = useMemo(
    () => new Set(socket.pinnedTracks.map((p) => p.track.identifier)),
    [socket.pinnedTracks]
  );

  const effectiveMeta = socket.meta ?? meta;
  const stepSeconds = Math.max(
    5,
    Math.min(30, Math.round(socket.preferences.artworkSeekSeconds || 10))
  );
  const appVersion = effectiveMeta?.appVersion || __CADENCE_VERSION__;

  useEffect(() => {
    if (!user) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable);

      if (e.key === "Escape") {
        gPrefixUntilRef.current = 0;
        if (shortcutsOpen) {
          e.preventDefault();
          setShortcutsOpen(false);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (saveModalTracks) {
          setSaveModalTracks(null);
          return;
        }
        if (isInput) {
          target?.blur();
          return;
        }
        if (nowPlayingOpen) {
          e.preventDefault();
          setNowPlayingOpen(false);
        }
        return;
      }

      if (isInput || e.metaKey || e.altKey) return;
      if (
        e.key === "Shift" ||
        e.key === "Control" ||
        e.key === "Alt" ||
        e.key === "Meta"
      ) {
        return;
      }

      const isCtrlShiftArrow =
        e.ctrlKey &&
        e.shiftKey &&
        (e.key === "ArrowRight" || e.key === "ArrowLeft");
      if (e.ctrlKey && !isCtrlShiftArrow) return;

      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        gPrefixUntilRef.current = 0;
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      if (shortcutsOpen) return;

      if (Date.now() < gPrefixUntilRef.current) {
        gPrefixUntilRef.current = 0;
        const chordKey = e.key.toLowerCase();
        if (chordKey === "h") {
          e.preventDefault();
          navigateTo("home");
          return;
        }
        if (chordKey === "e") {
          e.preventDefault();
          navigateTo("explore");
          return;
        }
        if (chordKey === "l") {
          e.preventDefault();
          navigateTo("library");
          return;
        }
        if (chordKey === ",") {
          e.preventDefault();
          navigateTo("settings");
          return;
        }
      }

      if (!e.shiftKey && !e.ctrlKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        gPrefixUntilRef.current = Date.now() + 1200;
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("cadence:focus-search"));
        return;
      }

      if ((e.code === "Space" || e.key === " ") && !e.ctrlKey && !e.shiftKey) {
        if (
          target?.closest(
            "button, a, [role='button'], [role='switch'], [role='slider']"
          )
        ) {
          return;
        }
        e.preventDefault();
        socket.togglePause();
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key === ";") {
        e.preventDefault();
        socket.togglePause();
        return;
      }

      if (
        (e.ctrlKey && e.shiftKey && e.key === "ArrowRight") ||
        (!e.ctrlKey && e.shiftKey && e.code === "KeyL")
      ) {
        e.preventDefault();
        socket.seekBy(1000);
        return;
      }
      if (
        (e.ctrlKey && e.shiftKey && e.key === "ArrowLeft") ||
        (!e.ctrlKey && e.shiftKey && e.code === "KeyH")
      ) {
        e.preventDefault();
        socket.seekBy(-1000);
        return;
      }

      if (
        (!e.ctrlKey && e.shiftKey && e.key === "ArrowRight") ||
        (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "l")
      ) {
        e.preventDefault();
        socket.seekBy(stepSeconds * 1000);
        return;
      }
      if (
        (!e.ctrlKey && e.shiftKey && e.key === "ArrowLeft") ||
        (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "h")
      ) {
        e.preventDefault();
        socket.seekBy(-stepSeconds * 1000);
        return;
      }

      if (
        (!e.ctrlKey && e.shiftKey && e.code === "KeyN") ||
        (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "j")
      ) {
        e.preventDefault();
        socket.skip();
        return;
      }
      if (
        (!e.ctrlKey && e.shiftKey && e.code === "KeyP") ||
        (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "k")
      ) {
        e.preventDefault();
        socket.previous();
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        socket.shuffle();
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        const mode = socket.playerState?.repeatMode ?? "off";
        const nextMode =
          mode === "off" ? "queue" : mode === "queue" ? "track" : "off";
        socket.setRepeat(nextMode);
        return;
      }

      if (!e.ctrlKey && e.key === "+") {
        e.preventDefault();
        const curr = socket.playerState?.current;
        if (curr && !curr.isStream) {
          socket.toggleLike(curr);
        }
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key === "=") {
        e.preventDefault();
        const vol = socket.playerState?.volume ?? 100;
        socket.setVolume(Math.min(100, vol + 5));
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key === "-") {
        e.preventDefault();
        const vol = socket.playerState?.volume ?? 100;
        socket.setVolume(Math.max(0, vol - 5));
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        const vol = socket.playerState?.volume ?? 100;
        if (vol > 0) {
          preMuteVolumeRef.current = vol;
          socket.setVolume(0);
        } else {
          socket.setVolume(preMuteVolumeRef.current || 50);
        }
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        setNowPlayingOpen((v) => !v);
        return;
      }

      if (!e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (!document.fullscreenElement) {
          void document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          void document.exitFullscreen?.().catch(() => {});
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    contextMenu,
    navigateTo,
    nowPlayingOpen,
    saveModalTracks,
    shortcutsOpen,
    socket,
    stepSeconds,
    user,
  ]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030303] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  if (!user) {
    if (meta?.needsSetup) {
      return <OnboardingWizard onComplete={loadSession} />;
    }
    return <LoginView meta={meta} errorCode={authError} />;
  }

  const currentGuild = guilds.find((g) => g.id === socket.selectedGuildId) ?? null;
  const activePlaylist =
    socket.playlists.find((p) => p.id === selectedPlaylistId) ?? null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#030303] text-zinc-100">
      <ToastStack toasts={socket.toasts} onDismiss={socket.dismissToast} />

      <SaveToPlaylistModal
        tracks={saveModalTracks}
        playlists={sortedPlaylists}
        onClose={() => setSaveModalTracks(null)}
        onSaveToPlaylist={socket.addTracksToPlaylist}
        onCreatePlaylistWithTracks={socket.createPlaylistWithTracks}
      />

      <KeyboardShortcutsModal
        open={shortcutsOpen}
        stepSeconds={stepSeconds}
        onClose={() => setShortcutsOpen(false)}
      />

      <ContextMenu
        menu={contextMenu}
        privileged={Boolean(socket.playerState?.isPrivileged)}
        currentUserId={user.id}
        likedTrackIds={likedTrackIds}
        pinnedTrackIds={pinnedTrackIds}
        onClose={() => setContextMenu(null)}
        onStartMix={handleStartMix}
        onEnqueue={handleEnqueue}
        onToggleLike={socket.toggleLike}
        onTogglePinTrack={socket.togglePinTrack}
        onFindRelated={handleFindRelated}
        onSkip={socket.skip}
        onOpenSaveModal={handleOpenSaveModal}
        onOpenArtist={handleOpenArtist}
        onViewLyrics={handleViewLyrics}
        onMoveTrack={socket.moveTrack}
        onRemoveTrack={socket.removeTrack}
        onRemovePreviousTrack={socket.removePreviousTrack}
        onDismissQueue={socket.dismissQueue}
        onRemoveFromPlaylist={socket.removeTrackFromPlaylist}
        onPlayPlaylist={handlePlayPlaylist}
        onTogglePinPlaylist={socket.togglePinPlaylist}
        onSyncPlaylist={(id) => socket.syncPlaylist(id)}
        onDeletePlaylist={(id) => {
          socket.deletePlaylist(id);
          if (selectedPlaylistId === id && activeView === "playlist") {
            navigateTo("library");
          }
        }}
        onToast={socket.pushToast}
      />

      <div className="relative flex min-h-0 flex-1">
        <Sidebar
          activeView={activeView}
          nowPlayingOpen={nowPlayingOpen}
          selectedPlaylistId={selectedPlaylistId}
          playlists={sortedPlaylists}
          playlistSort={socket.playlistSort}
          onSelectView={navigateTo}
          onSelectPlaylist={(id) => {
            setSelectedPlaylistId(id);
            navigateTo("playlist");
          }}
          onCreatePlaylist={socket.createPlaylist}
          onImportPlaylist={socket.importPlaylist}
          onReorderPlaylists={socket.reorderPlaylists}
          onPlayPlaylist={(id) => handlePlayPlaylist(id, false)}
          onPlaylistContextMenu={handlePlaylistContextMenu}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="ytm-ambient flex min-w-0 flex-1 flex-col">
          <TopBar
            user={user}
            meta={effectiveMeta}
            guilds={guilds}
            selectedGuildId={socket.selectedGuildId}
            defaultSearchSource={socket.preferences.defaultSearchSource}
            searching={socket.searching}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onSearch={handleSearch}
            onPlayTrack={(track) => handleEnqueue([track], "now")}
            onOpenArtist={handleOpenArtist}
            onTrackContextMenu={handleTrackContextMenu}
            onSelectGuild={socket.selectGuild}
            onOpenSettings={() => navigateTo("settings")}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onLogout={() => void handleLogout()}
          />

          <main
            className={
              nowPlayingOpen
                ? "min-h-0 flex-1 overflow-y-auto px-4 py-4 lg:overflow-hidden lg:px-8 lg:py-6"
                : "min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8"
            }
          >
            {nowPlayingOpen ? (
              <NowPlayingView
                playerState={socket.playerState}
                displayPosition={socket.displayPosition}
                lyricsState={socket.lyricsState}
                lyricsSubjectTrack={lyricsSubjectTrack}
                relatedSubjectTrack={relatedSubjectTrack}
                activeTab={nowPlayingTab}
                ambienceMode={socket.preferences.ambienceMode}
                showArtworkSeekButtons={socket.preferences.artworkSeekButtons}
                artworkSeekSeconds={socket.preferences.artworkSeekSeconds}
                lyricsAutoScroll={socket.preferences.lyricsAutoScroll}
                likedTrackIds={likedTrackIds}
                onTabChange={(tab) => {
                  setLyricsSubjectTrack(null);
                  setRelatedSubjectTrack(null);
                  setNowPlayingTab(tab);
                }}
                onCloseMobile={() => setNowPlayingOpen(false)}
                onTogglePause={socket.togglePause}
                onSkip={socket.skip}
                onPrevious={socket.previous}
                onRepeat={socket.setRepeat}
                onVolume={socket.setVolume}
                onStop={socket.stop}
                onSeek={socket.seek}
                onSeekBy={socket.seekBy}
                onPlayTrack={socket.playTrack}
                onPlayPrevious={socket.playPrevious}
                onEnqueue={handleEnqueue}
                onStartMix={handleStartMix}
                onMoveTrack={socket.moveTrack}
                onMovePreviousTrack={socket.movePreviousTrack}
                onMovePreviousToQueue={socket.movePreviousToQueue}
                onMoveQueueToPrevious={socket.moveQueueToPrevious}
                onRemoveTrack={socket.removeTrack}
                onRemovePreviousTrack={socket.removePreviousTrack}
                onShuffle={socket.shuffle}
                onClear={socket.clearQueue}
                onToggleLike={socket.toggleLike}
                onToggleAutoplay={socket.toggleAutoplay}
                onSetAutoplayMood={socket.setAutoplayMood}
                onUpdatePreferences={socket.updatePreferences}
                onFetchLyrics={socket.requestLyrics}
                onOpenSaveModal={handleOpenSaveModal}
                onOpenArtist={handleOpenArtist}
                onTrackContextMenu={handleTrackContextMenu}
                appVersion={appVersion}
              />
            ) : (
              <div className="mx-auto flex min-h-full max-w-7xl flex-col">
                {activeView === "home" && (
                  <HomeView
                    user={user}
                    history={socket.history}
                    pinnedTracks={socket.pinnedTracks}
                    playlists={sortedPlaylists}
                    defaultSearchSource={socket.preferences.defaultSearchSource}
                    onMoodSearch={(q, src) =>
                      handleSearch(q, src ?? socket.preferences.defaultSearchSource)
                    }
                    onEnqueue={handleEnqueue}
                    onTogglePinTrack={socket.togglePinTrack}
                    onReorderPinnedTracks={socket.reorderPinnedTracks}
                    onSelectPlaylist={(id) => {
                      setSelectedPlaylistId(id);
                      navigateTo("playlist");
                    }}
                    onPlayPlaylist={(id) => handlePlayPlaylist(id, false)}
                    onClearHistory={socket.clearHistory}
                    onOpenArtist={handleOpenArtist}
                    onTrackContextMenu={handleTrackContextMenu}
                    onPlaylistContextMenu={handlePlaylistContextMenu}
                  />
                )}

                {activeView === "explore" && (
                  <ExploreView onSearch={(q, src) => handleSearch(q, src)} />
                )}

                {activeView === "library" && (
                  <LibraryView
                    playlists={sortedPlaylists}
                    playlistSort={socket.playlistSort}
                    history={socket.history}
                    onCreatePlaylist={socket.createPlaylist}
                    onImportPlaylist={socket.importPlaylist}
                    onSetPlaylistSort={socket.setPlaylistSort}
                    onReorderPlaylists={socket.reorderPlaylists}
                    onTogglePinPlaylist={socket.togglePinPlaylist}
                    onSelectPlaylist={(id) => {
                      setSelectedPlaylistId(id);
                      navigateTo("playlist");
                    }}
                    onPlayPlaylist={(id) => handlePlayPlaylist(id, false)}
                    onEnqueue={handleEnqueue}
                    onClearHistory={socket.clearHistory}
                    onOpenArtist={handleOpenArtist}
                    onTrackContextMenu={handleTrackContextMenu}
                    onPlaylistContextMenu={handlePlaylistContextMenu}
                  />
                )}

                {activeView === "playlist" && (
                  <PlaylistDetailView
                    playlist={activePlaylist}
                    onBack={() => navigateTo("library")}
                    onPlayPlaylist={handlePlayPlaylist}
                    onTogglePinPlaylist={socket.togglePinPlaylist}
                    onRenamePlaylist={socket.renamePlaylist}
                    onSyncPlaylist={socket.syncPlaylist}
                    onDeletePlaylist={socket.deletePlaylist}
                    onRemoveTrack={socket.removeTrackFromPlaylist}
                    onOpenArtist={handleOpenArtist}
                    onTrackContextMenu={handleTrackContextMenu}
                  />
                )}

                {activeView === "search" && (
                  <SearchResultsView
                    searching={socket.searching}
                    searchResults={socket.searchResults}
                    onEnqueue={handleEnqueue}
                    onImportPlaylist={socket.importPlaylist}
                    onOpenSaveModal={handleOpenSaveModal}
                    onOpenArtist={handleOpenArtist}
                    onTrackContextMenu={handleTrackContextMenu}
                  />
                )}

                {activeView === "artist" && (
                  <ArtistView
                    artistName={selectedArtist}
                    onBack={() => navigateTo(prevViewRef.current || "home")}
                    onEnqueue={handleEnqueue}
                    onStartMix={handleStartMix}
                    onOpenArtist={handleOpenArtist}
                    onOpenSaveModal={handleOpenSaveModal}
                    onTrackContextMenu={handleTrackContextMenu}
                  />
                )}

                {activeView === "settings" && (
                  <SettingsView
                    guildId={socket.selectedGuildId}
                    guildName={currentGuild?.name || "Server"}
                    canManage={Boolean(currentGuild?.canManage)}
                    settings={socket.settings}
                    preferences={socket.preferences}
                    onUpdatePreferences={socket.updatePreferences}
                    onLoadSettings={socket.requestSettings}
                    onSaveSettings={socket.updateSettings}
                  />
                )}

                <AppFooter
                  meta={effectiveMeta}
                  onNavigate={navigateTo}
                  onOpenShortcuts={() => setShortcutsOpen(true)}
                  onOpenPlayer={() => setNowPlayingOpen(true)}
                />
              </div>
            )}
          </main>
        </div>
      </div>

      <div className={nowPlayingOpen ? "hidden lg:block" : ""}>
        <PlayerBar
          playerState={socket.playerState}
          playbackAnchor={socket.playbackAnchor}
          displayPosition={socket.displayPosition}
          drawerOpen={nowPlayingOpen}
          isCurrentLiked={Boolean(
            socket.playerState?.current && likedTrackIds.has(socket.playerState.current.identifier)
          )}
          artworkSeekSeconds={socket.preferences.artworkSeekSeconds}
          onToggleDrawer={() => setNowPlayingOpen((v) => !v)}
          onTogglePause={socket.togglePause}
          onSkip={socket.skip}
          onPrevious={socket.previous}
          onSeek={socket.seek}
          onVolume={socket.setVolume}
          onRepeat={socket.setRepeat}
          onShuffle={socket.shuffle}
          onToggleAutoplay={socket.toggleAutoplay}
          onSetFilter={socket.setFilter}
          onStop={socket.stop}
          onToggleLike={socket.toggleLike}
          onOpenSaveModal={handleOpenSaveModal}
          onOpenArtist={handleOpenArtist}
          onTrackContextMenu={handleTrackContextMenu}
        />
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {!nowPlayingOpen && (
        <nav className="pb-safe flex shrink-0 items-center justify-around border-t border-white/10 bg-[#030303] px-2 py-1.5 lg:hidden">
          {(
            [
              { id: "home", label: "Home", icon: Home },
              { id: "explore", label: "Explore", icon: Compass },
              { id: "library", label: "Library", icon: Bookmark },
              { id: "settings", label: "Settings", icon: Settings },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium transition ${
                  active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
