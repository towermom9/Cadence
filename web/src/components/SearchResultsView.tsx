import type { MouseEvent } from "react";
import { ListPlus, Loader2, MoreVertical, Play, Plus, RefreshCw, SkipForward } from "lucide-react";
import type { EnqueueMode, SearchSource, TrackDTO } from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import { ArtistLinks } from "./ArtistLinks";
import type { TrackMenuContext } from "./ContextMenu";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  searching: boolean;
  searchResults: {
    query: string;
    source: SearchSource;
    tracks: TrackDTO[];
    playlistName: string | null;
  } | null;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onImportPlaylist: (url: string, name?: string) => void;
  onOpenSaveModal: (tracks: TrackDTO[]) => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
}

export function SearchResultsView({
  searching,
  searchResults,
  onEnqueue,
  onImportPlaylist,
  onOpenSaveModal,
  onOpenArtist,
  onTrackContextMenu,
}: Props) {
  if (searching) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-sm text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
        <span>Searching audio sources...</span>
      </div>
    );
  }

  if (!searchResults) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#121212] p-10 text-center text-sm text-zinc-400">
        Type in the search bar above to find tracks, artists, or paste a YouTube / Spotify / SoundCloud link.
      </div>
    );
  }

  if (searchResults.tracks.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#121212] p-10 text-center">
        <p className="text-base font-medium text-white">
          No results for &ldquo;{searchResults.query}&rdquo;
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Try another search term or switch the source filter inside the search bar.
        </p>
      </div>
    );
  }

  const topResult = searchResults.tracks[0];
  const songs = searchResults.tracks.slice(0, 25);
  const resultLabel = searchResults.playlistName || searchResults.query;
  const playlistQueueName = searchResults.playlistName ?? undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            {searchResults.playlistName ? "Playlist" : "Search results"}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {resultLabel}
          </h2>
        </div>

        {searchResults.tracks.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {searchResults.playlistName && /^https?:\/\/\S+$/i.test(searchResults.query.trim()) && (
              <button
                type="button"
                onClick={() =>
                  onImportPlaylist(searchResults.query.trim(), searchResults.playlistName || undefined)
                }
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
              >
                <RefreshCw className="h-4 w-4" />
                Save &amp; Sync
              </button>
            )}
            <button
              type="button"
              onClick={() => onEnqueue(searchResults.tracks, "end", playlistQueueName)}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              <ListPlus className="h-4 w-4" />
              Queue all ({searchResults.tracks.length})
            </button>
          </div>
        )}
      </div>

      {/* Top Result */}
      {!searchResults.playlistName && topResult && (
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-white">Top result</h3>
          <div
            onClick={() => onEnqueue([topResult], "now", playlistQueueName)}
            onContextMenu={(e) => onTrackContextMenu(e, topResult)}
            className="flex cursor-pointer flex-col gap-5 rounded-xl border border-white/10 bg-gradient-to-br from-[#242424] to-[#121212] p-5 transition hover:border-white/20 sm:flex-row sm:items-center"
          >
            <TrackArtwork
              track={topResult}
              className="h-28 w-28 shrink-0 rounded-lg shadow-xl"
              iconClassName="h-10 w-10"
            />

            <div className="min-w-0 flex-1 space-y-1.5">
              <h4 className="truncate text-xl font-bold text-white">{topResult.title}</h4>
              <p className="truncate text-sm text-zinc-300">
                <ArtistLinks author={topResult.author} onOpenArtist={onOpenArtist} />
                <span>
                  {" "}• {sourceLabel(topResult.sourceName)} •{" "}
                  {topResult.isStream ? "LIVE" : formatMs(topResult.duration)}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnqueue([topResult], "now", playlistQueueName);
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Play
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEnqueue([topResult], "end", playlistQueueName);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  <Plus className="h-4 w-4" />
                  Add to queue
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrackContextMenu(e, topResult);
                  }}
                  title="More options"
                  className="rounded-full p-2 text-zinc-300 transition hover:bg-white/12 hover:text-white"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Songs List */}
      <section className="space-y-3">
        <h3 className="text-lg font-bold text-white">Songs</h3>
        <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#121212]">
          {songs.map((track, idx) => (
            <div
              key={`${track.identifier}-${idx}`}
              onClick={() => onEnqueue([track], "now", playlistQueueName)}
              onContextMenu={(e) => onTrackContextMenu(e, track)}
              className="relative flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]"
            >
              <TrackArtwork
                track={track}
                className="h-11 w-11 shrink-0 rounded"
                iconClassName="h-5 w-5"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{track.title}</p>
                <p className="truncate text-xs text-zinc-400">
                  <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
                  <span>
                    {" "}• {sourceLabel(track.sourceName)} •{" "}
                    {track.isStream ? "LIVE" : formatMs(track.duration)}
                  </span>
                </p>
              </div>

              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1"
              >
                <button
                  type="button"
                  onClick={() => onEnqueue([track], "now", playlistQueueName)}
                  title="Play now"
                  className="rounded-full p-2 text-zinc-200 transition hover:bg-white/12 hover:text-white"
                >
                  <Play className="h-4 w-4 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={() => onEnqueue([track], "next", playlistQueueName)}
                  title="Play next"
                  className="rounded-full p-2 text-zinc-400 transition hover:bg-white/12 hover:text-white"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onEnqueue([track], "end", playlistQueueName)}
                  title="Add to queue"
                  className="rounded-full p-2 text-zinc-400 transition hover:bg-white/12 hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSaveModal([track])}
                  title="Save to playlist"
                  className="rounded-full p-2 text-zinc-400 transition hover:bg-white/12 hover:text-white"
                >
                  <ListPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => onTrackContextMenu(e, track)}
                  title="More options"
                  className="rounded-full p-2 text-zinc-400 transition hover:bg-white/12 hover:text-white"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
