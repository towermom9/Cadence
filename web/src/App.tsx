import { useCallback, useEffect, useState } from "react";
import { Loader2, Menu } from "lucide-react";
import type { AppMetaDTO, GuildSummaryDTO, UserProfileDTO } from "@shared/types";
import { EffectsView } from "./components/EffectsView";
import { LoginView } from "./components/LoginView";
import { LyricsView } from "./components/LyricsView";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PlayerBar } from "./components/PlayerBar";
import { PlaylistsView } from "./components/PlaylistsView";
import { QueueView } from "./components/QueueView";
import { SearchView } from "./components/SearchView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type NavTab } from "./components/Sidebar";
import { ToastStack } from "./components/ToastStack";
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
  const [activeTab, setActiveTab] = useState<NavTab>("discover");
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

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    window.location.href = "/";
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09090b] text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#09090b] text-zinc-100">
      <ToastStack toasts={socket.toasts} onDismiss={socket.dismissToast} />

      <div className="flex min-h-0 flex-1">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          guilds={guilds}
          selectedGuildId={socket.selectedGuildId}
          onSelectGuild={socket.selectGuild}
          user={user}
          meta={meta}
          connected={socket.connected}
          onLogout={handleLogout}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-white/8 bg-[#111116]/80 px-4 py-3 backdrop-blur-md lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg p-1.5 text-zinc-300 hover:bg-white/10 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-sm font-semibold text-white">
                  {currentGuild ? currentGuild.name : "Select a Discord Server"}
                </h1>
                <p className="text-[11px] text-zinc-400">
                  {socket.playerState?.voiceChannelName
                    ? `Playing in #${socket.playerState.voiceChannelName}`
                    : currentGuild
                      ? "Join a voice channel in Discord to play audio"
                      : "Invite Cadence to a server or pick one on the left"}
                </p>
              </div>
            </div>

            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                socket.connected
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {socket.connected ? "Live Sync" : "Reconnecting"}
            </span>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
              {activeTab === "discover" && (
                <SearchView
                  searching={socket.searching}
                  searchResults={socket.searchResults}
                  history={socket.history}
                  playlists={socket.playlists}
                  onSearch={socket.search}
                  onEnqueue={socket.enqueue}
                  onAddToPlaylist={socket.addTrackToPlaylist}
                />
              )}

              {activeTab === "queue" && (
                <QueueView
                  playerState={socket.playerState}
                  playlists={socket.playlists}
                  onPlayTrack={socket.playTrack}
                  onMoveTrack={socket.moveTrack}
                  onRemoveTrack={socket.removeTrack}
                  onShuffle={socket.shuffle}
                  onClear={socket.clearQueue}
                  onAddToPlaylist={socket.addTrackToPlaylist}
                />
              )}

              {activeTab === "playlists" && (
                <PlaylistsView
                  playlists={socket.playlists}
                  onCreate={socket.createPlaylist}
                  onRename={socket.renamePlaylist}
                  onDelete={socket.deletePlaylist}
                  onPlay={socket.playPlaylist}
                  onRemoveTrack={socket.removeTrackFromPlaylist}
                />
              )}

              {activeTab === "effects" && (
                <EffectsView
                  playerState={socket.playerState}
                  onSetFilter={socket.setFilter}
                />
              )}

              {activeTab === "lyrics" && (
                <LyricsView
                  playerState={socket.playerState}
                  lyricsState={socket.lyricsState}
                  onFetchLyrics={socket.requestLyrics}
                />
              )}

              {activeTab === "settings" && (
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
      </div>

      <PlayerBar
        playerState={socket.playerState}
        displayPosition={socket.displayPosition}
        onTogglePause={socket.togglePause}
        onSkip={socket.skip}
        onPrevious={socket.previous}
        onSeek={socket.seek}
        onVolume={socket.setVolume}
        onRepeat={socket.setRepeat}
        onShuffle={socket.shuffle}
        onToggleAutoplay={socket.toggleAutoplay}
        onStop={socket.stop}
      />
    </div>
  );
}
