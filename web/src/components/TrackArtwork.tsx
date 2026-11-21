import { useEffect, useMemo, useState } from "react";
import { Disc3 } from "lucide-react";
import type { TrackDTO } from "@shared/types";

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const PROXY_PREFERRED_HOSTS = new Set(["yt3.googleusercontent.com", "lh3.googleusercontent.com"]);

type ArtworkTrackInput = Pick<TrackDTO, "artworkUrl" | "identifier" | "sourceName" | "uri"> & {
  title?: string;
};

export function buildArtworkCandidates(track: ArtworkTrackInput | null | undefined): string[] {
  if (!track) return [];

  const candidates: string[] = [];
  const raw = track.artworkUrl?.trim() || "";

  if (raw) {
    let isGoogleUserContent = false;
    try {
      const parsed = new URL(raw);
      isGoogleUserContent = PROXY_PREFERRED_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
      isGoogleUserContent = false;
    }

    const proxied = `/api/artwork?url=${encodeURIComponent(raw)}`;
    if (isGoogleUserContent) {
      candidates.push(proxied, raw);
    } else {
      candidates.push(raw, proxied);
    }
  }

  const looksLikeYouTube =
    YOUTUBE_ID_REGEX.test(track.identifier || "") &&
    (track.sourceName === "youtube" ||
      Boolean(track.uri?.includes("youtube")) ||
      Boolean(track.uri?.includes("youtu.be")) ||
      raw.includes("googleusercontent.com"));

  if (looksLikeYouTube) {
    const ytImgUrl = `https://i.ytimg.com/vi/${track.identifier}/hqdefault.jpg`;
    candidates.push(ytImgUrl, `/api/artwork?url=${encodeURIComponent(ytImgUrl)}`);
  }

  return Array.from(new Set(candidates));
}

interface Props {
  track: (ArtworkTrackInput & { title?: string }) | null | undefined;
  alt?: string;
  className?: string;
  iconClassName?: string;
}

export function TrackArtwork({
  track,
  alt,
  className = "h-full w-full",
  iconClassName = "h-1/2 w-1/2",
}: Props) {
  const candidates = useMemo(
    () => buildArtworkCandidates(track),
    [track?.artworkUrl, track?.identifier, track?.sourceName, track?.uri]
  );
  const [candidateIdx, setCandidateIdx] = useState(0);

  useEffect(() => {
    setCandidateIdx(0);
  }, [track?.artworkUrl, track?.identifier]);

  const src = candidates[candidateIdx];

  if (!track || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-[#181818] text-zinc-600 ${className}`}
      >
        <Disc3 className={iconClassName} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? track.title ?? "Artwork"}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setCandidateIdx((i) => i + 1)}
      className={`object-cover bg-[#181818] ${className}`}
    />
  );
}
