import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Loader2 } from "lucide-react";
import type {
  AppMetaDTO,
  EnqueueMode,
  GuildSummaryDTO,
  PlaylistDTO,
  SearchSource,
  TrackDTO,
  UserProfileDTO,
} from "@shared/types";
import { ContextMenu, type ContextMenuState, type TrackMenuContext } from "./components/ContextMenu";
import { ExploreView } from "./components/ExploreView";
import { HomeView } from "./components/HomeView";
import { LibraryView } from "./components/LibraryView";
import { LoginView } from "./components/LoginView";
import { NowPlayingView, type NowPlayingTab } from "./components/NowPlayingView";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PlayerBar } from "./components/PlayerBar";
import { PlaylistDetailView } from "./components/PlaylistDetailView";
import { SearchResultsView } from "./components/SearchResultsView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type MainView } from "./components/Sidebar";
import { ToastStack } from "./components/ToastStack";
import { TopBar } from "./components/TopBar";
import { useCadenceSocket } from "./hooks/useCadenceSocket";

interface MeResponse {
  authenticated: boolean;
  user?: UserProfileDTO;
  meta: AppMetaDTO;
  guilds?: GuildSummaryDTO[];
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfileDTO | null>(null);
  const [meta, setMeta] = useState<AppMetaDTO | null>(null);
  const [guilds, setGuilds] = useState<GuildSummaryDTO[]>([]);

  const [activeView, setActiveView] = useState<MainView>("home");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [nowPlayingTab, setNowPlayingTab] = useState<NowPlayingTab>("upnext");
  const [playSourceLabel, setPlaySourceLabel] = useState("Queue");
  const [lyricsSubjectTrack, setLyricsSubjectTrack] = useState<TrackDTO | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const authError = new URLSearchParams(window.location.search).get("error");

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = (await res.json()) as MeResponse;
        setUser(data.user ?? null);
        setMeta(data.meta);
        setGuilds(data.guilds ?? []);
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

  const socket = useCadenceSocket(Boolean(user));

  // Auto-select first mutual guild with the bot if server didn't preselect one
  useEffect(() => {
    if (!socket.connected || socket.selectedGuildId) return;
    const firstMutual = guilds.find((g) => g.botPresent);
    if (firstMutual) {
      socket.selectGuild(firstMutual.id);
    }
  }, [guilds, socket]);

  const handleSearch = useCallback(
    (query: string, source: SearchSource = "auto") => {
      setNowPlayingOpen(false);
      setActiveView("search");
      socket.search(query, source);
    },
    [socket]
  );

