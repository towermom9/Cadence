import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { GripVertical, Pin, Play, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import type {
  DailyRecommendationsDTO,
  EnqueueMode,
  HistoryEntryDTO,
  PinnedTrackDTO,
  PlaylistDTO,
  SearchSource,
  TrackDTO,
  UserProfileDTO,
} from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import { ArtistLinks } from "./ArtistLinks";
import type { TrackMenuContext } from "./ContextMenu";
import { PlaylistArtwork } from "./PlaylistArtwork";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  user: UserProfileDTO;
  history: HistoryEntryDTO[];
  pinnedTracks: PinnedTrackDTO[];
  playlists: PlaylistDTO[];
  defaultSearchSource: SearchSource;
  onMoodSearch: (query: string, source?: SearchSource) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onTogglePinTrack: (track: TrackDTO) => void;
  onReorderPinnedTracks: (trackIds: string[]) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onPlayPlaylist: (playlistId: string) => void;
  onViewHistory: () => void;
  onClearHistory: () => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
  onPlaylistContextMenu: (e: MouseEvent, playlist: PlaylistDTO) => void;
}

const MOOD_CHIPS = [
  "Energize",
  "Relax",
  "Focus",
  "Workout",
  "Party",
  "Commute",
  "Sad",
  "Lo-Fi",
  "Jazz",
  "Indie",
];

const QUICK_PICKS: { title: string; subtitle: string; query: string; gradient: string }[] = [
  {
    title: "Lo-Fi Beats",
    subtitle: "Chill study & coding mix",
    query: "lofi hip hop beats chill",
    gradient: "from-indigo-700/60 to-zinc-900",
  },
  {
    title: "Late Night Synth",
    subtitle: "Synthwave & electronic vibes",
    query: "synthwave night drive mix",
    gradient: "from-rose-700/60 to-zinc-900",
  },
  {
    title: "Workout Energy",
    subtitle: "High tempo motivation",
    query: "workout electronic hits",
    gradient: "from-amber-700/60 to-zinc-900",
  },
  {
    title: "Acoustic Coffeehouse",
    subtitle: "Warm indie & acoustic",
    query: "acoustic indie coffee shop",
    gradient: "from-emerald-700/60 to-zinc-900",
  },
  {
    title: "Classical Focus",
    subtitle: "Piano & orchestral calm",
    query: "classical piano focus study",
    gradient: "from-violet-700/60 to-zinc-900",
  },
];

