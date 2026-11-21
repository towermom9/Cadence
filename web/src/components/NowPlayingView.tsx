import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ListPlus,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Users,
  Volume2,
  X,
} from "lucide-react";
import type {
  EnqueueMode,
  FilterPreset,
  LyricsDTO,
  PlayerStateDTO,
  PlaylistDTO,
  TrackDTO,
} from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import type { TrackMenuContext } from "./ContextMenu";
import { TrackArtwork } from "./TrackArtwork";

export type NowPlayingTab = "upnext" | "lyrics" | "effects";

interface Props {
  playerState: PlayerStateDTO | null;
  displayPosition: number;
  lyricsState: {
    guildId: string;
    lyrics: LyricsDTO | null;
    loading: boolean;
  };
  lyricsSubjectTrack: TrackDTO | null;
  playlists: PlaylistDTO[];
  activeTab: NowPlayingTab;
  playSourceLabel: string;
  onTabChange: (tab: NowPlayingTab) => void;
  onPlayTrack: (index: number) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onMoveTrack: (from: number, to: number) => void;
  onRemoveTrack: (index: number) => void;
  onShuffle: () => void;
  onClear: () => void;
  onToggleAutoplay: (enabled: boolean) => void;
  onStop: () => void;
  onFetchLyrics: (title?: string, artist?: string, duration?: number) => void;
  onSetFilter: (preset: FilterPreset) => void;
  onAddTracksToPlaylist: (playlistId: string, tracks: TrackDTO[]) => void;
  onCreatePlaylistWithTracks: (name: string, tracks: TrackDTO[]) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
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

interface SyncedLine {
  timeMs: number;
  text: string;
}

function parseSyncedLyrics(raw: string | null | undefined): SyncedLine[] {
  if (!raw) return [];
  const lines: SyncedLine[] = [];
  const pattern = /^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/;
  for (const rawLine of raw.split(/\r?\n/)) {
    const match = rawLine.match(pattern);
    if (!match) continue;
    const min = Number(match[1]);
    const sec = Number(match[2]);
    const frac = match[3] ? Number(match[3].padEnd(3, "0")) : 0;
    const text = match[4]?.trim() || "♪";
    lines.push({ timeMs: min * 60_000 + sec * 1000 + frac, text });
  }
  return lines;
}

export function NowPlayingView({
  playerState,
  displayPosition,
  lyricsState,
  lyricsSubjectTrack,
  playlists,
  activeTab,
  playSourceLabel,
  onTabChange,
  onPlayTrack,
  onEnqueue,
  onMoveTrack,
  onRemoveTrack,
  onShuffle,
  onClear,
  onToggleAutoplay,
  onStop,
  onFetchLyrics,
  onSetFilter,
  onAddTracksToPlaylist,
  onCreatePlaylistWithTracks,
  onTrackContextMenu,
}: Props) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const saveRef = useRef<HTMLDivElement>(null);

  const current = playerState?.current ?? null;
  const queue = playerState?.queue ?? [];
  const previousTracks = (playerState?.previous ?? []).slice(0, 5).reverse();
  const privileged = Boolean(playerState?.isPrivileged);
  const activeFilter = playerState?.activeFilter ?? "none";

  const activeLyricsTrack = lyricsSubjectTrack ?? current;
  const parsedSynced = useMemo(
    () => parseSyncedLyrics(lyricsState.lyrics?.syncedLyrics),
    [lyricsState.lyrics?.syncedLyrics]
  );

