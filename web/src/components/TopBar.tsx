import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Check,
  Disc3,
  ExternalLink,
  Keyboard,
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
  SearchSuggestResponseDTO,
  TrackDTO,
  UserProfileDTO,
} from "@shared/types";
import { useI18n } from "../i18n";
import { useShowKeyboardShortcuts } from "../utils/device";
import { formatMs } from "../utils/format";
import { loadUiPrefs, saveUiPrefs } from "../utils/theme";
import { ArtistLinks } from "./ArtistLinks";
import { MobileMenuButton } from "./Sidebar";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  user: UserProfileDTO;
  meta: AppMetaDTO | null;
  guilds: GuildSummaryDTO[];
  selectedGuildId: string | null;
  defaultSearchSource: SearchSource;
  searching: boolean;
  onOpenMobileMenu: () => void;
  onSearch: (query: string, source: SearchSource) => void;
  onPlayTrack: (track: TrackDTO, sourceLabel?: string) => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: ReactMouseEvent, track: TrackDTO) => void;
  onSelectGuild: (guildId: string) => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  onLogout: () => void;
}

const SEARCH_SOURCES: { id: SearchSource; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "ytmsearch", label: "YT Music" },
  { id: "ytsearch", label: "YouTube" },
  { id: "spsearch", label: "Spotify" },
  { id: "scsearch", label: "SoundCloud" },
  { id: "dzsearch", label: "Deezer" },
];

