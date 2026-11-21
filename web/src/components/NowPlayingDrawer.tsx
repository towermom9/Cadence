import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Disc3,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { FilterPreset, LyricsDTO, PlayerStateDTO } from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";

type DrawerTab = "upnext" | "lyrics" | "effects";

interface Props {
  open: boolean;
  playerState: PlayerStateDTO | null;
  lyricsState: {
    guildId: string;
    lyrics: LyricsDTO | null;
    loading: boolean;
  };
  onClose: () => void;
  onPlayTrack: (index: number) => void;
  onMoveTrack: (from: number, to: number) => void;
  onRemoveTrack: (index: number) => void;
  onShuffle: () => void;
  onClear: () => void;
  onToggleAutoplay: (enabled: boolean) => void;
  onStop: () => void;
  onFetchLyrics: (title?: string, artist?: string, duration?: number) => void;
  onSetFilter: (preset: FilterPreset) => void;
}

const FILTER_PRESETS: { id: FilterPreset; name: string; description: string }[] = [
  { id: "none", name: "Clean / Off", description: "Disable all DSP audio filters." },
  { id: "bassboost", name: "Bass Boost", description: "Punchier low-end equalizer curve." },
  { id: "nightcore", name: "Nightcore", description: "Faster tempo and higher pitch." },
  { id: "vaporwave", name: "Vaporwave", description: "Slowed-down, pitched-down vibe." },
  { id: "8d", name: "8D Audio", description: "Smooth stereo panning rotation." },
  { id: "karaoke", name: "Karaoke", description: "Attenuates center vocal frequencies." },
  { id: "lowpass", name: "Low Pass", description: "Warm muffled underwater tone." },
  { id: "tremolo", name: "Tremolo", description: "Rhythmic volume oscillation." },
  { id: "vibrato", name: "Vibrato", description: "Subtle pitch modulation wave." },
];

