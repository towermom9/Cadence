import { useCallback, useEffect, useState, type MouseEvent } from "react";
import {
  ArrowRight,
  Check,
  Compass,
  Disc3,
  Flame,
  Headphones,
  ListPlus,
  Loader2,
  MoreVertical,
  Music2,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  SkipForward,
} from "lucide-react";
import type { EnqueueMode, SearchSource, TrackDTO } from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import { loadUiPrefs, saveUiPrefs } from "../utils/theme";
import { ArtistLinks } from "./ArtistLinks";
import type { TrackMenuContext } from "./ContextMenu";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  defaultSearchSource: SearchSource;
  onSearch: (query: string, source: SearchSource) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, queueName?: string) => void;
  onOpenSaveModal: (tracks: TrackDTO[]) => void;
  onOpenArtist: (artistName: string) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
}

const GENRE_TILES: { label: string; query: string; accent: string }[] = [
  { label: "Pop Hits", query: "top pop hits", accent: "border-l-rose-500" },
  { label: "Hip-Hop & Rap", query: "hip hop rap hits", accent: "border-l-amber-500" },
  { label: "Electronic & EDM", query: "electronic dance music", accent: "border-l-cyan-500" },
  { label: "Rock & Alt", query: "alternative rock hits", accent: "border-l-red-500" },
  { label: "R&B & Soul", query: "r&b soul classics", accent: "border-l-purple-500" },
  { label: "J-Pop & Anime", query: "jpop anime openings", accent: "border-l-pink-500" },
  { label: "K-Pop", query: "kpop top tracks", accent: "border-l-fuchsia-500" },
  { label: "Lo-Fi & Chill", query: "lofi chill beats", accent: "border-l-indigo-500" },
  { label: "Jazz & Blues", query: "smooth jazz instrumental", accent: "border-l-emerald-500" },
  { label: "Classical", query: "classical essentials", accent: "border-l-sky-500" },
  { label: "Metal", query: "heavy metal hits", accent: "border-l-zinc-400" },
  { label: "Soundtracks", query: "film game soundtracks", accent: "border-l-orange-500" },
];

const PLATFORM_CARDS: {
  name: string;
  source: SearchSource;
  sampleQuery: string;
  description: string;
  icon: typeof Music2;
}[] = [
  {
    name: "YouTube Music",
    source: "ytmsearch",
    sampleQuery: "top global hits",
    description: "Official tracks, albums, and clean audio streams.",
    icon: Flame,
  },
  {
    name: "YouTube",
    source: "ytsearch",
    sampleQuery: "trending music video",
    description: "Music videos, live sessions, remixes, and DJ mixes.",
    icon: Radio,
  },
  {
    name: "Spotify",
    source: "spsearch",
    sampleQuery: "today top hits",
    description: "Search Spotify catalog or paste any Spotify track/playlist link.",
    icon: Disc3,
  },
  {
    name: "SoundCloud",
    source: "scsearch",
    sampleQuery: "electronic chill remix",
    description: "Independent artists, underground edits, and long mixes.",
    icon: Headphones,
  },
];

