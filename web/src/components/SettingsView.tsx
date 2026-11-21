import { useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Palette,
  Play,
  Save,
  Server,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type {
  AutoplayClickBehavior,
  GuildSettingsDTO,
  UserPreferencesDTO,
} from "@shared/types";
import { BACKGROUND_MODES, THEME_ACCENTS } from "../utils/theme";
import { CadenceBanner, CadenceIcon } from "./CadenceBrand";

interface Props {
  guildId: string | null;
  guildName: string;
  canManage: boolean;
  settings: GuildSettingsDTO | null;
  preferences: UserPreferencesDTO;
  onUpdatePreferences: (patch: Partial<UserPreferencesDTO>) => void;
  onLoadSettings: (guildId: string) => void;
  onSaveSettings: (patch: Partial<Omit<GuildSettingsDTO, "guildId" | "roles">>) => void;
}

type SettingsTab = "appearance" | "playback" | "server";

const AUTOPLAY_CLICK_OPTIONS: {
  id: AutoplayClickBehavior;
  title: string;
  description: string;
}[] = [
  {
    id: "play_now_here",
    title: "Play now — right after current",
    description:
      "Immediately plays the clicked Autoplay song while keeping your queued songs intact.",
  },
  {
    id: "play_now_end",
    title: "Play now — move past queued tracks",
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
  canManage,
  settings,
  preferences,
  onUpdatePreferences,
  onLoadSettings,
  onSaveSettings,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const [prefix, setPrefix] = useState("?");
  const [defaultVolume, setDefaultVolume] = useState(100);
  const [djRoleId, setDjRoleId] = useState<string>("");
  const [stay247, setStay247] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(true);

  useEffect(() => {
    if (guildId && canManage) {
      onLoadSettings(guildId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId, canManage]);

  useEffect(() => {
    if (!settings) return;
    setPrefix(settings.prefix);
    setDefaultVolume(Math.min(100, Math.max(0, settings.defaultVolume)));
    setDjRoleId(settings.djRoleId ?? "");
    setStay247(settings.stay247);
    setAutoplay(settings.autoplay);
    setAllowDuplicates(settings.allowDuplicates);
  }, [settings]);

  const handleServerSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      prefix: prefix.trim() || "?",
      defaultVolume: Math.min(100, Math.max(0, defaultVolume)),
      djRoleId: djRoleId || null,
      stay247,
      autoplay,
      allowDuplicates,
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
          <p className="mt-1 text-xs text-zinc-400">
            Customize theme colors, AMOLED surfaces, playback controls, and server defaults.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(
            [
              { id: "appearance", label: "Appearance", icon: Palette },
              { id: "playback", label: "Playback", icon: Play },
              { id: "server", label: "Server", icon: Server },
            ] as const
          ).map((item) => {
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

          <section className="rounded-2xl border border-white/10 bg-[#121212] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Now Playing Thumbnail ±10s Seek Overlay
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Show rewind 10s and forward 10s buttons beside play/pause when hovering the Now Playing cover.
                </p>
              </div>
              <ThemeSwitch
                checked={preferences.artworkSeekButtons}
                onChange={(val) => onUpdatePreferences({ artworkSeekButtons: val })}
                label="Toggle Artwork 10s Seek Buttons"
              />
            </div>
          </section>
        </div>
      )}

      {/* SERVER TAB */}
      {tab === "server" && (
        <>
          {!guildId ? (
            <div className="rounded-2xl border border-white/10 bg-[#121212] p-8 text-center text-sm text-zinc-400">
              Select a Discord server from the top right first.
            </div>
          ) : !canManage ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-5 text-sm text-amber-200">
              <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
              <span>
                You need the <strong>Manage Server</strong> permission on{" "}
                <strong>{guildName}</strong> to change server-wide bot settings.
              </span>
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

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Text Command Prefix
                  </span>
                  <input
                    type="text"
                    maxLength={5}
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    className="w-full rounded-xl border border-white/12 bg-[#0b0b0b] px-3.5 py-2.5 text-sm text-white outline-none focus:border-white/40"
                  />
                  <p className="text-xs text-zinc-500">
                    Used for message commands like {prefix || "?"}play.
                  </p>
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    DJ Role
                  </span>
                  <select
                    value={djRoleId}
                    onChange={(e) => setDjRoleId(e.target.value)}
                    className="w-full rounded-xl border border-white/12 bg-[#0b0b0b] px-3.5 py-2.5 text-sm text-white outline-none focus:border-white/40 [&>option]:bg-[#121212]"
                  >
                    <option value="">None (Admins or alone in voice)</option>
                    {settings?.roles?.map((role) => (
                      <option key={role.id} value={role.id}>
                        @{role.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-zinc-500">
                    Members with this role can manage volume, filters, and queue order.
                  </p>
                </label>
              </div>

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
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
