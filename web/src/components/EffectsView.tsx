import { RotateCcw, Sliders } from "lucide-react";
import type { FilterPreset, PlayerStateDTO } from "@shared/types";

interface Props {
  playerState: PlayerStateDTO | null;
  onSetFilter: (preset: FilterPreset) => void;
}

const PRESETS: { id: FilterPreset; name: string; description: string }[] = [
  { id: "none", name: "Clean / Off", description: "Disable all DSP audio filters." },
  { id: "bassboost", name: "Bass Boost", description: "Punchier low-end equalizer curve." },
  { id: "nightcore", name: "Nightcore", description: "Faster tempo and higher pitch." },
  { id: "vaporwave", name: "Vaporwave", description: "Slowed-down, pitched-down aesthetic." },
  { id: "8d", name: "8D Audio", description: "Smooth stereo panning rotation." },
  { id: "karaoke", name: "Karaoke", description: "Attenuates center vocal frequencies." },
  { id: "lowpass", name: "Low Pass", description: "Warm muffled underwater tone." },
  { id: "tremolo", name: "Tremolo", description: "Rhythmic volume oscillation." },
  { id: "vibrato", name: "Vibrato", description: "Subtle pitch modulation wave." },
];

export function EffectsView({ playerState, onSetFilter }: Props) {
  const active = playerState?.activeFilter ?? "none";
  const disabled = !playerState?.connected || !playerState?.isPrivileged;

  return (
    <section className="rounded-2xl border border-white/8 bg-[#111116] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Audio Effects</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Real-time Lavalink DSP filters applied directly to the voice stream.
          </p>
        </div>

        <button
          type="button"
          disabled={disabled || active === "none"}
          onClick={() => onSetFilter("none")}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset All
        </button>
      </div>

      {!playerState?.connected && (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-xs text-zinc-400">
          Start playing a song in a voice channel to enable live audio filters.
        </div>
      )}

      {playerState?.connected && !playerState.isPrivileged && (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
          Requires Manage Server, the DJ role, or being alone in the voice channel.
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRESETS.map((preset) => {
          const isActive = active === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onSetFilter(isActive && preset.id !== "none" ? "none" : preset.id)}
              className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                isActive
                  ? "border-violet-500/50 bg-violet-600/20 ring-1 ring-violet-500/30"
                  : "border-white/8 bg-[#14141b] hover:border-white/15 hover:bg-[#191922]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-white">{preset.name}</span>
                {isActive && (
                  <span className="rounded-full bg-violet-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-400">{preset.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