export function ExploreView({
  defaultSearchSource,
  onSearch,
  onEnqueue,
  onOpenSaveModal,
  onOpenArtist,
  onTrackContextMenu,
}: Props) {
  const [selectedSource, setSelectedSource] = useState<SearchSource>(() => {
    const saved = loadUiPrefs().searchSource;
    const candidate = saved === "auto" ? defaultSearchSource : saved;
    return PLATFORM_CARDS.some((c) => c.source === candidate) ? candidate : "ytmsearch";
  });
  const [tracksBySource, setTracksBySource] = useState<Record<string, TrackDTO[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCard =
    PLATFORM_CARDS.find((c) => c.source === selectedSource) ?? PLATFORM_CARDS[0];
  const currentTracks = tracksBySource[activeCard.source] ?? [];

  const fetchExploreTracks = useCallback(
    async (source: SearchSource, query: string, forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          source,
          q: query,
          ...(forceRefresh ? { refresh: "1" } : {}),
        });
        const res = await fetch(`/api/explore?${params.toString()}`);
        const data = (await res.json().catch(() => ({}))) as {
          tracks?: TrackDTO[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || `Failed to load ${source} tracks`);
        }
        setTracksBySource((prev) => ({
          ...prev,
          [source]: data.tracks ?? [],
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load featured tracks.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!tracksBySource[activeCard.source]) {
      void fetchExploreTracks(activeCard.source, activeCard.sampleQuery, false);
    }
  }, [activeCard.sampleQuery, activeCard.source, fetchExploreTracks, tracksBySource]);

  const handleSelectPlatform = (card: (typeof PLATFORM_CARDS)[number]) => {
    setSelectedSource(card.source);
    saveUiPrefs({ searchSource: card.source });
    window.dispatchEvent(new CustomEvent("cadence:set-search-source", { detail: card.source }));
    if (!tracksBySource[card.source] || tracksBySource[card.source].length === 0) {
      void fetchExploreTracks(card.source, card.sampleQuery, false);
    }
  };

  return (
    <div className="space-y-9">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Compass className="h-6 w-6 text-white" />
            <h2 className="text-2xl font-bold tracking-tight text-white">Explore</h2>
          </div>
          <span className="text-xs text-zinc-400">
            Active platform: <strong className="text-white">{activeCard.name}</strong>
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLATFORM_CARDS.map((card) => {
            const Icon = card.icon;
            const active = card.source === activeCard.source;
            return (
              <button
                key={card.source}
                type="button"
                onClick={() => handleSelectPlatform(card)}
                style={
                  active
                    ? {
                        borderColor: "var(--cadence-accent)",
                        boxShadow: "0 0 0 1px var(--cadence-accent)",
                      }
                    : undefined
                }
                className={`flex items-start gap-3.5 rounded-xl border p-4 text-left transition ${
                  active
                    ? "bg-[#222222]"
                    : "border-white/10 bg-[#181818] hover:border-white/25 hover:bg-[#222222]"
                }`}
              >
                <div
                  style={
                    active
                      ? {
                          backgroundColor: "var(--cadence-accent)",
                          color: "var(--cadence-accent-fg)",
                        }
                      : undefined
                  }
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                    active ? "" : "bg-white/10 text-white"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{card.name}</p>
                    {active && <Check className="h-4 w-4 shrink-0 text-white" />}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                    {card.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured & Trending Shelf for Selected Platform */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Featured catalog
            </p>
            <h3 className="text-xl font-bold tracking-tight text-white">
              Trending on {activeCard.name}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                void fetchExploreTracks(activeCard.source, activeCard.sampleQuery, true)
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => onSearch(activeCard.sampleQuery, activeCard.source)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/15"
            >
              <span>Open in Search</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {loading && currentTracks.length === 0 ? (
          <div className="flex items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-[#121212] p-10 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
            <span>Loading {activeCard.name} tracks...</span>
          </div>
        ) : error && currentTracks.length === 0 ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-xs text-rose-200">
            {error}
          </div>
        ) : currentTracks.length > 0 ? (
          <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#121212]">
            {currentTracks.map((track, idx) => (
              <div
                key={`${track.identifier}-${idx}`}
                onClick={() => onEnqueue([track], "now", `Trending on ${activeCard.name}`)}
                onContextMenu={(e) => onTrackContextMenu(e, track)}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]"
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
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEnqueue([track], "now", `Trending on ${activeCard.name}`)}
                    title="Play now"
                    className="rounded-full p-2 text-zinc-200 transition hover:bg-white/12 hover:text-white"
                  >
                    <Play className="h-4 w-4 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnqueue([track], "next", `Trending on ${activeCard.name}`)}
                    title="Play next"
                    className="rounded-full p-2 text-zinc-400 transition hover:bg-white/12 hover:text-white"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnqueue([track], "end", `Trending on ${activeCard.name}`)}
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
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold tracking-tight text-white">Moods &amp; genres</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <Search className="h-3.5 w-3.5" />
            Searches on {activeCard.name}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {GENRE_TILES.map((genre) => (
            <button
              key={genre.label}
              type="button"
              onClick={() => onSearch(genre.query, activeCard.source)}
              className={`rounded-lg border border-white/8 border-l-4 ${genre.accent} bg-[#181818] px-4 py-3.5 text-left text-sm font-medium text-white transition hover:bg-[#242424]`}
            >
              {genre.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