export function TopBar({
  user,
  meta,
  guilds,
  selectedGuildId,
  defaultSearchSource,
  searching,
  onOpenMobileMenu,
  onSearch,
  onPlayTrack,
  onOpenArtist,
  onTrackContextMenu,
  onSelectGuild,
  onOpenSettings,
  onOpenShortcuts,
  onLogout,
}: Props) {
  const { t } = useI18n();
  const showKeyboardShortcuts = useShowKeyboardShortcuts();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SearchSource>(() => {
    const saved = loadUiPrefs().searchSource;
    return saved === "auto" ? defaultSearchSource : saved;
  });
  const [openMenu, setOpenMenu] = useState<"cast" | "user" | null>(null);

  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestTracks, setSuggestTracks] = useState<TrackDTO[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevDefaultSourceRef = useRef<SearchSource>(defaultSearchSource);

  useEffect(() => {
    if (prevDefaultSourceRef.current !== defaultSearchSource) {
      prevDefaultSourceRef.current = defaultSearchSource;
      setSource(defaultSearchSource);
      saveUiPrefs({ searchSource: defaultSearchSource });
    }
  }, [defaultSearchSource]);

  const botGuilds = guilds.filter((g) => g.botPresent);
  const invitableGuilds = guilds.filter((g) => !g.botPresent && g.canManage);
  const currentGuild = guilds.find((g) => g.id === selectedGuildId) ?? null;

  useEffect(() => {
    const onFocusSearch = () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    const onSetSearchSource = (e: Event) => {
      const custom = e as CustomEvent<SearchSource>;
      if (custom.detail) {
        setSource(custom.detail);
      }
    };
    window.addEventListener("cadence:focus-search", onFocusSearch);
    window.addEventListener("cadence:set-search-source", onSetSearchSource);
    return () => {
      window.removeEventListener("cadence:focus-search", onFocusSearch);
      window.removeEventListener("cadence:set-search-source", onSetSearchSource);
    };
  }, []);

  useEffect(() => {
    const onDocClick = (e: globalThis.MouseEvent) => {
      const targetEl = e.target as HTMLElement | null;
      if (targetEl?.closest("[data-context-menu='true']")) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
        setSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || /^https?:\/\//i.test(trimmed)) {
      setSuggestions([]);
      setSuggestTracks([]);
      setSuggestLoading(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    setSuggestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(trimmed)}&source=${encodeURIComponent(source)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          setSuggestLoading(false);
          return;
        }
        const data = (await res.json()) as SearchSuggestResponseDTO;
        setSuggestions(data.suggestions ?? []);
        setSuggestTracks(data.tracks ?? []);
        setActiveIndex(-1);
        setSuggestOpen(true);
      } catch {
        // Ignore aborted or transient suggest errors
      } finally {
        if (!controller.signal.aborted) {
          setSuggestLoading(false);
        }
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, source]);

  const totalSuggestItems = suggestions.length + suggestTracks.length;
  const showDropdown = suggestOpen && query.trim().length >= 2 && (totalSuggestItems > 0 || suggestLoading);

  const runSearch = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setSuggestOpen(false);
    setActiveIndex(-1);
    searchInputRef.current?.blur();
    onSearch(clean, source);
  };

  const executeSearchOrSelected = () => {
    if (showDropdown && activeIndex >= 0) {
      if (activeIndex < suggestions.length) {
        const text = suggestions[activeIndex];
        setQuery(text);
        runSearch(text);
        return;
      }
      const track = suggestTracks[activeIndex - suggestions.length];
      if (track) {
        setSuggestOpen(false);
        setActiveIndex(-1);
        searchInputRef.current?.blur();
        onPlayTrack(track);
        return;
      }
    }
    runSearch(query);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    executeSearchOrSelected();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      executeSearchOrSelected();
      return;
    }

    if (!showDropdown || totalSuggestItems === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1 >= totalSuggestItems ? 0 : prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? totalSuggestItems - 1 : prev - 1));
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
      setActiveIndex(-1);
    }
  };

  const renderHighlightedSuggestion = (text: string) => {
    const cleanTyped = query.trim();
    if (cleanTyped && text.toLowerCase().startsWith(cleanTyped.toLowerCase())) {
      return (
        <>
          <span className="font-semibold text-white">{text.slice(0, cleanTyped.length)}</span>
          <span className="text-zinc-400">{text.slice(cleanTyped.length)}</span>
        </>
      );
    }
    return <span className="text-zinc-200">{text}</span>;
  };

  const buildInviteLink = (guildId: string) => {
    if (!meta?.botId) return meta?.inviteUrl || "#";
    return `https://discord.com/oauth2/authorize?client_id=${meta.botId}&permissions=36700160&scope=bot%20applications.commands&guild_id=${guildId}`;
  };

  return (
    <header
      ref={containerRef}
      className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-white/8 bg-[#030303]/85 px-4 backdrop-blur-xl lg:px-8"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <MobileMenuButton onClick={onOpenMobileMenu} />

        {/* YTM-style search pill + live autofill dropdown */}
        <form action="#" role="search" onSubmit={handleSubmit} className="relative w-full max-w-xl">
          <div
            className={`flex items-center gap-2 border border-white/12 px-3 py-1.5 transition ${
              showDropdown
                ? "rounded-t-lg border-white/25 bg-[#0f0f0f]"
                : "rounded-lg bg-white/[0.08] focus-within:border-white/30 focus-within:bg-[#121212]"
            }`}
          >
            <button
              type="submit"
              className="text-zinc-400 transition hover:text-white"
              aria-label="Search"
            >
              {searching || suggestLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
            <input
              ref={searchInputRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onFocus={() => {
                if (totalSuggestItems > 0) setSuggestOpen(true);
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim().length >= 2) {
                  setSuggestOpen(true);
                } else {
                  setSuggestOpen(false);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={t("search.placeholder")}
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder-zinc-400 outline-none [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                  setSuggestTracks([]);
                  setSuggestOpen(false);
                }}
                className="rounded-full p-0.5 text-zinc-400 hover:text-white"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="h-4 w-px bg-white/15" />
            <select
              value={source}
              onChange={(e) => {
                const next = e.target.value as SearchSource;
                setSource(next);
                saveUiPrefs({ searchSource: next });
              }}
              aria-label="Search source"
              className="max-w-24 cursor-pointer bg-transparent pr-0.5 text-xs font-medium text-zinc-300 outline-none sm:max-w-none sm:pr-1 [&>option]:bg-[#181818]"
            >
              {SEARCH_SOURCES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {showDropdown && (
            <div className="absolute inset-x-0 top-full z-40 overflow-hidden rounded-b-xl border border-t-0 border-white/20 bg-[#0f0f0f] shadow-2xl">
              {suggestions.length > 0 && (
                <div className="py-1.5">
                  {suggestions.map((text, idx) => {
                    const highlighted = activeIndex === idx;
                    return (
                      <button
                        key={`${text}-${idx}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setQuery(text);
                          runSearch(text);
                        }}
                        className={`flex w-full items-center gap-3.5 px-3.5 py-2 text-left text-sm transition ${
                          highlighted ? "bg-white/12" : "hover:bg-white/[0.08]"
                        }`}
                      >
                        <Search className="h-4 w-4 shrink-0 text-zinc-400" />
                        <span className="truncate">{renderHighlightedSuggestion(text)}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {suggestTracks.length > 0 && (
                <div
                  className={
                    suggestions.length > 0 ? "border-t border-white/10 py-1.5" : "py-1.5"
                  }
                >
                  {suggestTracks.map((track, idx) => {
                    const itemIdx = suggestions.length + idx;
                    const highlighted = activeIndex === itemIdx;
                    return (
                      <div
                        key={`suggest-${track.identifier}-${idx}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSuggestOpen(false);
                          setActiveIndex(-1);
                          onPlayTrack(track);
                        }}
                        onContextMenu={(e) => {
                          onTrackContextMenu(e, track);
                        }}
                        className={`flex cursor-pointer items-center gap-3 px-3.5 py-2 transition ${
                          highlighted ? "bg-white/12" : "hover:bg-white/[0.08]"
                        }`}
                      >
                        <TrackArtwork
                          track={track}
                          className="h-10 w-10 shrink-0 rounded"
                          iconClassName="h-4 w-4"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{track.title}</p>
                          <p className="truncate text-xs text-zinc-400">
                            <span>Song • </span>
                            <ArtistLinks
                              author={track.author}
                              onOpenArtist={(name) => {
                                setSuggestOpen(false);
                                onOpenArtist(name);
                              }}
                            />
                            <span> • {track.isStream ? "LIVE" : formatMs(track.duration)}</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Right controls: Discord Server Pill (logo + name) + User Avatar */}
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === "cast" ? null : "cast"))}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] p-1 text-xs font-medium text-zinc-100 transition hover:border-white/30 hover:bg-white/10 sm:py-1 sm:pl-1.5 sm:pr-3"
          title={currentGuild ? `Server: ${currentGuild.name}` : "Select Discord server"}
          aria-label="Switch Discord server"
        >
          {currentGuild?.iconUrl ? (
            <img
              src={currentGuild.iconUrl}
              alt={currentGuild.name}
              referrerPolicy="no-referrer"
              className="h-6 w-6 shrink-0 rounded-full object-cover"
            />
          ) : currentGuild ? (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600/80 text-[10px] font-semibold text-white">
              {currentGuild.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase())
                .join("") || currentGuild.name.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
              <Disc3 className="h-3.5 w-3.5" />
            </div>
          )}
          <span className="hidden max-w-28 truncate sm:inline sm:max-w-40">
            {currentGuild ? currentGuild.name : "Select Server"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setOpenMenu(null);
            onOpenSettings();
          }}
          title="Settings"
          aria-label="Settings"
          className="hidden rounded-full border border-white/12 bg-white/[0.04] p-2 text-zinc-300 transition hover:border-white/30 hover:bg-white/10 hover:text-white lg:inline-flex"
        >
          <Settings className="h-4 w-4" />
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
                {t("search.serverPill")}
              </span>
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
                          referrerPolicy="no-referrer"
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
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                onOpenSettings();
              }}
              className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-200 transition hover:bg-white/10"
            >
              <Settings className="h-4 w-4 text-zinc-400" />
              Settings
            </button>
            {showKeyboardShortcuts && (
              <button
                type="button"
                onClick={() => {
                  setOpenMenu(null);
                  onOpenShortcuts();
                }}
                className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-200 transition hover:bg-white/10"
              >
                <Keyboard className="h-4 w-4 text-zinc-400" />
                <span>Keyboard shortcuts</span>
                <span className="ml-auto font-mono text-[10px] text-zinc-500">?</span>
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