export function HomeView({
  user,
  history,
  pinnedTracks,
  playlists,
  defaultSearchSource,
  onMoodSearch,
  onEnqueue,
  onTogglePinTrack,
  onReorderPinnedTracks,
  onSelectPlaylist,
  onPlayPlaylist,
  onViewHistory,
  onClearHistory,
  onOpenArtist,
  onTrackContextMenu,
  onPlaylistContextMenu,
}: Props) {
  const [recs, setRecs] = useState<DailyRecommendationsDTO | null>(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [dragPinnedId, setDragPinnedId] = useState<string | null>(null);
  const [dragOverPinnedId, setDragOverPinnedId] = useState<string | null>(null);
  const justDraggedRef = useRef(false);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    };
  }, []);

  const handlePinnedDrop = useCallback(
    (targetTrackId: string) => {
      if (!dragPinnedId || dragPinnedId === targetTrackId) {
        setDragPinnedId(null);
        setDragOverPinnedId(null);
        return;
      }
      const ids = pinnedTracks.map((p) => p.track.identifier);
      const fromIdx = ids.indexOf(dragPinnedId);
      const toIdx = ids.indexOf(targetTrackId);
      setDragPinnedId(null);
      setDragOverPinnedId(null);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

      const reordered = [...ids];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);

      justDraggedRef.current = true;
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
      dragTimerRef.current = setTimeout(() => {
        justDraggedRef.current = false;
      }, 150);
      onReorderPinnedTracks(reordered);
    },
    [dragPinnedId, onReorderPinnedTracks, pinnedTracks]
  );

  const hasSeedSource = history.length > 0 || pinnedTracks.length > 0;

  const fetchRecommendations = useCallback(async (forceRefresh = false) => {
    setRecsLoading(true);
    try {
      const res = await fetch(
        forceRefresh ? "/api/recommendations?refresh=1" : "/api/recommendations"
      );
      if (res.ok) {
        const data = (await res.json()) as DailyRecommendationsDTO;
        setRecs(data);
      }
    } catch {
      // Ignore transient recommendations fetch failure
    } finally {
      setRecsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSeedSource) {
      setRecs(null);
      return;
    }
    if (!recs && !recsLoading) {
      void fetchRecommendations(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSeedSource]);

  const listenAgainItems = useMemo(() => {
    const items: { track: TrackDTO; isPinned: boolean }[] = [];
    const seen = new Set<string>();
    for (const pinned of pinnedTracks) {
      if (!seen.has(pinned.track.identifier)) {
        seen.add(pinned.track.identifier);
        items.push({ track: pinned.track, isPinned: true });
      }
    }
    for (const entry of history) {
      if (!seen.has(entry.track.identifier)) {
        seen.add(entry.track.identifier);
        items.push({ track: entry.track, isPinned: false });
      }
    }
    return items;
  }, [history, pinnedTracks]);

  return (
    <div className="space-y-9">
      {/* Mood / Activity Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {MOOD_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onMoodSearch(`${chip} music`, defaultSearchSource)}
            className="shrink-0 rounded-lg border border-white/10 bg-white/[0.08] px-3.5 py-1.5 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.16]"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Listen Again */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.username}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-white">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {user.globalName || user.username}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-white">Listen again</h2>
            </div>
          </div>

          {history.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onViewHistory}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                View more
              </button>
              <button
                type="button"
                onClick={onClearHistory}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear history
              </button>
            </div>
          )}
        </div>

        {listenAgainItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {listenAgainItems.slice(0, 10).map(({ track, isPinned }) => {
              const inHistory = history.some((h) => h.track.identifier === track.identifier);
              const isDragging = isPinned && dragPinnedId === track.identifier;
              const isDragTarget =
                isPinned &&
                dragPinnedId !== null &&
                dragOverPinnedId === track.identifier &&
                dragPinnedId !== track.identifier;
              return (
                <div
                  key={track.identifier}
                  draggable={isPinned}
                  onDragStart={(e) => {
                    if (!isPinned) return;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", track.identifier);
                    setDragPinnedId(track.identifier);
                  }}
                  onDragOver={(e) => {
                    if (!isPinned || !dragPinnedId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverPinnedId !== track.identifier) {
                      setDragOverPinnedId(track.identifier);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverPinnedId === track.identifier) {
                      setDragOverPinnedId(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (!isPinned) return;
                    e.preventDefault();
                    handlePinnedDrop(track.identifier);
                  }}
                  onDragEnd={() => {
                    setDragPinnedId(null);
                    setDragOverPinnedId(null);
                  }}
                  onClick={() => {
                    if (justDraggedRef.current) return;
                    onEnqueue([track], "now");
                  }}
                  onContextMenu={(e) => onTrackContextMenu(e, track, { inHistory })}
                  className={`group space-y-2.5 transition ${
                    isPinned ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                  } ${isDragging ? "opacity-40" : ""}`}
                >
                  <div
                    style={
                      isDragTarget ? { boxShadow: "0 0 0 2px var(--cadence-accent)" } : undefined
                    }
                    className="relative aspect-square overflow-hidden rounded-lg bg-[#181818]"
                  >
                    <TrackArtwork
                      track={track}
                      className="h-full w-full transition duration-300 group-hover:scale-105 group-hover:brightness-75"
                      iconClassName="h-12 w-12"
                    />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTogglePinTrack(track);
                      }}
                      title={isPinned ? "Unpin from Listen again" : "Pin to Listen again"}
                      className={`absolute left-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-white shadow transition ${
                        isPinned ? "opacity-100" : "opacity-0 hover:bg-black group-hover:opacity-100"
                      }`}
                    >
                      <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} />
                    </button>

                    {isPinned && (
                      <span
                        title="Drag to reorder pin"
                        className="pointer-events-none absolute bottom-2.5 left-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/75 text-zinc-200 opacity-0 shadow transition group-hover:opacity-100"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEnqueue([track], "end");
                      }}
                      title="Add to queue"
                      className="absolute right-2.5 top-2.5 rounded-full bg-black/75 p-1.5 text-white opacity-0 transition hover:bg-black group-hover:opacity-100"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    <span className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{track.title}</p>
                    <p className="truncate text-xs text-zinc-400">
                      <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
                      <span> • {sourceLabel(track.sourceName)} • {formatMs(track.duration)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {QUICK_PICKS.map((pick) => (
              <button
                key={pick.title}
                type="button"
                onClick={() => onMoodSearch(pick.query, defaultSearchSource)}
                className="group text-left"
              >
                <div
                  className={`relative flex aspect-square items-end overflow-hidden rounded-lg bg-gradient-to-br ${pick.gradient} p-4 ring-1 ring-white/10 transition group-hover:ring-white/25`}
                >
                  <div>
                    <p className="text-base font-bold text-white">{pick.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-300">{pick.subtitle}</p>
                  </div>
                  <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Recommended for today */}
      {hasSeedSource && (recsLoading || (recs && recs.tracks.length > 0)) && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                <Sparkles className="h-3 w-3" style={{ color: "var(--cadence-accent)" }} />
                {recs?.basedOn && recs.basedOn.length > 0
                  ? `Based on ${recs.basedOn.slice(0, 2).join(", ")}`
                  : "Picked from your listening history"}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-white">
                Recommended for today
              </h2>
            </div>

            <button
              type="button"
              disabled={recsLoading}
              onClick={() => void fetchRecommendations(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white disabled:opacity-45"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recsLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {recsLoading && (!recs || recs.tracks.length === 0) ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2.5">
                  <div className="aspect-square animate-pulse rounded-lg bg-white/[0.06]" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.06]" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.04]" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {(recs?.tracks ?? []).slice(0, 10).map((track) => (
                <div
                  key={`rec-${track.identifier}`}
                  onClick={() => onEnqueue([track], "now")}
                  onContextMenu={(e) => onTrackContextMenu(e, track)}
                  className="group cursor-pointer space-y-2.5"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-[#181818]">
                    <TrackArtwork
                      track={track}
                      className="h-full w-full transition duration-300 group-hover:scale-105 group-hover:brightness-75"
                      iconClassName="h-12 w-12"
                    />

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEnqueue([track], "end");
                      }}
                      title="Add to queue"
                      className="absolute right-2.5 top-2.5 rounded-full bg-black/75 p-1.5 text-white opacity-0 transition hover:bg-black group-hover:opacity-100"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    <span className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{track.title}</p>
                    <p className="truncate text-xs text-zinc-400">
                      <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
                      <span> • {sourceLabel(track.sourceName)} • {formatMs(track.duration)}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Your Playlists */}
      {playlists.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-white">Your playlists</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => onSelectPlaylist(pl.id)}
                onContextMenu={(e) => onPlaylistContextMenu(e, pl)}
                className="group cursor-pointer space-y-2.5"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-[#181818] ring-1 ring-white/10">
                  <PlaylistArtwork playlist={pl} className="h-full w-full transition duration-300 group-hover:brightness-75" />
                  {pl.sourceUrl && (
                    <span
                      title="Synced online playlist"
                      className="absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-zinc-200 shadow"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </span>
                  )}
                  {pl.isPinned && !pl.isLiked && (
                    <span
                      title="Pinned playlist"
                      className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/75 text-white shadow"
                    >
                      <Pin className="h-3 w-3 fill-current" />
                    </span>
                  )}
                  {pl.tracks.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayPlaylist(pl.id);
                      }}
                      title="Play playlist"
                      className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white opacity-0 shadow-lg transition hover:scale-105 group-hover:opacity-100"
                    >
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    </button>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{pl.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-zinc-400">
                    {pl.isLiked ? (
                      <>
                        <Pin className="h-3 w-3 shrink-0 fill-current text-zinc-400" />
                        <span>
                          Auto playlist • {pl.tracks.length}{" "}
                          {pl.tracks.length === 1 ? "track" : "tracks"}
                        </span>
                      </>
                    ) : pl.isPinned ? (
                      <>
                        <Pin className="h-3 w-3 shrink-0 fill-current text-zinc-400" />
                        <span>
                          Pinned • {pl.tracks.length}{" "}
                          {pl.tracks.length === 1 ? "track" : "tracks"}
                        </span>
                      </>
                    ) : (
                      <span>
                        {pl.tracks.length} {pl.tracks.length === 1 ? "track" : "tracks"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