  const handleEnqueue = useCallback(
    (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => {
      socket.enqueue(tracks, mode);
      if (mode === "now") {
        setLyricsSubjectTrack(null);
        if (sourceLabel) {
          setPlaySourceLabel(sourceLabel);
        }
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
      setPlaySourceLabel(`Mix • ${track.title}`);
      setNowPlayingTab("upnext");
      setNowPlayingOpen(true);
    },
    [socket]
  );

  const handlePlayPlaylist = useCallback(
    (playlistId: string, shuffle = false) => {
      const playlist = socket.playlists.find((p) => p.id === playlistId);
      socket.playPlaylist(playlistId, shuffle);
      setLyricsSubjectTrack(null);
      setPlaySourceLabel(playlist?.name || "Playlist");
      setNowPlayingTab("upnext");
      setNowPlayingOpen(true);
    },
    [socket]
  );

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
    <div className="flex h-screen flex-col overflow-hidden bg-[#030303] text-zinc-100">
      <ToastStack toasts={socket.toasts} onDismiss={socket.dismissToast} />

      <ContextMenu
        menu={contextMenu}
        playlists={socket.playlists}
        privileged={Boolean(socket.playerState?.isPrivileged)}
        onClose={() => setContextMenu(null)}
        onStartMix={handleStartMix}
        onEnqueue={handleEnqueue}
        onAddToPlaylist={socket.addTrackToPlaylist}
        onCreatePlaylistWithTracks={socket.createPlaylistWithTracks}
        onViewLyrics={handleViewLyrics}
        onMoveTrack={socket.moveTrack}
        onRemoveTrack={socket.removeTrack}
        onRemoveFromPlaylist={socket.removeTrackFromPlaylist}
        onPlayPlaylist={handlePlayPlaylist}
        onDeletePlaylist={(id) => {
          socket.deletePlaylist(id);
          if (selectedPlaylistId === id && activeView === "playlist") {
            setActiveView("library");
          }
        }}
        onToast={socket.pushToast}
      />

      <div className="relative flex min-h-0 flex-1">
        <Sidebar
          activeView={activeView}
          nowPlayingOpen={nowPlayingOpen}
          selectedPlaylistId={selectedPlaylistId}
          playlists={socket.playlists}
          connected={socket.connected}
          onSelectView={(view) => {
            setNowPlayingOpen(false);
            setActiveView(view);
          }}
          onSelectPlaylist={(id) => {
            setNowPlayingOpen(false);
            setSelectedPlaylistId(id);
            setActiveView("playlist");
          }}
          onCreatePlaylist={socket.createPlaylist}
          onPlayPlaylist={(id) => handlePlayPlaylist(id, false)}
          onPlaylistContextMenu={handlePlaylistContextMenu}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="ytm-ambient flex min-w-0 flex-1 flex-col">
          <TopBar
            user={user}
            meta={meta}
            guilds={guilds}
            selectedGuildId={socket.selectedGuildId}
            playerConnected={Boolean(socket.playerState?.connected)}
            searching={socket.searching}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onSearch={handleSearch}
            onSelectGuild={socket.selectGuild}
            onOpenSettings={() => {
              setNowPlayingOpen(false);
              setActiveView("settings");
            }}
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
                playlists={socket.playlists}
                activeTab={nowPlayingTab}
                playSourceLabel={playSourceLabel}
                onTabChange={(tab) => {
                  setLyricsSubjectTrack(null);
                  setNowPlayingTab(tab);
                }}
                onPlayTrack={socket.playTrack}
                onEnqueue={handleEnqueue}
                onMoveTrack={socket.moveTrack}
                onRemoveTrack={socket.removeTrack}
                onShuffle={socket.shuffle}
                onClear={socket.clearQueue}
                onToggleAutoplay={socket.toggleAutoplay}
                onStop={socket.stop}
                onFetchLyrics={socket.requestLyrics}
                onSetFilter={socket.setFilter}
                onAddTracksToPlaylist={socket.addTracksToPlaylist}
                onCreatePlaylistWithTracks={socket.createPlaylistWithTracks}
                onTrackContextMenu={handleTrackContextMenu}
              />
            ) : (
              <div className="mx-auto max-w-7xl">
                {activeView === "home" && (
                  <HomeView
                    user={user}
                    history={socket.history}
                    playlists={socket.playlists}
                    onMoodSearch={(q, src) => handleSearch(q, src ?? "ytmsearch")}
                    onEnqueue={handleEnqueue}
                    onSelectPlaylist={(id) => {
                      setSelectedPlaylistId(id);
                      setActiveView("playlist");
                    }}
                    onPlayPlaylist={(id) => handlePlayPlaylist(id, false)}
                    onTrackContextMenu={handleTrackContextMenu}
                    onPlaylistContextMenu={handlePlaylistContextMenu}
                  />
                )}

                {activeView === "explore" && (
                  <ExploreView onSearch={(q, src) => handleSearch(q, src)} />
                )}

                {activeView === "library" && (
                  <LibraryView
                    playlists={socket.playlists}
                    history={socket.history}
                    guildId={socket.selectedGuildId}
                    guildName={currentGuild?.name || "Server"}
                    canManage={Boolean(currentGuild?.canManage)}
                    settings={socket.settings}
                    onCreatePlaylist={socket.createPlaylist}
                    onSelectPlaylist={(id) => {
                      setSelectedPlaylistId(id);
                      setActiveView("playlist");
                    }}
                    onPlayPlaylist={(id) => handlePlayPlaylist(id, false)}
                    onEnqueue={handleEnqueue}
                    onLoadSettings={socket.requestSettings}
                    onSaveSettings={socket.updateSettings}
                    onTrackContextMenu={handleTrackContextMenu}
                    onPlaylistContextMenu={handlePlaylistContextMenu}
                  />
                )}

                {activeView === "playlist" && (
                  <PlaylistDetailView
                    playlist={activePlaylist}
                    onBack={() => setActiveView("library")}
                    onPlayPlaylist={handlePlayPlaylist}
                    onRenamePlaylist={socket.renamePlaylist}
                    onDeletePlaylist={socket.deletePlaylist}
                    onRemoveTrack={socket.removeTrackFromPlaylist}
                    onEnqueueTrack={handleEnqueue}
                    onTrackContextMenu={handleTrackContextMenu}
                  />
                )}

                {activeView === "search" && (
                  <SearchResultsView
                    searching={socket.searching}
                    searchResults={socket.searchResults}
                    playlists={socket.playlists}
                    onEnqueue={handleEnqueue}
                    onAddToPlaylist={socket.addTrackToPlaylist}
                    onTrackContextMenu={handleTrackContextMenu}
                  />
                )}

                {activeView === "settings" && (
                  <SettingsView
                    guildId={socket.selectedGuildId}
                    guildName={currentGuild?.name || "Server"}
                    canManage={Boolean(currentGuild?.canManage)}
                    settings={socket.settings}
                    onLoadSettings={socket.requestSettings}
                    onSaveSettings={socket.updateSettings}
                  />
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      <PlayerBar
        playerState={socket.playerState}
        displayPosition={socket.displayPosition}
        playlists={socket.playlists}
        drawerOpen={nowPlayingOpen}
        onToggleDrawer={() => setNowPlayingOpen((v) => !v)}
        onTogglePause={socket.togglePause}
        onSkip={socket.skip}
        onPrevious={socket.previous}
        onSeek={socket.seek}
        onVolume={socket.setVolume}
        onRepeat={socket.setRepeat}
        onShuffle={socket.shuffle}
        onToggleAutoplay={socket.toggleAutoplay}
        onAddToPlaylist={socket.addTrackToPlaylist}
        onTrackContextMenu={handleTrackContextMenu}
      />
    </div>
  );
}
