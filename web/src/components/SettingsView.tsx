import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Palette,
  Play,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
} from "lucide-react";
import type {
  AccessTier,
  AutoplayClickBehavior,
  DebugLogEntryDTO,
  GuildSettingsDTO,
  SearchSource,
  SystemInfoDTO,
  UserPreferencesDTO,
} from "@shared/types";
import { BACKGROUND_MODES, THEME_ACCENTS } from "../utils/theme";
import { CadenceBanner, CadenceIcon } from "./CadenceBrand";

interface Props {
  guildId: string | null;
  guildName: string;
  username: string;
  canManage: boolean;
  isBotOwner: boolean;
  isGuildOwner: boolean;
  canAccessSystem: boolean;
  accessTier?: AccessTier;
  settings: GuildSettingsDTO | null;
  preferences: UserPreferencesDTO;
  onUpdatePreferences: (patch: Partial<UserPreferencesDTO>) => void;
  onLoadSettings: (guildId: string) => void;
  onSaveSettings: (patch: Partial<Omit<GuildSettingsDTO, "guildId" | "roles">>) => void;
}

const ACCESS_TIER_LABELS: Record<AccessTier, string> = {
  bot_owner: "Bot Owner",
  server_owner: "Server Owner",
  admin: "Admin",
  dj: "DJ",
  user: "User",
  none: "Restricted",
};

type SettingsTab = "appearance" | "playback" | "server" | "system";

const SEARCH_PROVIDER_OPTIONS: {
  id: SearchSource;
  title: string;
  description: string;
}[] = [
  {
    id: "ytmsearch",
    title: "YouTube Music",
    description: "Official tracks, albums, and clean audio matches.",
  },
  {
    id: "ytsearch",
    title: "YouTube",
    description: "Broadest video catalog including covers and live clips.",
  },
  {
    id: "spsearch",
    title: "Spotify",
    description: "Spotify metadata resolved through Lavalink audio sources.",
  },
  {
    id: "scsearch",
    title: "SoundCloud",
    description: "Indie uploads, remixes, and DJ sets.",
  },
  {
    id: "dzsearch",
    title: "Deezer",
    description: "Deezer catalog lookup (when enabled on Lavalink).",
  },
  {
    id: "auto",
    title: "Server Default (Auto)",
    description: "Use the server's configured default search provider.",
  },
];

const AUTOPLAY_CLICK_OPTIONS: {
  id: AutoplayClickBehavior;
  title: string;
  description: string;
}[] = [
  {
    id: "play_now_here",
    title: "Play now - right after current",
    description:
      "Immediately plays the clicked Autoplay song while keeping your queued songs intact.",
  },
  {
    id: "play_now_end",
    title: "Play now - move past queued tracks",
    description:
      "Skips ahead and starts playback at that Autoplay song, moving earlier queued items to history.",
  },
  {
    id: "queue_next",
    title: "Queue as Play Next",
    description:
      "Moves the clicked Autoplay song to the top of your manual queue to play right after the current song.",
  },
  {
    id: "queue_end",
    title: "Add to end of queue",
    description:
      "Moves the clicked Autoplay song to the end of your manual queue without interrupting playback.",
  },
];

function formatEmptyVcDelay(seconds: number): string {
  const clamped = Math.max(0, Math.min(300, Math.round(seconds)));
  if (clamped === 0) return "Immediate (0s)";
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  if (mins > 0 && secs > 0) return `${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m (${clamped}s)`;
  return `${secs}s`;
}

