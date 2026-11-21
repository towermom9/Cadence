import { useEffect } from "react";
import { Loader2, Mic2, RefreshCw } from "lucide-react";
import type { LyricsDTO, PlayerStateDTO } from "@shared/types";

interface Props {
  playerState: PlayerStateDTO | null;
  lyricsState: {
    guildId: string;
    lyrics: LyricsDTO | null;
    loading: boolean;
  };
  onFetchLyrics: (title?: string, artist?: string, duration?: number) => void;
}

export function LyricsView({ playerState, lyricsState, onFetchLyrics }: Props) {
  const current = playerState?.current ?? null;

  useEffect(() => {
    if (current) {
      onFetchLyrics(current.title, current.author, current.duration);
    }
    // Re-fetch when track identifier changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.identifier]);

  return (
    <section className="rounded-2xl border border-white/8 bg-[#111116] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Mic2 className="h-5 w-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Lyrics</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            {current
              ? `${current.title} — ${current.author}`
              : "Play a track to automatically load its lyrics."}
          </p>
        </div>

        {current && (
          <button
            type="button"
            disabled={lyricsState.loading}
            onClick={() => onFetchLyrics(current.title, current.author, current.duration)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${lyricsState.loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      </div>

      <div className="mt-5">
        {!current ? (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
            No active track.
          </div>
        ) : lyricsState.loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
            Searching lyrics...
          </div>
        ) : lyricsState.lyrics?.plainLyrics ? (
          <div className="rounded-xl border border-white/8 bg-[#09090b] p-6">
            <p className="mb-4 text-xs font-medium text-zinc-400">
              Source: {lyricsState.lyrics.source}
            </p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-zinc-200">
              {lyricsState.lyrics.plainLyrics}
            </pre>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">
            No lyrics were found for "{current.title}".
          </div>
        )}
      </div>
    </section>
  );
}
