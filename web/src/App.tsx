import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  AppMetaDTO,
  GuildSummaryDTO,
  SearchSource,
  UserProfileDTO,
} from "@shared/types";
import { ExploreView } from "./components/ExploreView";
import { HomeView } from "./components/HomeView";
import { LibraryView } from "./components/LibraryView";
import { LoginView } from "./components/LoginView";
import { NowPlayingDrawer } from "./components/NowPlayingDrawer";
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
  const [drawerOpen, setDrawerOpen] = useState(false);
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
      setDrawerOpen(false);
      setActiveView("search");
      socket.search(query, source);
    },
    [socket]
  );

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

      <div className="relative flex min-h-0 flex-1">
        <Sidebar
          activeView={activeView}
          selectedPlaylistId={selectedPlaylistId}
          playlists={socket.playlists}
          connected={socket.connected}
          onSelectView={(view) => {
            setDrawerOpen(false);
            setActiveView(view);
          }}
          onSelectPlaylist={(id) => {
            setDrawerOpen(false);
            setSelectedPlaylistId(id);
            setActiveView("playlist");
          }}
          onCreatePlaylist={socket.createPlaylist}
          onPlayPlaylist={(id) => socket.playPlaylist(id, false)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="ytm-ambient flex min-w-0 flex-1 flex-col">
          <TopBar
            user={user}
            meta={meta}
            guilds={guilds}
            selectedGuildId={socket.selectedGuildId}
            searching={socket.searching}
            onOpenMobileMenu={() => setMobileMenuOpen(true)}
            onSearch={handleSearch}
            onSelectGuild={socket.selectGuild}
            onOpenSettings={() => {
              setDrawerOpen(false);
              setActiveView("settings");
            }}
            onLogout={() => void handleLogout()}
          />

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              {activeView === "home" && (
                <HomeView
                  user={user}
                  history={socket.history}
                  playlists={socket.playlists}
                  onMoodSearch={(q, src) => handleSearch(q, src ?? "ytmsearch")}
                  onEnqueue={socket.enqueue}
                  onSelectPlaylist={(id) => {
                    setSelectedPlaylistId(id);
                    setActiveView("playlist");
                  }}
                  onPlayPlaylist={(id) => socket.playPlaylist(id, false)}
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
                  onPlayPlaylist={(id) => socket.playPlaylist(id, false)}
                  onEnqueue={socket.enqueue}
                  onLoadSettings={socket.requestSettings}
                  onSaveSettings={socket.updateSettings}
                />
              )}

              {activeView === "playlist" && (
                <PlaylistDetailView
                  playlist={activePlaylist}
                  onBack={() => setActiveView("library")}
                  onPlayPlaylist={socket.playPlaylist}
                  onRenamePlaylist={socket.renamePlaylist}
                  onDeletePlaylist={socket.deletePlaylist}
                  onRemoveTrack={socket.removeTrackFromPlaylist}
                  onEnqueueTrack={socket.enqueue}
                />
              )}

              {activeView === "search" && (
                <SearchResultsView
                  searching={socket.searching}
                  searchResults={socket.searchResults}
                  playlists={socket.playlists}
                  onEnqueue={socket.enqueue}
                  onAddToPlaylist={socket.addTrackToPlaylist}
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
          </main>
        </div>

        <NowPlayingDrawer
          open={drawerOpen}
          playerState={socket.playerState}
          lyricsState={socket.lyricsState}
          onClose={() => setDrawerOpen(false)}
          onPlayTrack={socket.playTrack}
          onMoveTrack={socket.moveTrack}
          onRemoveTrack={socket.removeTrack}
          onShuffle={socket.shuffle}
          onClear={socket.clearQueue}
          onToggleAutoplay={socket.toggleAutoplay}
          onStop={socket.stop}
          onFetchLyrics={socket.requestLyrics}
          onSetFilter={socket.setFilter}
        />
      </div>

      <PlayerBar
        playerState={socket.playerState}
        displayPosition={socket.displayPosition}
        playlists={socket.playlists}
        drawerOpen={drawerOpen}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        onTogglePause={socket.togglePause}
        onSkip={socket.skip}
        onPrevious={socket.previous}
        onSeek={socket.seek}
        onVolume={socket.setVolume}
        onRepeat={socket.setRepeat}
        onShuffle={socket.shuffle}
        onToggleAutoplay={socket.toggleAutoplay}
        onAddToPlaylist={socket.addTrackToPlaylist}
      />
    </div>
  );
}
