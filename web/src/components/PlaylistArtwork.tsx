import { Disc3 } from "lucide-react";
import type { PlaylistDTO } from "@shared/types";

interface Props {
  playlist: PlaylistDTO;
  className?: string;
}

export function PlaylistArtwork({ playlist, className = "h-full w-full" }: Props) {
  const covers = Array.from(
    new Set(
      playlist.tracks
        .map((t) => t.artworkUrl)
        .filter((url): url is string => Boolean(url))
    )
  ).slice(0, 4);

  if (covers.length >= 4) {
    return (
      <div className={`grid grid-cols-2 grid-rows-2 overflow-hidden bg-zinc-900 ${className}`}>
        {covers.map((src, idx) => (
          <img key={idx} src={src} alt="" className="h-full w-full object-cover" />
        ))}
      </div>
    );
  }

  if (covers.length > 0) {
    return (
      <img
        src={covers[0]}
        alt={playlist.name}
        className={`object-cover bg-zinc-900 ${className}`}
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
