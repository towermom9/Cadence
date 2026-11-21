import { useEffect, useState, type FormEvent } from "react";
import { Save, Settings } from "lucide-react";
import type { GuildSettingsDTO } from "@shared/types";

interface Props {
  guildId: string | null;
  guildName: string;
  canManage: boolean;
  settings: GuildSettingsDTO | null;
  onLoadSettings: (guildId: string) => void;
  onSaveSettings: (patch: Partial<Omit<GuildSettingsDTO, "guildId" | "roles">>) => void;
}

export function SettingsView({
  guildId,
  guildName,
  canManage,
  settings,
  onLoadSettings,
  onSaveSettings,
}: Props) {
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
    setDefaultVolume(settings.defaultVolume);
    setDjRoleId(settings.djRoleId ?? "");
    setStay247(settings.stay247);
    setAutoplay(settings.autoplay);
    setAllowDuplicates(settings.allowDuplicates);
  }, [settings]);

  if (!guildId) {
    return (
      <div className="rounded-2xl border border-white/8 bg-[#111116] p-8 text-center text-sm text-zinc-400">
        Select a server first.
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6 text-sm text-amber-200">
        You need the <strong>Manage Server</strong> permission on {guildName} to edit server settings.
      </div>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      prefix: prefix.trim() || "?",
      defaultVolume,
      djRoleId: djRoleId || null,
      stay247,
      autoplay,
      allowDuplicates,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-white/8 bg-[#111116] p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Server Settings — {guildName}</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Stored in SQLite and applied immediately across both Discord commands and the dashboard.
          </p>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
        >
          <Save className="h-4 w-4" />
          Save Changes
        </button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium text-zinc-200">Text Command Prefix</span>
          <input
            type="text"
            maxLength={5}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#09090b] px-3.5 py-2 text-sm text-white outline-none focus:border-violet-500"
          />
          <p className="text-xs text-zinc-500">Used for message commands like {prefix || "?"}play.</p>
        </label>

        <label className="space-y-1.5">
          <span className="text-sm font-medium text-zinc-200">DJ Role</span>
          <select
            value={djRoleId}
            onChange={(e) => setDjRoleId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#09090b] px-3.5 py-2 text-sm text-white outline-none focus:border-violet-500"
          >
            <option value="">None (Admins or alone in voice)</option>
            {settings?.roles?.map((role) => (
              <option key={role.id} value={role.id}>
                @{role.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-zinc-500">Members with this role can manage volume, filters, and queue order.</p>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-200">Default Starting Volume</span>
          <span className="text-sm font-semibold tabular-nums text-violet-300">
            {defaultVolume}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={150}
          value={defaultVolume}
          onChange={(e) => setDefaultVolume(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-violet-500"
        />
      </div>

      <div className="space-y-3 pt-2">
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/8 bg-[#14141b] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">24/7 Mode</p>
            <p className="text-xs text-zinc-400">Keep Cadence in voice channel without auto-disconnecting when idle.</p>
          </div>
          <input
            type="checkbox"
            checked={stay247}
            onChange={(e) => setStay247(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/8 bg-[#14141b] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Default Autoplay</p>
            <p className="text-xs text-zinc-400">Automatically queue similar tracks when the queue finishes.</p>
          </div>
          <input
            type="checkbox"
            checked={autoplay}
            onChange={(e) => setAutoplay(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/8 bg-[#14141b] px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Allow Duplicate Tracks</p>
            <p className="text-xs text-zinc-400">Allow adding a song that is already playing or queued.</p>
          </div>
          <input
            type="checkbox"
            checked={allowDuplicates}
            onChange={(e) => setAllowDuplicates(e.target.checked)}
            className="h-4 w-4 accent-violet-500"
          />
        </label>
      </div>
    </form>
  );
}