export function NowPlayingDrawer({
  open,
  playerState,
  lyricsState,
  onClose,
  onPlayTrack,
  onMoveTrack,
  onRemoveTrack,
  onShuffle,
  onClear,
  onToggleAutoplay,
  onStop,
  onFetchLyrics,
  onSetFilter,
}: Props) {
  const [tab, setTab] = useState<DrawerTab>("upnext");
  const current = playerState?.current ?? null;
  const queue = playerState?.queue ?? [];
  const privileged = Boolean(playerState?.isPrivileged);
  const activeFilter = playerState?.activeFilter ?? "none";

  useEffect(() => {
    if (open && tab === "lyrics" && current) {
      onFetchLyrics(current.title, current.author, current.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, current?.identifier]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-[76px] top-0 z-30 flex flex-col bg-[#030303]/98 backdrop-blur-2xl">
      {/* Subtle top bar inside drawer */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          {playerState?.voiceChannelName && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-zinc-200">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              #{playerState.voiceChannelName} ({playerState.listeners.length})
            </span>
          )}
          {activeFilter !== "none" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-zinc-200">
              <Sliders className="h-3 w-3" />
              {activeFilter}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {playerState?.connected && privileged && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-zinc-300 transition hover:border-rose-500/40 hover:bg-rose-500/15 hover:text-rose-200"
            >
              <Square className="h-3 w-3 fill-current" />
              Disconnect
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
            aria-label="Close player drawer"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Split YTM Layout: Artwork Left + Tabs Right */}
      <div className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-8 px-6 pb-6 lg:grid-cols-12">
        {/* Left Artwork Pane */}
        <div className="flex flex-col items-center justify-center lg:col-span-5">
          <div className="w-full max-w-sm space-y-4 text-center">
            <div className="aspect-square w-full overflow-hidden rounded-xl bg-[#181818] shadow-2xl ring-1 ring-white/10">
              {current?.artworkUrl ? (
                <img
                  src={current.artworkUrl}
                  alt={current.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-zinc-600">
                  <Disc3 className="h-20 w-20" />
                </div>
              )}
            </div>

            {current ? (
              <div>
                <h2 className="truncate text-xl font-bold text-white">{current.title}</h2>
                <p className="mt-1 truncate text-sm text-zinc-400">
                  {current.author} • {sourceLabel(current.sourceName)}
                </p>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-semibold text-white">No active track</h2>
                <p className="mt-1 text-xs text-zinc-400">
                  Search or pick a song to start playing in Discord.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Tabs Pane: UP NEXT / LYRICS / EFFECTS */}
        <div className="flex min-h-0 flex-col lg:col-span-7">
          <div className="flex items-center border-b border-white/10">
            {(
              [
                { id: "upnext", label: `Up next (${queue.length})` },
                { id: "lyrics", label: "Lyrics" },
                { id: "effects", label: "Effects" },
              ] as const
            ).map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex-1 border-b-2 py-3 text-xs font-semibold uppercase tracking-wider transition ${
                    active
                      ? "border-white text-white"
                      : "border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pt-4">
            {/* UP NEXT */}
            {tab === "upnext" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={!playerState}
                    onClick={() => onToggleAutoplay(!playerState?.autoplay)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                      playerState?.autoplay
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-white/[0.06] text-zinc-300 hover:bg-white/12"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Autoplay: {playerState?.autoplay ? "On" : "Off"}
                  </button>

                  {queue.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!privileged || queue.length < 2}
                        onClick={onShuffle}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/12 disabled:opacity-40"
                      >
                        <Shuffle className="h-3.5 w-3.5" />
                        Shuffle
                      </button>
                      <button
                        type="button"
                        disabled={!privileged}
                        onClick={onClear}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {queue.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                    The queue is empty.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {queue.map((track, idx) => (
                      <div
                        key={`${track.identifier}-${idx}`}
                        className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-white/[0.06]"
                      >
                        {track.artworkUrl ? (
                          <img
                            src={track.artworkUrl}
                            alt={track.title}
                            className="h-10 w-10 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                            <Disc3 className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{track.title}</p>
                          <p className="truncate text-xs text-zinc-400">
                            {track.author} • {track.isStream ? "LIVE" : formatMs(track.duration)}
                          </p>
                        </div>

                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => onPlayTrack(idx)}
                            title="Play now"
                            className="rounded-full p-1.5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                          </button>
                          {privileged && (
                            <>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => onMoveTrack(idx, idx - 1)}
                                title="Move up"
                                className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === queue.length - 1}
                                onClick={() => onMoveTrack(idx, idx + 1)}
                                title="Move down"
                                className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onRemoveTrack(idx)}
                                title="Remove"
                                className="rounded-full p-1.5 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* LYRICS */}
            {tab === "lyrics" && (
              <div className="space-y-4">
                {!current ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                    Play a track to load lyrics.
                  </div>
                ) : lyricsState.loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    Searching lyrics...
                  </div>
                ) : lyricsState.lyrics?.plainLyrics ? (
                  <div className="space-y-4 pb-6">
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span>Source: {lyricsState.lyrics.source}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onFetchLyrics(current.title, current.author, current.duration)
                        }
                        className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1 text-zinc-200 hover:bg-white/12"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Refresh
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-base leading-8 text-zinc-100">
                      {lyricsState.lyrics.plainLyrics}
                    </pre>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                    No lyrics found for &ldquo;{current.title}&rdquo;.
                  </div>
                )}
              </div>
            )}

            {/* EFFECTS */}
            {tab === "effects" && (
              <div className="space-y-4 pb-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    {!playerState?.connected
                      ? "Play audio in a voice channel to apply DSP filters."
                      : !privileged
                        ? "Requires Manage Server, DJ role, or being alone in voice."
                        : "Select a Lavalink filter preset."}
                  </p>
                  <button
                    type="button"
                    disabled={!playerState?.connected || !privileged || activeFilter === "none"}
                    onClick={() => onSetFilter("none")}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/12 disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </button>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {FILTER_PRESETS.map((preset) => {
                    const isActive = activeFilter === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        disabled={!playerState?.connected || !privileged}
                        onClick={() =>
                          onSetFilter(isActive && preset.id !== "none" ? "none" : preset.id)
                        }
                        className={`rounded-xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                          isActive
                            ? "border-white bg-white/15"
                            : "border-white/10 bg-[#181818] hover:border-white/25 hover:bg-[#222222]"
                        }`}
                      >
                        <p className="text-sm font-medium text-white">{preset.name}</p>
                        <p className="mt-1 text-xs text-zinc-400">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
