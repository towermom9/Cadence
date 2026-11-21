import { Compass, Disc3, Flame, Headphones, Music2, Radio, Search } from "lucide-react";
import type { SearchSource } from "@shared/types";

interface Props {
  onSearch: (query: string, source: SearchSource) => void;
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
    sampleQuery: "top global music",
    description: "Official tracks, albums, and clean audio streams.",
    icon: Flame,
  },
  {
    name: "YouTube",
    source: "ytsearch",
    sampleQuery: "live session music",
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
    sampleQuery: "electronic remix",
    description: "Independent artists, underground edits, and long mixes.",
    icon: Headphones,
  },
];

export function ExploreView({ onSearch }: Props) {
  return (
    <div className="space-y-9">
      <section className="space-y-4">
        <div className="flex items-center gap-2.5">
          <Compass className="h-6 w-6 text-white" />
          <h2 className="text-2xl font-bold tracking-tight text-white">Explore</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PLATFORM_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.source}
                type="button"
                onClick={() => onSearch(card.sampleQuery, card.source)}
                className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-[#181818] p-4 text-left transition hover:border-white/25 hover:bg-[#222222]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{card.name}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                    {card.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold tracking-tight text-white">Moods &amp; genres</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <Search className="h-3.5 w-3.5" />
            Click any genre to search
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {GENRE_TILES.map((genre) => (
            <button
              key={genre.label}
              type="button"
              onClick={() => onSearch(genre.query, "ytmsearch")}
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
