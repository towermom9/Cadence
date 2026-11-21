import { useState, type FormEvent } from "react";
import {
  Clock,
  ListPlus,
  Loader2,
  Play,
  Plus,
  Search,
  SkipForward,
} from "lucide-react";
import type {
  EnqueueMode,
  HistoryEntryDTO,
  PlaylistDTO,
  SearchSource,
  TrackDTO,
} from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";

interface Props {
  searching: boolean;
  searchResults: {
    query: string;
    source: SearchSource;
    tracks: TrackDTO[];
    playlistName: string | null;
  } | null;
  history: HistoryEntryDTO[];
  playlists: PlaylistDTO[];
  onSearch: (query: string, source: SearchSource) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode) => void;
  onAddToPlaylist: (playlistId: string, track: TrackDTO) => void;
}

const SOURCES: { id: SearchSource; label: string }[] = [
  { id: "auto", label: "Auto / URL" },
  { id: "ytmsearch", label: "YT Music" },
  { id: "ytsearch", label: "YouTube" },
  { id: "spsearch", label: "Spotify" },
  { id: "dzsearch", label: "Deezer" },
  { id: "scsearch", label: "SoundCloud" },
];

export function SearchView({
  searching,
  searchResults,
  history,
  playlists,
  onSearch,
  onEnqueue,
  onAddToPlaylist,
}: Props) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SearchSource>("auto");
  const [playlistMenuTrackId, setPlaylistMenuTrackId] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), source);
    }
  };

  const renderTrackRow = (track: TrackDTO, keyPrefix: string) => {
    const menuKey = `${keyPrefix}:${track.identifier}`;
    const menuOpen = playlistMenuTrackId === menuKey;

    return (
      <div
        key={menuKey}
        className="group relative flex items-center gap-3 rounded-xl border border-white/6 bg-[#14141b] p-2.5 transition hover:border-white/15 hover:bg-[#191922]"
      >
        {track.artworkUrl ? (
          <img
            src={track.artworkUrl}
            alt={track.title}
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs text-zinc-500">
            Audio
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
            className="rounded-lg bg-violet-600/90 p-2 text-white transition hover:bg-violet-500"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
          </button>
          <button
            type="button"
            onClick={() => onEnqueue([track], "next")}
            title="Play next"
            className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-zinc-200 transition hover:bg-white/10"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onEnqueue([track], "end")}
            title="Add to queue"
            className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-zinc-200 transition hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {playlists.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPlaylistMenuTrackId(menuOpen ? null : menuKey)}
                title="Save to playlist"
                className="rounded-lg border border-white/10 bg-white/[0.04] p-2 text-zinc-200 transition hover:bg-white/10"
              >
                <ListPlus className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-white/12 bg-zinc-900 p-1.5 shadow-2xl">
                  <p className="px-2 py-1 text-[11px] font-medium text-zinc-400">
                    Add to playlist
                  </p>
                  {playlists.map((pl) => (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => {
                        onAddToPlaylist(pl.id, track);
                        setPlaylistMenuTrackId(null);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-white/10"
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
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/8 bg-[#111116] p-5">
        <h2 className="text-lg font-semibold text-white">Discover & Play</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Search across YouTube, YouTube Music, Spotify, Deezer, SoundCloud, or paste any direct link/playlist URL.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Song title, artist, Spotify / YouTube / Deezer URL..."
              className="w-full rounded-xl border border-white/10 bg-[#09090b] py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SOURCES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSource(item.id)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                source === item.id
                  ? "bg-violet-600/25 text-violet-200 ring-1 ring-violet-500/40"
                  : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {searchResults && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-white">
                {searchResults.playlistName
                  ? `Playlist: ${searchResults.playlistName}`
                  : `Results for "${searchResults.query}"`}
              </h3>
              <p className="text-xs text-zinc-400">
                {searchResults.tracks.length} tracks found
              </p>
            </div>
            {searchResults.tracks.length > 1 && (
              <button
                type="button"
                onClick={() => onEnqueue(searchResults.tracks, "end")}
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-white/15"
              >
                <ListPlus className="h-4 w-4" />
                Queue All ({searchResults.tracks.length})
              </button>
            )}
          </div>

          {searchResults.tracks.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#111116] p-8 text-center text-sm text-zinc-400">
              No matching tracks were returned by Lavalink.
            </div>
          ) : (
            <div className="grid gap-2">
              {searchResults.tracks.slice(0, 25).map((t, i) => renderTrackRow(t, `search-${i}`))}
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-violet-400" />
          <h3 className="text-base font-semibold text-white">Recently Played</h3>
        </div>
        {history.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-[#111116] p-6 text-sm text-zinc-400">
            Your playback history will appear here after playing songs.
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {history.slice(0, 12).map((entry) => renderTrackRow(entry.track, `hist-${entry.id}`))}
          </div>
        )}
      </section>
    </div>
  );
}
