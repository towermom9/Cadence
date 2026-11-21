import type { MouseEvent } from "react";
import { Pin, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import type {
  EnqueueMode,
  HistoryEntryDTO,
  PlaylistDTO,
  SearchSource,
  TrackDTO,
  UserProfileDTO,
} from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import type { TrackMenuContext } from "./ContextMenu";
import { PlaylistArtwork } from "./PlaylistArtwork";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  user: UserProfileDTO;
  history: HistoryEntryDTO[];
  playlists: PlaylistDTO[];
  onMoodSearch: (query: string, source?: SearchSource) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onPlayPlaylist: (playlistId: string) => void;
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
  playlists,
  onMoodSearch,
  onEnqueue,
  onSelectPlaylist,
  onPlayPlaylist,
  onClearHistory,
  onOpenArtist,
  onTrackContextMenu,
  onPlaylistContextMenu,
}: Props) {
  const uniqueHistory: TrackDTO[] = [];
  const seen = new Set<string>();
  for (const entry of history) {
    if (!seen.has(entry.track.identifier)) {
      seen.add(entry.track.identifier);
      uniqueHistory.push(entry.track);
    }
  }

  return (
    <div className="space-y-9">
      {/* Mood / Activity Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {MOOD_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onMoodSearch(`${chip} music`, "ytmsearch")}
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

          {uniqueHistory.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear history
            </button>
          )}
        </div>

        {uniqueHistory.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {uniqueHistory.slice(0, 10).map((track) => (
              <div
                key={track.identifier}
                onClick={() => onEnqueue([track], "now", "Listen again")}
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenArtist(track.author);
                      }}
                      className="hover:text-white hover:underline"
                    >
                      {track.author}
                    </button>
                    <span> • {sourceLabel(track.sourceName)} • {formatMs(track.duration)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {QUICK_PICKS.map((pick) => (
              <button
                key={pick.title}
                type="button"
                onClick={() => onMoodSearch(pick.query, "ytmsearch")}
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
