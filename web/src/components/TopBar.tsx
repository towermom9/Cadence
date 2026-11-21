import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Check,
  Disc3,
  ExternalLink,
  Loader2,
  LogOut,
  PlusCircle,
  Search,
  Settings,
  Volume2,
  X,
} from "lucide-react";
import type {
  AppMetaDTO,
  GuildSummaryDTO,
  SearchSource,
  UserProfileDTO,
} from "@shared/types";
import { MobileMenuButton } from "./Sidebar";

interface Props {
  user: UserProfileDTO;
  meta: AppMetaDTO | null;
  guilds: GuildSummaryDTO[];
  selectedGuildId: string | null;
  playerConnected?: boolean;
  searching: boolean;
  onOpenMobileMenu: () => void;
  onSearch: (query: string, source: SearchSource) => void;
  onSelectGuild: (guildId: string) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

const SEARCH_SOURCES: { id: SearchSource; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "ytmsearch", label: "YT Music" },
  { id: "ytsearch", label: "YouTube" },
  { id: "spsearch", label: "Spotify" },
  { id: "scsearch", label: "SoundCloud" },
];

export function TopBar({
  user,
  meta,
  guilds,
  selectedGuildId,
  playerConnected = false,
  searching,
  onOpenMobileMenu,
  onSearch,
  onSelectGuild,
  onOpenSettings,
  onLogout,
}: Props) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SearchSource>("auto");
  const [openMenu, setOpenMenu] = useState<"cast" | "user" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const botGuilds = guilds.filter((g) => g.botPresent);
  const invitableGuilds = guilds.filter((g) => !g.botPresent && g.canManage);
  const currentGuild = guilds.find((g) => g.id === selectedGuildId) ?? null;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch(query.trim(), source);
  };

  const buildInviteLink = (guildId: string) => {
    if (!meta?.botId) return meta?.inviteUrl || "#";
    return `https://discord.com/oauth2/authorize?client_id=${meta.botId}&permissions=36700160&scope=bot%20applications.commands&guild_id=${guildId}`;
  };

  return (
    <header
      ref={containerRef}
      className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-white/8 bg-[#030303]/85 px-4 backdrop-blur-xl lg:px-8"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MobileMenuButton onClick={onOpenMobileMenu} />

        {/* YTM-style search pill */}
        <form onSubmit={handleSubmit} className="w-full max-w-xl">
          <div className="flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.08] px-3 py-1.5 transition focus-within:border-white/30 focus-within:bg-[#121212]">
            <button
              type="submit"
              className="text-zinc-400 transition hover:text-white"
              aria-label="Search"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs, albums, artists, URLs..."
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-zinc-400 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full p-0.5 text-zinc-400 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="h-4 w-px bg-white/15" />
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as SearchSource)}
              aria-label="Search source"
              className="cursor-pointer bg-transparent pr-1 text-xs font-medium text-zinc-300 outline-none [&>option]:bg-[#181818]"
            >
              {SEARCH_SOURCES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </form>
      </div>

      {/* Right controls: Discord Server Icon + User Avatar */}
      <div className="relative flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === "cast" ? null : "cast"))}
          className="relative rounded-full ring-1 ring-white/15 transition hover:ring-white/40"
          title={currentGuild ? `Server: ${currentGuild.name}` : "Select Discord server"}
          aria-label="Switch Discord server"
        >
          {currentGuild?.iconUrl ? (
            <img
              src={currentGuild.iconUrl}
              alt={currentGuild.name}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : currentGuild ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/80 text-xs font-semibold text-white">
              {currentGuild.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("") || currentGuild.name.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
              <Disc3 className="h-4 w-4" />
            </div>
          )}

          {(currentGuild?.inVoice || playerConnected) && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#030303]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === "user" ? null : "user"))}
          className="rounded-full ring-1 ring-white/15 transition hover:ring-white/40"
          title={user.globalName || user.username}
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-white">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
          )}
        </button>

        {/* Server / Cast Popover */}
        {openMenu === "cast" && (
          <div className="absolute right-10 top-11 z-30 w-72 rounded-xl border border-white/12 bg-[#212121] p-2 shadow-2xl">
            <div className="flex items-center justify-between px-2.5 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Play on Server
              </span>
              {currentGuild?.canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenSettings();
                  }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  <Settings className="h-3 w-3" />
                  Settings
                </button>
              )}
            </div>

            <div className="mt-1 max-h-64 space-y-0.5 overflow-y-auto">
              {botGuilds.length === 0 ? (
                <p className="px-2.5 py-3 text-xs text-zinc-400">
                  No mutual servers yet. Invite Cadence below.
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
                        setOpenMenu(null);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        selected ? "bg-white/12 text-white" : "text-zinc-300 hover:bg-white/[0.07]"
                      }`}
                    >
                      {guild.iconUrl ? (
                        <img
                          src={guild.iconUrl}
                          alt={guild.name}
                          className="h-7 w-7 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-white">
                          {guild.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{guild.name}</p>
                        <p className="text-[11px] text-zinc-400">
                          {guild.inVoice
                            ? "You are in voice"
                            : guild.hasActivePlayer
                              ? "Playing now"
                              : "Idle"}
                        </p>
                      </div>
                      {guild.inVoice || guild.hasActivePlayer ? (
                        <Volume2
                          className={`h-3.5 w-3.5 shrink-0 ${
                            guild.inVoice ? "text-emerald-400" : "text-white"
                          }`}
                        />
                      ) : selected ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-white" />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            {invitableGuilds.length > 0 && (
              <>
                <div className="my-1.5 border-t border-white/10" />
                <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Invite Cadence
                </p>
                <div className="max-h-36 space-y-0.5 overflow-y-auto">
                  {invitableGuilds.slice(0, 5).map((guild) => (
                    <a
                      key={guild.id}
                      href={buildInviteLink(guild.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <PlusCircle className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span className="flex-1 truncate">{guild.name}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* User Avatar Popover */}
        {openMenu === "user" && (
          <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-white/12 bg-[#212121] p-1.5 shadow-2xl">
            <div className="border-b border-white/10 px-3 py-2">
              <p className="truncate text-sm font-medium text-white">
                {user.globalName || user.username}
              </p>
              <p className="truncate text-xs text-zinc-400">@{user.username}</p>
            </div>
            {currentGuild?.canManage && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenSettings();
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-200 transition hover:bg-white/10"
              >
                <Settings className="h-4 w-4 text-zinc-400" />
                Server Settings
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-200 transition hover:bg-white/10"
            >
              <LogOut className="h-4 w-4 text-zinc-400" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