  const activeSyncedIndex = useMemo(() => {
    if (
      parsedSynced.length === 0 ||
      !current ||
      !activeLyricsTrack ||
      current.identifier !== activeLyricsTrack.identifier
    ) {
      return -1;
    }
    let idx = -1;
    for (let i = 0; i < parsedSynced.length; i++) {
      if (parsedSynced[i].timeMs <= displayPosition + 250) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [activeLyricsTrack, current, displayPosition, parsedSynced]);

  useEffect(() => {
    if (activeTab === "lyrics" && !lyricsSubjectTrack && current) {
      onFetchLyrics(current.title, current.author, current.duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, current?.identifier, lyricsSubjectTrack?.identifier]);

  useEffect(() => {
    if (!saveOpen) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (saveRef.current && !saveRef.current.contains(e.target as Node)) {
        setSaveOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [saveOpen]);

  const tracksToSave: TrackDTO[] = useMemo(() => {
    const items: TrackDTO[] = [];
    if (current && !current.isStream) items.push(current);
    for (const track of queue) {
      if (!track.isStream) items.push(track);
    }
    return items;
  }, [current, queue]);

  const handleCreateAndSave = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed || tracksToSave.length === 0) return;
    onCreatePlaylistWithTracks(trimmed, tracksToSave);
    setNewPlaylistName("");
    setSaveOpen(false);
  };

  return (
    <div className="mx-auto grid h-full min-h-0 w-full max-w-7xl gap-6 lg:grid-cols-12 lg:gap-10">
      {/* Left Artwork Column */}
      <div className="flex min-h-0 flex-col items-center justify-center lg:col-span-7">
        <div className="flex w-full max-w-[440px] flex-col items-center">
          {(playerState?.voiceChannelName || activeFilter !== "none" || (playerState?.connected && privileged)) && (
            <div className="mb-4 flex w-full flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
              <div className="flex flex-wrap items-center gap-2">
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
            </div>
          )}

          <div
            onContextMenu={(e) => {
              if (!current) return;
              onTrackContextMenu(e, current, { isCurrent: true });
            }}
            className="aspect-square w-full overflow-hidden rounded-xl bg-[#181818] shadow-2xl ring-1 ring-white/10"
          >
            <TrackArtwork
              track={current}
              className="h-full w-full"
              iconClassName="h-20 w-20"
            />
          </div>

          <div className="mt-4 w-full text-center lg:hidden">
            {current ? (
              <>
                <h2 className="truncate text-lg font-bold text-white">{current.title}</h2>
                <p className="mt-0.5 truncate text-xs text-zinc-400">
                  {current.author} • {sourceLabel(current.sourceName)}
                </p>
              </>
            ) : (
              <p className="text-sm text-zinc-400">Pick a track to start playing in Discord.</p>
            )}
          </div>
        </div>
      </div>

      {/* Right Queue / Lyrics / Effects Column */}
      <div className="flex min-h-0 flex-col lg:col-span-5">
        <div className="flex shrink-0 items-center border-b border-white/10">
          {(
            [
              { id: "upnext", label: "Up next" },
              { id: "lyrics", label: "Lyrics" },
              { id: "effects", label: "Effects" },
            ] as const
          ).map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
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

        {/* UP NEXT */}
        {activeTab === "upnext" && (
          <div className="flex min-h-0 flex-1 flex-col pt-3">
            {/* Playing from header + white + Save pill */}
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-zinc-400">Playing from</p>
                <p className="truncate text-sm font-semibold text-white">
                  {playSourceLabel || playerState?.guildName || "Queue"}
                </p>
              </div>

              <div ref={saveRef} className="relative shrink-0">
                <button
                  type="button"
                  disabled={tracksToSave.length === 0}
                  onClick={() => setSaveOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
                >
                  <ListPlus className="h-3.5 w-3.5" />
                  Save
                </button>

                {saveOpen && (
                  <div className="absolute right-0 top-10 z-30 w-60 rounded-xl border border-white/12 bg-[#212121] p-2 shadow-2xl">
                    <p className="px-2 py-1 text-[11px] font-medium text-zinc-400">
                      Save {tracksToSave.length} {tracksToSave.length === 1 ? "track" : "tracks"} to playlist
                    </p>

                    <div className="mt-1 max-h-44 space-y-0.5 overflow-y-auto">
                      {playlists.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-zinc-500">No playlists yet.</p>
                      ) : (
                        playlists.map((pl) => (
                          <button
                            key={pl.id}
                            type="button"
                            onClick={() => {
                              onAddTracksToPlaylist(pl.id, tracksToSave);
                              setSaveOpen(false);
                            }}
                            className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 transition hover:bg-white/10"
                          >
                            <span className="truncate">{pl.name}</span>
                            <span className="text-[10px] text-zinc-500">{pl.tracks.length}</span>
                          </button>
                        ))
                      )}
                    </div>

                    <form
                      onSubmit={handleCreateAndSave}
                      className="mt-2 flex items-center gap-1 border-t border-white/10 pt-2"
                    >
                      <input
                        type="text"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="New playlist name..."
                        className="min-w-0 flex-1 rounded-lg bg-[#161616] px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:ring-1 focus:ring-white/30"
                      />
                      <button
                        type="submit"
                        disabled={!newPlaylistName.trim()}
                        title="Create playlist"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-black transition hover:bg-zinc-200 disabled:opacity-40"
                      >
                        {newPlaylistName.trim() ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>

            {/* Autoplay + Shuffle + Clear strip */}
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={!playerState}
                onClick={() => onToggleAutoplay(!playerState?.autoplay)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-40 ${
                  playerState?.autoplay
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-white/[0.06] text-zinc-300 hover:bg-white/12"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Autoplay {playerState?.autoplay ? "On" : "Off"}
              </button>

              {queue.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!privileged || queue.length < 2}
                    onClick={onShuffle}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:bg-white/12 disabled:opacity-40"
                  >
                    <Shuffle className="h-3 w-3" />
                    Shuffle
                  </button>
                  <button
                    type="button"
                    disabled={!privileged}
                    onClick={onClear}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Scrollable Queue Rows */}
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
              {!current && queue.length === 0 && previousTracks.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                  Nothing in the queue yet. Search or click a song to play.
                </div>
              ) : (
                <>
                  {/* Recent previous tracks (like YTM Up Next scrollback) */}
                  {previousTracks.map((track, idx) => (
                    <div
                      key={`prev-${track.identifier}-${idx}`}
                      onClick={() => onEnqueue([track], "now")}
                      onContextMenu={(e) => onTrackContextMenu(e, track)}
                      className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 opacity-65 transition hover:bg-white/[0.06] hover:opacity-100"
                    >
                      <TrackArtwork
                        track={track}
                        className="h-10 w-10 shrink-0 rounded"
                        iconClassName="h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-200">{track.title}</p>
                        <p className="truncate text-xs text-zinc-400">{track.author}</p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-400 group-hover:hidden">
                        {track.isStream ? "LIVE" : formatMs(track.duration)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTrackContextMenu(e, track);
                        }}
                        title="More options"
                        className="hidden rounded-full p-1 text-zinc-300 hover:bg-white/10 hover:text-white group-hover:inline-flex"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  {/* Currently playing highlighted row */}
                  {current && (
                    <div
                      onContextMenu={(e) => onTrackContextMenu(e, current, { isCurrent: true })}
                      className="group flex items-center gap-3 rounded-lg bg-white/[0.10] px-2.5 py-2"
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
                        <TrackArtwork
                          track={current}
                          className="h-10 w-10"
                          iconClassName="h-4 w-4"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                          <Volume2 className="h-4 w-4 text-white" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{current.title}</p>
                        <p className="truncate text-xs text-zinc-300">{current.author}</p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-300 group-hover:hidden">
                        {current.isStream ? "LIVE" : formatMs(current.duration)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTrackContextMenu(e, current, { isCurrent: true });
                        }}
                        title="More options"
                        className="hidden rounded-full p-1 text-zinc-200 hover:bg-white/10 hover:text-white group-hover:inline-flex"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Upcoming queued tracks */}
                  {queue.map((track, idx) => (
                    <div
                      key={`q-${track.identifier}-${idx}`}
                      onClick={() => onPlayTrack(idx)}
                      onContextMenu={(e) => onTrackContextMenu(e, track, { queueIndex: idx })}
                      className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-white/[0.06]"
                    >
                      <TrackArtwork
                        track={track}
                        className="h-10 w-10 shrink-0 rounded"
                        iconClassName="h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">{track.title}</p>
                        <p className="truncate text-xs text-zinc-400">{track.author}</p>
                      </div>

                      <span className="shrink-0 text-xs tabular-nums text-zinc-400 group-hover:hidden">
                        {track.isStream ? "LIVE" : formatMs(track.duration)}
                      </span>

                      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        {privileged && (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveTrack(idx, idx - 1);
                              }}
                              title="Move up"
                              className="rounded-full p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === queue.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveTrack(idx, idx + 1);
                              }}
                              title="Move down"
                              className="rounded-full p-1 text-zinc-400 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveTrack(idx);
                              }}
                              title="Remove from queue"
                              className="rounded-full p-1 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTrackContextMenu(e, track, { queueIndex: idx });
                          }}
                          title="More options"
                          className="rounded-full p-1 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* LYRICS */}
        {activeTab === "lyrics" && (
          <div className="min-h-0 flex-1 overflow-y-auto pt-4">
            {!activeLyricsTrack ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                Play a track to load lyrics.
              </div>
            ) : lyricsState.loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                Searching lyrics for &ldquo;{activeLyricsTrack.title}&rdquo;...
              </div>
            ) : parsedSynced.length > 0 ? (
              <div className="space-y-4 pb-6">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="truncate">
                    {activeLyricsTrack.title} • {lyricsState.lyrics?.source}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onFetchLyrics(
                        activeLyricsTrack.title,
                        activeLyricsTrack.author,
                        activeLyricsTrack.duration
                      )
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1 text-zinc-200 hover:bg-white/12"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>
                <div className="space-y-2.5">
                  {parsedSynced.map((line, i) => (
                    <p
                      key={`${line.timeMs}-${i}`}
                      className={`text-base leading-relaxed transition ${
                        i === activeSyncedIndex
                          ? "font-semibold text-white"
                          : "text-zinc-500"
                      }`}
                    >
                      {line.text}
                    </p>
                  ))}
                </div>
              </div>
            ) : lyricsState.lyrics?.plainLyrics ? (
              <div className="space-y-4 pb-6">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="truncate">
                    {activeLyricsTrack.title} • {lyricsState.lyrics.source}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onFetchLyrics(
                        activeLyricsTrack.title,
                        activeLyricsTrack.author,
                        activeLyricsTrack.duration
                      )
                    }
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1 text-zinc-200 hover:bg-white/12"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-base leading-8 text-zinc-200">
                  {lyricsState.lyrics.plainLyrics}
                </pre>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
                No lyrics found for &ldquo;{activeLyricsTrack.title}&rdquo;.
              </div>
            )}
          </div>
        )}

        {/* EFFECTS */}
        {activeTab === "effects" && (
          <div className="min-h-0 flex-1 overflow-y-auto pt-4">
            <div className="space-y-4 pb-6">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-zinc-400">
                  {!playerState?.connected
                    ? "Play audio in a voice channel to apply DSP filters."
                    : !privileged
                      ? "Requires Manage Server, DJ role, or being alone in voice."
                      : "Select a Lavalink audio filter."}
                </p>
                <button
                  type="button"
                  disabled={!playerState?.connected || !privileged || activeFilter === "none"}
                  onClick={() => onSetFilter("none")}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/12 disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
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
          </div>
        )}
      </div>
    </div>
  );
}
