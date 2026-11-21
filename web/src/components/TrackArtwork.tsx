import { useEffect, useMemo, useState } from "react";
import { Disc3 } from "lucide-react";
import type { TrackDTO } from "@shared/types";

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const YTIMG_PATH_REGEX = /^\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//i;
const PROXY_PREFERRED_HOSTS = new Set([
  "yt3.googleusercontent.com",
  "yt3.ggpht.com",
  "lh3.googleusercontent.com",
  "lh3.ggpht.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
]);

type ArtworkTrackInput = Pick<TrackDTO, "artworkUrl" | "identifier" | "sourceName" | "uri"> & {
  title?: string;
};

export function buildArtworkCandidates(track: ArtworkTrackInput | null | undefined): string[] {
  if (!track) return [];

  const candidates: string[] = [];
  const raw = track.artworkUrl?.trim() || "";

  let ytIdFromUrl: string | null = null;
  let isGoogleUserContent = false;
  let isYtImg = false;

  if (raw) {
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      isGoogleUserContent = PROXY_PREFERRED_HOSTS.has(host);
      isYtImg = host === "i.ytimg.com" || host === "i9.ytimg.com" || host === "img.youtube.com";
      if (isYtImg) {
        const match = parsed.pathname.match(YTIMG_PATH_REGEX);
        if (match) ytIdFromUrl = match[1];
      }
    } catch {
      // Ignore malformed raw URL
    }
  }

  const looksLikeYouTube =
    Boolean(ytIdFromUrl) ||
    (YOUTUBE_ID_REGEX.test(track.identifier || "") &&
      (track.sourceName === "youtube" ||
        Boolean(track.uri?.includes("youtube")) ||
        Boolean(track.uri?.includes("youtu.be")) ||
        raw.includes("googleusercontent.com") ||
        raw.includes("ggpht.com") ||
        isYtImg));

  const ytId =
    ytIdFromUrl || (YOUTUBE_ID_REGEX.test(track.identifier || "") ? track.identifier : null);

  if (raw) {
    if (isGoogleUserContent) {
      const hiRes = raw
        .replace(/=w\d+-h\d+[^/?#]*$/i, "=w1000-h1000-l90-rj")
        .replace(/=s\d+(-[^/?#]*)?$/i, "=s1000$1");
      candidates.push(`/api/artwork?url=${encodeURIComponent(hiRes)}`, hiRes);
      if (hiRes !== raw) {
        candidates.push(`/api/artwork?url=${encodeURIComponent(raw)}`, raw);
      }
    } else if (!isYtImg) {
      candidates.push(raw, `/api/artwork?url=${encodeURIComponent(raw)}`);
    }
  }

  if (looksLikeYouTube && ytId) {
    const qualities = ["maxresdefault.jpg", "sddefault.jpg", "hqdefault.jpg", "mqdefault.jpg"];
    for (const q of qualities) {
      const url = `https://i.ytimg.com/vi/${ytId}/${q}`;
      candidates.push(url, `/api/artwork?url=${encodeURIComponent(url)}`);
    }
  }

  if (raw) {
    candidates.push(raw, `/api/artwork?url=${encodeURIComponent(raw)}`);
  }

  return Array.from(new Set(candidates));
}

function isLetterboxedYtFallback(src: string | undefined): boolean {
  if (!src) return false;
  return /\/(?:sddefault|hqdefault)\.jpg/i.test(decodeURIComponent(src));
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
      <div className={`flex items-center justify-center bg-[#181818] text-zinc-600 ${className}`}>
        <Disc3 className={iconClassName} />
      </div>
    );
  }

  const cropBars = isLetterboxedYtFallback(src);

  return (
    <div className={`overflow-hidden bg-[#181818] ${className}`}>
      <img
        src={src}
        alt={alt ?? track.title ?? "Artwork"}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={(e) => {
          const img = e.currentTarget;
          const decoded = decodeURIComponent(src);
          if (
            /\/(?:maxresdefault|sddefault)\.(?:jpg|webp)/i.test(decoded) &&
            img.naturalWidth <= 120 &&
            img.naturalHeight <= 90
          ) {
            setCandidateIdx((i) => i + 1);
          }
        }}
        onError={() => setCandidateIdx((i) => i + 1)}
        className={`h-full w-full object-cover ${cropBars ? "scale-[1.35]" : ""}`}
      />
    </div>
  );
}
