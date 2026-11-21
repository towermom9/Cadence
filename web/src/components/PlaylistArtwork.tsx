import { Disc3 } from "lucide-react";
import type { PlaylistDTO, TrackDTO } from "@shared/types";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  playlist: PlaylistDTO;
  className?: string;
}

export function PlaylistArtwork({ playlist, className = "h-full w-full" }: Props) {
  const seen = new Set<string>();
  const sampleTracks: TrackDTO[] = [];

  for (const track of playlist.tracks) {
    const key = track.artworkUrl || track.identifier;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sampleTracks.push(track);
    if (sampleTracks.length >= 4) break;
  }

  if (sampleTracks.length >= 4) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 overflow-hidden bg-zinc-900 ${className}`}>
        {sampleTracks.map((track, idx) => (
          <TrackArtwork
            key={`${track.identifier}-${idx}`}
            track={track}
            alt=""
            className="h-full w-full"
            iconClassName="h-5 w-5"
          />
        ))}
      </div>
    );
  }

  if (sampleTracks.length > 0) {
    return (
      <TrackArtwork
        track={sampleTracks[0]}
        alt={playlist.name}
        className={className}
        iconClassName="h-1/3 w-1/3"
      />
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-zinc-500 ${className}`}
    >
      <Disc3 className="h-1/3 w-1/3" />
    </div>
  );
}
