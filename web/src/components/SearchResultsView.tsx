import { useState } from "react";
import { Disc3, ListPlus, Loader2, Play, Plus, SkipForward } from "lucide-react";
import type { EnqueueMode, PlaylistDTO, SearchSource, TrackDTO } from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";

interface Props {
  searching: boolean;
  searchResults: {
    query: string;
    source: SearchSource;
    tracks: TrackDTO[];
    playlistName: string | null;
  } | null;
  playlists: PlaylistDTO[];
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode) => void;
  onAddToPlaylist: (playlistId: string, track: TrackDTO) => void;
}

export function SearchResultsView({
  searching,
  searchResults,
  playlists,
  onEnqueue,
  onAddToPlaylist,
}: Props) {
  const [menuKey, setMenuKey] = useState<string | null>(null);

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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            {searchResults.playlistName ? "Playlist" : "Search results"}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            {searchResults.playlistName || searchResults.query}
          </h2>
        </div>

        {searchResults.tracks.length > 1 && (
          <button
            type="button"
            onClick={() => onEnqueue(searchResults.tracks, "end")}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            <ListPlus className="h-4 w-4" />
            Queue all ({searchResults.tracks.length})
          </button>
        )}
      </div>

      {/* Top Result */}
      {!searchResults.playlistName && topResult && (
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-white">Top result</h3>
          <div className="flex flex-col gap-5 rounded-xl border border-white/10 bg-gradient-to-br from-[#242424] to-[#121212] p-5 sm:flex-row sm:items-center">
            {topResult.artworkUrl ? (
              <img
                src={topResult.artworkUrl}
                alt={topResult.title}
                className="h-28 w-28 shrink-0 rounded-lg object-cover shadow-xl"
              />
            ) : (
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500">
                <Disc3 className="h-10 w-10" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1.5">
              <h4 className="truncate text-xl font-bold text-white">{topResult.title}</h4>
              <p className="truncate text-sm text-zinc-300">
                {topResult.author} • {sourceLabel(topResult.sourceName)} •{" "}
                {topResult.isStream ? "LIVE" : formatMs(topResult.duration)}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => onEnqueue([topResult], "now")}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Play
                </button>
                <button
                  type="button"
                  onClick={() => onEnqueue([topResult], "end")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  <Plus className="h-4 w-4" />
                  Add to queue
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
          {songs.map((track, idx) => {
            const key = `${track.identifier}-${idx}`;
            const isOpen = menuKey === key;
            return (
              <div
                key={key}
                className="relative flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]"
              >
                {track.artworkUrl ? (
                  <img
                    src={track.artworkUrl}
                    alt={track.title}
                    className="h-11 w-11 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                    <Disc3 className="h-5 w-5" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{track.title}</p>
                  <p className="truncate text-xs text-zinc-400">
                    {track.author} • {sourceLabel(track.sourceName)} •{" "}
                    {track.isStream ? "LIVE" : formatMs(track.duration)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEnqueue([track], "now")}
                    title="Play now"
                    className="rounded-full p-2 text-zinc-200 transition hover:bg-white/12 hover:text-white"
                  >
                    <Play className="h-4 w-4 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnqueue([track], "next")}
                    title="Play next"
                    className="rounded-full p-2 text-zinc-400 transition hover:bg-white/12 hover:text-white"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnqueue([track], "end")}
                    title="Add to queue"
                    className="rounded-full p-2 text-zinc-400 transition hover:bg-white/12 hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  {playlists.length > 0 && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuKey(isOpen ? null : key)}
                        title="Save to playlist"
                        className="rounded-full p-2 text-zinc-400 transition hover:bg-white/12 hover:text-white"
                      >
                        <ListPlus className="h-4 w-4" />
                      </button>
                      {isOpen && (
                        <div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-white/12 bg-[#212121] p-1.5 shadow-2xl">
                          <p className="px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                            Save to playlist
                          </p>
                          {playlists.map((pl) => (
                            <button
                              key={pl.id}
                              type="button"
                              onClick={() => {
                                onAddToPlaylist(pl.id, track);
                                setMenuKey(null);
                              }}
                              className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
                            >
                              <span className="truncate">{pl.name}</span>
                              <span className="text-[10px] text-zinc-500">{pl.tracks.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
