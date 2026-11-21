import {
  Compass,
  Disc3,
  ExternalLink,
  ListMusic,
  LogOut,
  Mic2,
  PlusCircle,
  Search,
  Settings,
  Sliders,
  Volume2,
  X,
} from "lucide-react";
import type { AppMetaDTO, GuildSummaryDTO, UserProfileDTO } from "@shared/types";

export type NavTab = "discover" | "queue" | "playlists" | "effects" | "lyrics" | "settings";

interface Props {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  guilds: GuildSummaryDTO[];
  selectedGuildId: string | null;
  onSelectGuild: (guildId: string) => void;
  user: UserProfileDTO;
  meta: AppMetaDTO | null;
  connected: boolean;
  onLogout: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof Search }[] = [
  { id: "discover", label: "Discover & Search", icon: Compass },
  { id: "queue", label: "Queue", icon: ListMusic },
  { id: "playlists", label: "Playlists", icon: Disc3 },
  { id: "effects", label: "Audio Effects", icon: Sliders },
  { id: "lyrics", label: "Lyrics", icon: Mic2 },
  { id: "settings", label: "Server Settings", icon: Settings },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  guilds,
  selectedGuildId,
  onSelectGuild,
  user,
  meta,
  connected,
  onLogout,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const botGuilds = guilds.filter((g) => g.botPresent);
  const invitableGuilds = guilds.filter((g) => !g.botPresent && g.canManage);
  const selectedGuild = guilds.find((g) => g.id === selectedGuildId);

  const buildInviteLink = (guildId: string) => {
    if (!meta?.botId) return meta?.inviteUrl || "#";
    return `https://discord.com/oauth2/authorize?client_id=${meta.botId}&permissions=36700160&scope=bot%20applications.commands&guild_id=${guildId}`;
  };

  const content = (
    <aside className="flex h-full w-72 flex-col border-r border-white/8 bg-[#111116]">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div className="flex items-center gap-3">
          {meta?.botAvatarUrl ? (
            <img
              src={meta.botAvatarUrl}
              alt={meta.botName}
              className="h-9 w-9 rounded-lg border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400">
              <Disc3 className="h-5 w-5" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight text-white">
                {meta?.botName || "Cadence"}
              </span>
              <span
                title={connected ? "Real-time sync active" : "Reconnecting..."}
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            </div>
            <p className="text-[11px] text-zinc-400">
              {meta?.lavalinkConnected ? "Audio Engine Ready" : "Lavalink Offline"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-5">
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Navigation
          </p>
          <nav className="mt-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const disabled = item.id === "settings" && selectedGuild && !selectedGuild.canManage;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={Boolean(disabled)}
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-violet-600/20 text-violet-200 ring-1 ring-violet-500/30"
                      : disabled
                        ? "cursor-not-allowed text-zinc-600"
                        : "text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div>
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Servers ({botGuilds.length})
          </p>
          <div className="mt-2 space-y-1">
            {botGuilds.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-zinc-500">
                No mutual servers found. Invite Cadence to a server below.
              </p>
            ) : (
              botGuilds.map((guild) => {
                const selected = guild.id === selectedGuildId;
                return (
                  <button
                    key={guild.id}
                    type="button"
                    onClick={() => {
                      onSelectGuild(guild.id);
                      onCloseMobile();
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition ${
                      selected
                        ? "bg-white/10 text-white ring-1 ring-white/15"
                        : "text-zinc-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    {guild.iconUrl ? (
                      <img
                        src={guild.iconUrl}
                        alt={guild.name}
                        className="h-7 w-7 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs font-semibold text-zinc-300">
                        {guild.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium leading-tight">{guild.name}</p>
                      <p className="text-[11px] text-zinc-400">
                        {guild.inVoice
                          ? "You are in voice"
                          : guild.hasActivePlayer
                            ? "Playing now"
                            : "Idle"}
                      </p>
                    </div>
                    {(guild.inVoice || guild.hasActivePlayer) && (
                      <Volume2
                        className={`h-3.5 w-3.5 shrink-0 ${
                          guild.inVoice ? "text-emerald-400" : "text-violet-400"
                        }`}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {invitableGuilds.length > 0 && (
          <div className="mt-5">
            <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Invite Bot
            </p>
            <div className="mt-2 space-y-1">
              {invitableGuilds.slice(0, 6).map((guild) => (
                <a
                  key={guild.id}
                  href={buildInviteLink(guild.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
                >
                  <PlusCircle className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  <span className="flex-1 truncate">{guild.name}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/8 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="h-8 w-8 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600/30 text-xs font-bold text-violet-200">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {user.globalName || user.username}
            </p>
            <p className="truncate text-[11px] text-zinc-400">@{user.username}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Log out"
          className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden h-full lg:block">{content}</div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
