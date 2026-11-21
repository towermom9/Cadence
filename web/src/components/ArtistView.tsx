import { useEffect, useState, type MouseEvent } from "react";
import {
  ArrowLeft,
  ListPlus,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Radio,
  Shuffle,
} from "lucide-react";
import type { ArtistProfileDTO, EnqueueMode, TrackDTO } from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import { ArtistLinks } from "./ArtistLinks";
import type { TrackMenuContext } from "./ContextMenu";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  artistName: string;
  onBack: () => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onStartMix: (track: TrackDTO) => void;
  onOpenArtist: (artistName: string) => void;
  onOpenSaveModal: (tracks: TrackDTO[]) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
}

export function ArtistView({
  artistName,
  onBack,
  onEnqueue,
  onStartMix,
  onOpenArtist,
  onOpenSaveModal,
  onTrackContextMenu,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ArtistProfileDTO | null>(null);
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    const clean = artistName.trim();
    if (!clean) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setShowAllSongs(false);
    setFilterQuery("");

    fetch(`/api/artist?name=${encodeURIComponent(clean)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Failed to load artist page.");
        }
        return (await res.json()) as ArtistProfileDTO;
      })
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load artist page.");
        setLoading(false);
      });

    return () => controller.abort();
  }, [artistName]);

  const handleShuffle = () => {
    if (!profile || profile.topSongs.length === 0) return;
    const shuffled = [...profile.topSongs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    onEnqueue(shuffled, "replace", profile.name);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm text-zinc-400">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
          <span>Loading {artistName}...</span>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-medium text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="rounded-xl border border-white/10 bg-[#121212] p-10 text-center text-sm text-zinc-400">
          {error || `Could not load creator page for "${artistName}".`}
        </div>
      </div>
    );
  }

  const heroTrack = profile.topSongs[0] ?? null;
  const trimmedFilter = filterQuery.trim().toLowerCase();
  const filteredSongs = trimmedFilter
    ? profile.topSongs.filter(
        (s) =>
          s.title.toLowerCase().includes(trimmedFilter) ||
          s.author.toLowerCase().includes(trimmedFilter)
      )
    : profile.topSongs;
  const visibleSongs = showAllSongs || trimmedFilter ? filteredSongs : filteredSongs.slice(0, 15);

  return (
    <div className="space-y-8">
      {/* YouTube Music style artist banner */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#121212]">
        {heroTrack && (
          <div className="pointer-events-none absolute inset-0">
            <TrackArtwork
              track={heroTrack}
              className="h-full w-full scale-110 opacity-45 blur-md"
              iconClassName="h-24 w-24"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-[#030303]/70 to-black/30" />
          </div>
        )}

        <div className="relative z-10 flex min-h-64 flex-col justify-between p-6 sm:p-8">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-md transition hover:bg-black/75 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <div className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-5">
              <div className="hidden h-24 w-24 shrink-0 overflow-hidden rounded-full bg-[#181818] shadow-2xl ring-2 ring-white/20 sm:block">
                <TrackArtwork
                  track={heroTrack}
                  className="h-full w-full"
                  iconClassName="h-10 w-10"
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  Artist
                </p>
                <h1 className="mt-1 truncate text-3xl font-bold tracking-tight text-white sm:text-5xl">
                  {profile.name}
                </h1>
                <p className="mt-1.5 text-sm text-zinc-300">
                  {profile.topSongs.length}{" "}
                  {profile.topSongs.length === 1 ? "song" : "songs"} found
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={profile.topSongs.length === 0}
                onClick={handleShuffle}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
              >
                <Shuffle className="h-4 w-4" />
                Shuffle
              </button>

              <button
                type="button"
                disabled={!heroTrack}
                onClick={() => heroTrack && onStartMix(heroTrack)}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
              >
                <Radio className="h-4 w-4" />
                Mix
              </button>

              <button
                type="button"
                disabled={profile.topSongs.length === 0}
                onClick={() => onEnqueue(profile.topSongs, "replace", profile.name)}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-5 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/15 disabled:opacity-40"
              >
                <Play className="h-4 w-4 fill-current" />
                Play all
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Songs Catalog */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight text-white">
            Songs ({profile.topSongs.length})
          </h2>
          {profile.topSongs.length > 6 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter artist songs..."
                className="w-44 rounded-full border border-white/15 bg-[#121212] px-3.5 py-1 text-xs text-white placeholder-zinc-500 outline-none focus:border-white/40 sm:w-56"
              />
              {!trimmedFilter && filteredSongs.length > 15 && (
                <button
                  type="button"
                  onClick={() => setShowAllSongs((v) => !v)}
                  className="rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1 text-xs font-medium text-zinc-200 transition hover:bg-white/12 hover:text-white"
                >
                  {showAllSongs ? "Show less" : `Show all (${filteredSongs.length})`}
                </button>
              )}
            </div>
          )}
        </div>
        {visibleSongs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#121212] p-8 text-center text-sm text-zinc-400">
            No songs found matching &ldquo;{trimmedFilter || profile.name}&rdquo;.
          </div>
        ) : (
          <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#121212]">
            {visibleSongs.map((track, idx) => (
              <div
                key={`artist-top-${track.identifier}-${idx}`}
                onClick={() => onEnqueue([track], "now")}
                onContextMenu={(e) => onTrackContextMenu(e, track)}
                className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]"
              >
                <TrackArtwork
                  track={track}
                  className="h-10 w-10 shrink-0 rounded"
                  iconClassName="h-4 w-4"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{track.title}</p>
                  <p className="truncate text-xs text-zinc-400">
                    <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
                    <span> • {sourceLabel(track.sourceName)}</span>
                  </p>
                </div>
                <span className="hidden text-xs tabular-nums text-zinc-400 sm:inline">
                  {track.isStream ? "LIVE" : formatMs(track.duration)}
                </span>
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-0.5"
                >
                  <button
                    type="button"
                    onClick={() => onEnqueue([track], "now")}
                    title="Play now"
                    className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <Play className="h-4 w-4 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnqueue([track], "end")}
                    title="Add to queue"
                    className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSaveModal([track])}
                    title="Save to playlist"
                    className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  >
                    <ListPlus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => onTrackContextMenu(e, track)}
                    title="More options"
                    className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Related / More Tracks */}
      {profile.relatedTracks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-white">More results</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {profile.relatedTracks.map((track, idx) => (
              <div
                key={`artist-rel-${track.identifier}-${idx}`}
                onClick={() => onEnqueue([track], "now")}
                onContextMenu={(e) => onTrackContextMenu(e, track)}
                className="group cursor-pointer space-y-2"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-[#181818]">
                  <TrackArtwork
                    track={track}
                    className="h-full w-full transition duration-300 group-hover:scale-105 group-hover:brightness-75"
                    iconClassName="h-10 w-10"
                  />
                  <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/80 text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                    <Play className="ml-0.5 h-4 w-4 fill-current" />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{track.title}</p>
                  <p className="truncate text-xs text-zinc-400">
                    <ArtistLinks author={track.author} onOpenArtist={onOpenArtist} />
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