function formatEmptyVcDisconnect(minutes: number): string {
  const clamped = Math.max(0, Math.min(120, Math.round(minutes)));
  if (clamped === 0) return "Never (Off)";
  if (clamped >= 60) {
    const hrs = Math.floor(clamped / 60);
    const rem = clamped % 60;
    return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h (${clamped}m)`;
  }
  return `${clamped}m`;
}

function ThemeSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={checked ? { backgroundColor: "var(--cadence-accent)" } : undefined}
      className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? "" : "bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function SettingsView({
  guildId,
  guildName,
  username,
  canManage,
  isBotOwner,
  isGuildOwner,
  canAccessSystem,
  accessTier,
  settings,
  preferences,
  onUpdatePreferences,
  onLoadSettings,
  onSaveSettings,
}: Props) {
  const canAccessServerSettings = isBotOwner || isGuildOwner || canManage;
  const canAccessSystemSettings = isBotOwner || isGuildOwner || canAccessSystem;
  const resolvedTier: AccessTier =
    accessTier ??
    (isBotOwner ? "bot_owner" : isGuildOwner ? "server_owner" : canManage ? "admin" : "user");
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const [prefix, setPrefix] = useState("?");
  const [defaultVolume, setDefaultVolume] = useState(100);
  const [djRoleId, setDjRoleId] = useState<string>("");
  const [accessRoleIds, setAccessRoleIds] = useState<string[]>([]);
  const [adminRoleIds, setAdminRoleIds] = useState<string[]>([]);
  const [stay247, setStay247] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(true);
  const [pauseOnEmpty, setPauseOnEmpty] = useState(true);
  const [pauseOnEmptySeconds, setPauseOnEmptySeconds] = useState(0);
  const [emptyVcDisconnectMinutes, setEmptyVcDisconnectMinutes] = useState(30);
  const [ignoreDeafenedListeners, setIgnoreDeafenedListeners] = useState(false);
  const [defaultPlayNext, setDefaultPlayNext] = useState(false);
  const [sysInfo, setSysInfo] = useState<SystemInfoDTO | null>(null);
  const [sysLogs, setSysLogs] = useState<DebugLogEntryDTO[]>([]);
  const [sysText, setSysText] = useState("");
  const [sysLoading, setSysLoading] = useState(false);
  const [sysError, setSysError] = useState<string | null>(null);
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Reset tab if permissions change (e.g. switched to a server where user is not admin/owner)
  useEffect(() => {
    if (tab === "server" && !canAccessServerSettings) {
      setTab("appearance");
    } else if (tab === "system" && !canAccessSystemSettings) {
      setTab("appearance");
    }
  }, [canAccessServerSettings, canAccessSystemSettings, tab]);

  const loadSystemLogs = useCallback(async () => {
    setSysLoading(true);
    setSysError(null);
    try {
      const res = await fetch("/api/system/logs");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        info?: SystemInfoDTO;
        logs?: DebugLogEntryDTO[];
        text?: string;
      };
      if (data.info) setSysInfo(data.info);
      setSysLogs(data.logs ?? []);
      setSysText(data.text ?? "");
    } catch (error) {
      setSysError(error instanceof Error ? error.message : "Failed to load system diagnostics.");
    } finally {
      setSysLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "system" && canAccessSystemSettings) {
      void loadSystemLogs();
    }
  }, [canAccessSystemSettings, loadSystemLogs, tab]);

  useEffect(() => {
    if (guildId && canAccessServerSettings) {
      onLoadSettings(guildId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, guildId, canAccessServerSettings]);

  useEffect(() => {
    if (!settings) return;
    setPrefix(settings.prefix);
    setDefaultVolume(Math.min(100, Math.max(0, settings.defaultVolume)));
    setDjRoleId(settings.djRoleId ?? "");
    setAccessRoleIds(settings.accessRoleIds ?? []);
    setAdminRoleIds(settings.adminRoleIds ?? []);
    setStay247(settings.stay247);
    setAutoplay(settings.autoplay);
    setAllowDuplicates(settings.allowDuplicates);
    setPauseOnEmpty(settings.pauseOnEmpty ?? true);
    setPauseOnEmptySeconds(
      Math.min(300, Math.max(0, Math.round(settings.pauseOnEmptySeconds ?? 0)))
    );
    setEmptyVcDisconnectMinutes(
      Math.min(120, Math.max(0, Math.round(settings.emptyVcDisconnectMinutes ?? 30)))
    );
    setIgnoreDeafenedListeners(Boolean(settings.ignoreDeafenedListeners));
    setDefaultPlayNext(Boolean(settings.defaultPlayNext));
  }, [settings]);

  const effectivePauseOnEmpty = settings
    ? pauseOnEmpty
    : (preferences.pauseOnEmpty ?? true);
  const effectivePauseOnEmptySeconds = settings
    ? pauseOnEmptySeconds
    : Math.min(300, Math.max(0, Math.round(preferences.pauseOnEmptySeconds ?? 0)));

  const handleEmptyVcToggle = (next: boolean) => {
    setPauseOnEmpty(next);
    onUpdatePreferences({ pauseOnEmpty: next });
  };

  const handleEmptyVcSecondsChange = (nextSec: number) => {
    const clamped = Math.min(300, Math.max(0, Math.round(nextSec)));
    setPauseOnEmptySeconds(clamped);
    onUpdatePreferences({ pauseOnEmptySeconds: clamped });
  };

  const toggleAccessRole = (roleId: string) => {
    setAccessRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const toggleAdminRole = (roleId: string) => {
    setAdminRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleServerSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      prefix: prefix.trim() || "?",
      defaultVolume: Math.min(100, Math.max(0, defaultVolume)),
      djRoleId: djRoleId || null,
      accessRoleIds,
      adminRoleIds,
      stay247,
      autoplay,
      allowDuplicates,
      pauseOnEmpty,
      pauseOnEmptySeconds: Math.min(300, Math.max(0, Math.round(pauseOnEmptySeconds))),
      emptyVcDisconnectMinutes: Math.min(
        120,
        Math.max(0, Math.round(emptyVcDisconnectMinutes))
      ),
      ignoreDeafenedListeners,
      defaultPlayNext,
    });
  };

  const visibleTabs = [
    { id: "appearance" as const, label: "Appearance", icon: Palette },
    { id: "playback" as const, label: "Playback", icon: Play },
    ...(canAccessServerSettings
      ? [{ id: "server" as const, label: "Server", icon: Server }]
      : []),
    ...(canAccessSystemSettings
      ? [{ id: "system" as const, label: "System", icon: Terminal }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
              <ShieldCheck className="h-3 w-3 text-emerald-400" />
              @{username} · {ACCESS_TIER_LABELS[resolvedTier]}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Customize theme colors, AMOLED surfaces, playback controls, and role-tiered access.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {visibleTabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-white text-black"
                    : "bg-white/[0.06] text-zinc-300 hover:bg-white/12 hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* APPEARANCE TAB */}
      {tab === "appearance" && (
        <div className="space-y-6">
          {/* Live Brand & Theme Accent Picker */}
          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-4">
              <div>
                <h2 className="text-base font-semibold text-white">Theme Color &amp; Brand</h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Updates the Cadence logo, tab icon, ambience glow, progress bar &amp; switches.
                </p>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0b0b0b] px-3.5 py-2">
                <CadenceIcon className="h-7 w-7" />
                <div className="h-5 w-px bg-white/15" />
                <CadenceBanner className="h-6" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
              {THEME_ACCENTS.map((accent) => {
                const selected = preferences.themeAccent === accent.id;
                return (
                  <button
                    key={accent.id}
                    type="button"
                    onClick={() => onUpdatePreferences({ themeAccent: accent.id })}
                    className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                      selected
                        ? "border-white bg-white/10 text-white"
                        : "border-white/10 bg-[#0b0b0b] text-zinc-300 hover:border-white/25 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span
                      style={{ backgroundColor: accent.hex }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ring-white/20"
                    >
                      {selected && (
                        <Check
                          className="h-3 w-3"
                          style={{ color: accent.fg }}
                        />
                      )}
                    </span>
                    <span className="truncate text-xs font-medium">{accent.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Background Style */}
          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div>
              <h2 className="text-base font-semibold text-white">Background Surface</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Choose between pure AMOLED #000000 black across all menus or YouTube dark surfaces.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {BACKGROUND_MODES.map((mode) => {
                const selected = preferences.backgroundMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onUpdatePreferences({ backgroundMode: mode.id })}
                    className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${
                      selected
                        ? "border-white bg-white/10"
                        : "border-white/10 bg-[#0b0b0b] hover:border-white/25 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        style={{ backgroundColor: mode.swatch }}
                        className="h-6 w-10 rounded-md border border-white/20 shadow-inner"
                      />
                      {selected && (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-black">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{mode.name}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{mode.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Ambience Mode */}
          <section className="rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-white/[0.08] p-2 text-zinc-200">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Ambience Mode</h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Subtle theme and album-art radial glow behind the top header and Now Playing deck.
                  </p>
                </div>
              </div>
              <ThemeSwitch
                checked={preferences.ambienceMode}
                onChange={(val) => onUpdatePreferences({ ambienceMode: val })}
                label="Toggle Ambience Mode"
              />
            </div>
          </section>
        </div>
      )}

      {/* PLAYBACK TAB */}
      {tab === "playback" && (
        <div className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div>
              <h2 className="text-base font-semibold text-white">Autoplay Song Click Behavior</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Choose what happens when you click a suggested song inside the Autoplay queue list.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {AUTOPLAY_CLICK_OPTIONS.map((opt) => {
                const selected = preferences.autoplayClickBehavior === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdatePreferences({ autoplayClickBehavior: opt.id })}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? "border-white bg-white/10"
                        : "border-white/10 bg-[#0b0b0b] hover:border-white/25 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span
                      style={
                        selected
                          ? {
                              borderColor: "var(--cadence-accent)",
                              backgroundColor: "var(--cadence-accent)",
                            }
                          : undefined
                      }
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "" : "border-zinc-500"
                      }`}
                    >
                      {selected && (
                        <span
                          style={{ backgroundColor: "var(--cadence-accent-fg)" }}
                          className="h-1.5 w-1.5 rounded-full"
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{opt.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Now Playing Thumbnail ±{preferences.artworkSeekSeconds}s Seek Overlay
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Show rewind {preferences.artworkSeekSeconds}s and forward{" "}
                  {preferences.artworkSeekSeconds}s buttons beside play/pause when hovering the Now Playing cover.
                </p>
              </div>
              <ThemeSwitch
                checked={preferences.artworkSeekButtons}
                onChange={(val) => onUpdatePreferences({ artworkSeekButtons: val })}
                label="Toggle Artwork Seek Buttons"
              />
            </div>

            <div
              className={`space-y-2 rounded-xl border border-white/8 bg-[#0b0b0b] p-4 transition-opacity ${
                preferences.artworkSeekButtons ? "opacity-100" : "opacity-45"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Seek Jump Interval</span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                  {preferences.artworkSeekSeconds}s
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={30}
                step={5}
                disabled={!preferences.artworkSeekButtons}
                value={preferences.artworkSeekSeconds}
                onChange={(e) =>
                  onUpdatePreferences({ artworkSeekSeconds: Number(e.target.value) })
                }
                style={{ accentColor: "var(--cadence-accent)" }}
                aria-label="Seek jump interval seconds"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 disabled:cursor-not-allowed"
              />
              <div className="flex justify-between text-[11px] tabular-nums text-zinc-500">
                <span>5s</span>
                <span>10s</span>
                <span>15s</span>
                <span>20s</span>
                <span>25s</span>
                <span>30s</span>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Pause When Voice Channel is Empty
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Automatically pause playback when everyone leaves the voice channel and resume when someone joins.
                </p>
              </div>
              <ThemeSwitch
                checked={effectivePauseOnEmpty}
                onChange={handleEmptyVcToggle}
                label="Toggle Pause When Voice Channel is Empty"
              />
            </div>

            <div
              className={`space-y-2 rounded-xl border border-white/8 bg-[#0b0b0b] p-4 transition-opacity ${
                effectivePauseOnEmpty ? "opacity-100" : "opacity-45"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">
                  Continue Playing When Voice Channel is Empty
                </span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                  {formatEmptyVcDelay(effectivePauseOnEmptySeconds)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={300}
                step={5}
                disabled={!effectivePauseOnEmpty}
                value={effectivePauseOnEmptySeconds}
                onChange={(e) => handleEmptyVcSecondsChange(Number(e.target.value))}
                style={{ accentColor: "var(--cadence-accent)" }}
                aria-label="How long song continues to play when voice channel is empty"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 disabled:cursor-not-allowed"
              />
              <div className="flex justify-between text-[11px] tabular-nums text-zinc-500">
                <span>0s</span>
                <span>1m</span>
                <span>2m</span>
                <span>3m</span>
                <span>4m</span>
                <span>5m</span>
              </div>
              <p className="text-xs text-zinc-500">
                {effectivePauseOnEmptySeconds === 0
                  ? "Playback pauses immediately when the voice channel becomes empty and automatically resumes when someone joins."
                  : `Song continues to play for ${formatEmptyVcDelay(effectivePauseOnEmptySeconds)} when the voice channel is empty before pausing, and automatically resumes when someone joins.`}
              </p>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div>
              <h2 className="text-base font-semibold text-white">Default Search Provider (Personal)</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Applies per user across both the web dashboard search bar and Discord /play queries when Auto is active.
              </p>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {SEARCH_PROVIDER_OPTIONS.map((opt) => {
                const selected = preferences.defaultSearchSource === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdatePreferences({ defaultSearchSource: opt.id })}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? "border-white bg-white/10"
                        : "border-white/10 bg-[#0b0b0b] hover:border-white/25 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span
                      style={
                        selected
                          ? {
                              borderColor: "var(--cadence-accent)",
                              backgroundColor: "var(--cadence-accent)",
                            }
                          : undefined
                      }
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "" : "border-zinc-500"
                      }`}
                    >
                      {selected && (
                        <span
                          style={{ backgroundColor: "var(--cadence-accent-fg)" }}
                          className="h-1.5 w-1.5 rounded-full"
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{opt.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">Lyrics Auto-Scroll</h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Smoothly keep synced lyrics centered during playback (pauses temporarily while you scroll manually).
                </p>
              </div>
              <ThemeSwitch
                checked={preferences.lyricsAutoScroll}
                onChange={(val) => onUpdatePreferences({ lyricsAutoScroll: val })}
                label="Toggle Lyrics Auto-Scroll"
              />
            </div>
          </section>
        </div>
      )}

      {/* SERVER TAB */}
      {tab === "server" && canAccessServerSettings && (
        <>
          {!guildId ? (
            <div className="rounded-2xl border border-white/10 bg-[#121212] p-8 text-center text-sm text-zinc-400">
              Select a Discord server from the top right first.
            </div>
          ) : (
            <form
              onSubmit={handleServerSubmit}
              className="space-y-6 rounded-2xl border border-white/10 bg-[#121212] p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">{guildName}</h2>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Applied immediately across Discord slash/text commands and all web listeners.
                  </p>
                </div>
                <button
                  type="submit"
                  style={{
                    backgroundColor: "var(--cadence-accent)",
                    color: "var(--cadence-accent-fg)",
                  }}
                  className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold shadow-sm transition hover:brightness-110"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Changes
                </button>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Text Command Prefix
                </span>
                <input
                  type="text"
                  maxLength={5}
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="w-full max-w-xs rounded-xl border border-white/12 bg-[#0b0b0b] px-3.5 py-2.5 text-sm text-white outline-none focus:border-white/40"
                />
                <p className="text-xs text-zinc-500">
                  Used for message commands like {prefix || "?"}play and {prefix || "?"}playnext.
                </p>
              </label>

              <div className="space-y-2 rounded-xl border border-white/8 bg-[#0b0b0b] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Default Starting Volume</span>
                  <span className="text-sm font-semibold tabular-nums text-white">
                    {defaultVolume}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={defaultVolume}
                  onChange={(e) => setDefaultVolume(Number(e.target.value))}
                  style={{ accentColor: "var(--cadence-accent)" }}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20"
                />
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0b0b0b] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">24/7 Mode</p>
                    <p className="text-xs text-zinc-400">
                      Keep Cadence in voice channel without auto-disconnecting when idle.
                    </p>
                  </div>
                  <ThemeSwitch
                    checked={stay247}
                    onChange={setStay247}
                    label="Toggle 24/7 Mode"
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0b0b0b] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">Default Autoplay</p>
                    <p className="text-xs text-zinc-400">
                      Automatically queue similar tracks when the queue finishes.
                    </p>
                  </div>
                  <ThemeSwitch
                    checked={autoplay}
                    onChange={setAutoplay}
                    label="Toggle Default Autoplay"
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0b0b0b] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">Allow Duplicate Tracks</p>
                    <p className="text-xs text-zinc-400">
                      Allow adding a song that is already playing or queued.
                    </p>
                  </div>
                  <ThemeSwitch
                    checked={allowDuplicates}
                    onChange={setAllowDuplicates}
                    label="Toggle Allow Duplicate Tracks"
                  />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0b0b0b] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">Default to Play Next</p>
                    <p className="text-xs text-zinc-400">
                      Queue new Discord `/play` tracks right after the current song instead of at the end.
                    </p>
                  </div>
                  <ThemeSwitch
                    checked={defaultPlayNext}
                    onChange={setDefaultPlayNext}
                    label="Toggle Default to Play Next"
                  />
                </div>

                <div className="space-y-4 rounded-xl border border-white/8 bg-[#0b0b0b] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">
                        Pause When Voice Channel is Empty
                      </p>
                      <p className="text-xs text-zinc-400">
                        Pause playback when the voice channel is empty and automatically resume when someone joins.
                      </p>
                    </div>
                    <ThemeSwitch
                      checked={pauseOnEmpty}
                      onChange={setPauseOnEmpty}
                      label="Toggle Server Pause When Voice Channel is Empty"
                    />
                  </div>

                  <div
                    className={`space-y-2 border-t border-white/8 pt-3 transition-opacity ${
                      pauseOnEmpty ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-200">
                        Continue Playing When Voice Channel is Empty
                      </span>
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                        {formatEmptyVcDelay(pauseOnEmptySeconds)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={300}
                      step={5}
                      disabled={!pauseOnEmpty}
                      value={pauseOnEmptySeconds}
                      onChange={(e) => setPauseOnEmptySeconds(Number(e.target.value))}
                      style={{ accentColor: "var(--cadence-accent)" }}
                      aria-label="Server empty voice channel play duration"
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 disabled:cursor-not-allowed"
                    />
                    <div className="flex justify-between text-[11px] tabular-nums text-zinc-500">
                      <span>0s</span>
                      <span>1m</span>
                      <span>2m</span>
                      <span>3m</span>
                      <span>4m</span>
                      <span>5m</span>
                    </div>
                  </div>

                  <div
                    className={`space-y-2 border-t border-white/8 pt-3 transition-opacity ${
                      pauseOnEmpty && !stay247 ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium text-zinc-200">
                          Auto-Disconnect After Extended Auto-Pause
                        </span>
                        <p className="text-[11px] text-zinc-500">
                          {stay247
                            ? "Disabled while 24/7 Mode is enabled."
                            : "Leave voice channel if nobody joins after playback auto-pauses."}
                        </p>
                      </div>
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                        {stay247 ? "Off (24/7)" : formatEmptyVcDisconnect(emptyVcDisconnectMinutes)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={120}
                      step={5}
                      disabled={!pauseOnEmpty || stay247}
                      value={emptyVcDisconnectMinutes}
                      onChange={(e) => setEmptyVcDisconnectMinutes(Number(e.target.value))}
                      style={{ accentColor: "var(--cadence-accent)" }}
                      aria-label="Auto-disconnect after extended auto-pause"
                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/20 disabled:cursor-not-allowed"
                    />
                    <div className="flex justify-between text-[11px] tabular-nums text-zinc-500">
                      <span>Never</span>
                      <span>30m</span>
                      <span>1h</span>
                      <span>1.5h</span>
                      <span>2h</span>
                    </div>
                  </div>

                  <div
                    className={`flex items-center justify-between border-t border-white/8 pt-3 transition-opacity ${
                      pauseOnEmpty ? "opacity-100" : "opacity-45"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-medium text-zinc-200">
                        Ignore Deafened Listeners
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Treat self-deafened or server-deafened members as not listening when checking if voice chat is empty.
                      </p>
                    </div>
                    <ThemeSwitch
                      checked={ignoreDeafenedListeners}
                      onChange={setIgnoreDeafenedListeners}
                      label="Toggle Ignore Deafened Listeners"
                    />
                  </div>
                </div>
              </div>

              {/* Discord Role-Based Access Tiers */}
              <div className="space-y-4 rounded-xl border border-white/8 bg-[#0b0b0b] p-4">
                <div className="flex items-center gap-2 border-b border-white/8 pb-3">
                  <Users className="h-4 w-4 text-zinc-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Discord Role-Based Access Tiers</p>
                    <p className="text-xs text-zinc-400">
                      Permissions cascade upward: User → DJ → Admin → Server / Bot Owner.
                    </p>
                  </div>
                </div>

                {/* Tier 1: Basic User Access */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                        Tier 1 · User (Basic Access)
                      </p>
                      <p className="text-xs text-zinc-400">
                        {accessRoleIds.length === 0
                          ? "Everyone in this server can search, play, and manage personal playlists."
                          : `Restricted to ${accessRoleIds.length} selected role${accessRoleIds.length === 1 ? "" : "s"} (plus DJ, Admin, and Owner tiers).`}
                      </p>
                    </div>
                    {accessRoleIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAccessRoleIds([])}
                        className="rounded-full border border-white/12 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      >
                        Allow Everyone
                      </button>
                    )}
                  </div>

                  {settings?.roles && settings.roles.length > 0 ? (
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pt-1">
                      {settings.roles.map((role) => {
                        const selected = accessRoleIds.includes(role.id);
                        return (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => toggleAccessRole(role.id)}
                            style={
                              selected
                                ? {
                                    backgroundColor: "var(--cadence-accent)",
                                    color: "var(--cadence-accent-fg)",
                                    borderColor: "transparent",
                                  }
                                : undefined
                            }
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                              selected
                                ? ""
                                : "border-white/12 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-white"
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                            @{role.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      No assignable Discord roles found for this server.
                    </p>
                  )}
                </div>

                {/* Tier 2: DJ Role */}
                <div className="space-y-2 border-t border-white/8 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                        Tier 2 · DJ (Playback &amp; Queue Controls)
                      </p>
                      <p className="text-xs text-zinc-400">
                        {djRoleId
                          ? "Members with this role can manage volume, loop, shuffle, filters, and queue order."
                          : "None selected - Admins or listeners alone in voice channel have DJ permissions."}
                      </p>
                    </div>
                    {djRoleId && (
                      <button
                        type="button"
                        onClick={() => setDjRoleId("")}
                        className="rounded-full border border-white/12 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      >
                        Clear DJ Role
                      </button>
                    )}
                  </div>

                  {settings?.roles && settings.roles.length > 0 ? (
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pt-1">
                      {settings.roles.map((role) => {
                        const selected = djRoleId === role.id;
                        return (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => setDjRoleId(selected ? "" : role.id)}
                            style={
                              selected
                                ? {
                                    backgroundColor: "var(--cadence-accent)",
                                    color: "var(--cadence-accent-fg)",
                                    borderColor: "transparent",
                                  }
                                : undefined
                            }
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                              selected
                                ? ""
                                : "border-white/12 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-white"
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                            @{role.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      No assignable Discord roles found for this server.
                    </p>
                  )}
                </div>

                {/* Tier 3: Admin Roles */}
                <div className="space-y-2 border-t border-white/8 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                        Tier 3 · Admin (Server Settings Access)
                      </p>
                      <p className="text-xs text-zinc-400">
                        {adminRoleIds.length === 0
                          ? "Discord Administrators & Manage Server roles automatically have Server Settings access."
                          : `${adminRoleIds.length} custom Admin role${adminRoleIds.length === 1 ? "" : "s"} selected (in addition to Manage Server / Administrator).`}
                      </p>
                    </div>
                    {adminRoleIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAdminRoleIds([])}
                        className="rounded-full border border-white/12 px-3 py-1 text-[11px] font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
                      >
                        Clear Custom Admins
                      </button>
                    )}
                  </div>

                  {settings?.roles && settings.roles.length > 0 && (
                    <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pt-1">
                      {settings.roles.map((role) => {
                        const selected = adminRoleIds.includes(role.id);
                        return (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => toggleAdminRole(role.id)}
                            style={
                              selected
                                ? {
                                    backgroundColor: "var(--cadence-accent)",
                                    color: "var(--cadence-accent-fg)",
                                    borderColor: "transparent",
                                  }
                                : undefined
                            }
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                              selected
                                ? ""
                                : "border-white/12 bg-white/[0.04] text-zinc-300 hover:border-white/25 hover:text-white"
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                            @{role.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tier 4: Owners */}
                <div className="border-t border-white/8 pt-3 text-xs text-zinc-400">
                  <span className="font-semibold uppercase tracking-wider text-zinc-300">
                    Tier 4 · Server Owner &amp; Bot Owner
                  </span>{" "}
                  - Full access to all playback controls, Server Settings, and System diagnostics &amp; debug logs.
                </div>
              </div>
            </form>
          )}
        </>
      )}

      {/* SYSTEM & DEBUG TAB */}
      {tab === "system" && canAccessSystemSettings && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div>
              <h2 className="text-base font-semibold text-white">System &amp; Dependencies</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Inspect runtime versions, Lavalink plugins, package dependencies, and server debug logs.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={sysLoading}
                onClick={() => void loadSystemLogs()}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-45"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sysLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                disabled={!sysInfo && !sysText}
                onClick={async () => {
                  const bundle = [
                    `# Cadence Debug Report`,
                    sysInfo ? JSON.stringify(sysInfo, null, 2) : "",
                    "",
                    sysText || "(no logs captured yet)",
                  ]
                    .filter(Boolean)
                    .join("\n");
                  try {
                    await navigator.clipboard.writeText(bundle);
                    setCopiedLogs(true);
                    setTimeout(() => setCopiedLogs(false), 2000);
                  } catch {
                    // Ignore clipboard permission denials
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-45"
              >
                {copiedLogs ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Debug Report
                  </>
                )}
              </button>
              <a
                href="/api/system/logs?download=1"
                download
                style={{
                  backgroundColor: "var(--cadence-accent)",
                  color: "var(--cadence-accent-fg)",
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm transition hover:brightness-110"
              >
                <Download className="h-3.5 w-3.5" />
                Download .txt
              </a>
            </div>
          </div>

          {sysError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
              {sysError}
            </div>
          )}

          {sysLoading && !sysInfo ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#121212] p-10 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-white" />
              Loading system diagnostics...
            </div>
          ) : (
            sysInfo && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121212] p-5">
                    <h3 className="text-sm font-semibold text-white">Runtime</h3>
                    <dl className="grid grid-cols-2 gap-y-2 text-xs">
                      <dt className="text-zinc-400">Cadence</dt>
                      <dd className="text-right font-mono text-white">v{sysInfo.appVersion}</dd>
                      <dt className="text-zinc-400">Runtime</dt>
                      <dd className="text-right font-mono text-white">
                        {sysInfo.runtime.name} v{sysInfo.runtime.version}
                      </dd>
                      <dt className="text-zinc-400">Platform</dt>
                      <dd className="text-right font-mono text-zinc-200">
                        {sysInfo.runtime.platform}/{sysInfo.runtime.arch}
                      </dd>
                      <dt className="text-zinc-400">Uptime</dt>
                      <dd className="text-right font-mono text-zinc-200">
                        {Math.floor(sysInfo.runtime.uptimeSeconds / 3600)}h{" "}
                        {Math.floor((sysInfo.runtime.uptimeSeconds % 3600) / 60)}m{" "}
                        {sysInfo.runtime.uptimeSeconds % 60}s
                      </dd>
                      <dt className="text-zinc-400">Memory RSS</dt>
                      <dd className="text-right font-mono text-zinc-200">
                        {sysInfo.runtime.memoryRssMb} MB
                      </dd>
                    </dl>
                  </section>

                  <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121212] p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">Audio Engine (Lavalink)</h3>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          sysInfo.lavalink.connected
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-rose-500/15 text-rose-300"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            sysInfo.lavalink.connected ? "bg-emerald-400" : "bg-rose-400"
                          }`}
                        />
                        {sysInfo.lavalink.connected ? "Online" : "Offline"}
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-y-2 text-xs">
                      <dt className="text-zinc-400">Lavalink</dt>
                      <dd className="text-right font-mono text-white">
                        {sysInfo.lavalink.version || "-"}
                      </dd>
                      <dt className="text-zinc-400">Lavaplayer</dt>
                      <dd className="text-right font-mono text-zinc-200">
                        {sysInfo.lavalink.lavaplayer || "-"}
                      </dd>
                      <dt className="text-zinc-400">JVM</dt>
                      <dd className="text-right font-mono text-zinc-200">
                        {sysInfo.lavalink.jvm || "-"}
                      </dd>
                    </dl>
                    {sysInfo.lavalink.plugins.length > 0 && (
                      <div className="border-t border-white/8 pt-2.5">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                          Lavalink Plugins
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {sysInfo.lavalink.plugins.map((p) => (
                            <span
                              key={p.name}
                              className="rounded-md border border-white/10 bg-[#0b0b0b] px-2 py-0.5 font-mono text-[11px] text-zinc-200"
                            >
                              {p.name} {p.version}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </section>
                </div>

                <section className="space-y-4 rounded-2xl border border-white/10 bg-[#121212] p-5">
                  <h3 className="text-sm font-semibold text-white">Package Dependencies</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Dependencies
                      </p>
                      <div className="divide-y divide-white/[0.06] rounded-xl border border-white/8 bg-[#0b0b0b] px-3">
                        {Object.entries(sysInfo.dependencies).map(([name, ver]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between py-2 text-xs"
                          >
                            <span className="font-mono text-zinc-200">{name}</span>
                            <span className="font-mono text-zinc-400">{ver}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                        Dev &amp; Build Toolchain
                      </p>
                      <div className="divide-y divide-white/[0.06] rounded-xl border border-white/8 bg-[#0b0b0b] px-3">
                        {Object.entries(sysInfo.devDependencies).map(([name, ver]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between py-2 text-xs"
                          >
                            <span className="font-mono text-zinc-200">{name}</span>
                            <span className="font-mono text-zinc-400">{ver}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl border border-white/10 bg-[#121212] p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">
                      Recent Server Logs ({sysLogs.length} / {sysInfo.logCount} buffered)
                    </h3>
                    <span className="text-[11px] text-zinc-500">Secrets redacted automatically</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-[#080808] p-3 font-mono text-[11px] leading-relaxed">
                    {sysLogs.length === 0 ? (
                      <p className="text-zinc-500">No log lines captured yet.</p>
                    ) : (
                      sysLogs.map((entry, idx) => (
                        <div key={`${entry.ts}-${idx}`} className="flex gap-2 border-b border-white/[0.03] py-0.5 last:border-b-0">
                          <span className="shrink-0 text-zinc-600">
                            {new Date(entry.ts).toISOString().slice(11, 19)}
                          </span>
                          <span
                            className={`w-12 shrink-0 uppercase ${
                              entry.level === "error"
                                ? "text-rose-400"
                                : entry.level === "warn"
                                  ? "text-amber-300"
                                  : "text-zinc-400"
                            }`}
                          >
                            [{entry.level}]
                          </span>
                          <span className="min-w-0 whitespace-pre-wrap break-words text-zinc-200">
                            {entry.message}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
