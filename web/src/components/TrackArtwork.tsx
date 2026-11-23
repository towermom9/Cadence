import { useEffect, useMemo, useState } from "react";
import { Disc3 } from "lucide-react";
import type { TrackDTO } from "@shared/types";

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;
const YTIMG_PATH_REGEX = /^\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\//i;
const YT_URI_ID_REGEX =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;
const PROXY_PREFERRED_HOSTS = new Set([
  "yt3.googleusercontent.com",
  "yt3.ggpht.com",
  "lh3.googleusercontent.com",
  "lh3.ggpht.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
]);

const MAX_AUTO_RETRIES = 4;
const RETRY_DELAYS_MS = [1200, 2500, 5000, 9000];

type ArtworkTrackInput = Pick<TrackDTO, "artworkUrl" | "identifier" | "sourceName" | "uri"> & {
  title?: string;
};

export function extractYouTubeId(track: ArtworkTrackInput | null | undefined): string | null {
  if (!track) return null;
  const raw = track.artworkUrl?.trim() || "";
  if (raw) {
    try {
      const parsed = new URL(raw);
      const match = parsed.pathname.match(YTIMG_PATH_REGEX);
      if (match) return match[1];
    } catch {
      // Ignore malformed raw URL
    }
  }
  if (track.uri) {
    const uriMatch = track.uri.match(YT_URI_ID_REGEX);
    if (uriMatch) return uriMatch[1];
  }
  if (YOUTUBE_ID_REGEX.test(track.identifier || "")) {
    return track.identifier;
  }
  return null;
}

export function buildArtworkCandidates(track: ArtworkTrackInput | null | undefined): string[] {
  if (!track) return [];

  const candidates: string[] = [];
  const raw = track.artworkUrl?.trim() || "";

  let isGoogleUserContent = false;
  let isYtImg = false;

  if (raw) {
    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      isGoogleUserContent =
        PROXY_PREFERRED_HOSTS.has(host) ||
        host.endsWith(".googleusercontent.com") ||
        host.endsWith(".ggpht.com");
      isYtImg = host.endsWith(".ytimg.com") || host === "img.youtube.com";
    } catch {
      // Ignore malformed raw URL
    }
  }

  const ytId = extractYouTubeId(track);
  const looksLikeYouTube =
    Boolean(ytId) &&
    (isYtImg ||
      isGoogleUserContent ||
      track.sourceName === "youtube" ||
      Boolean(track.uri?.includes("youtube")) ||
      Boolean(track.uri?.includes("youtu.be")) ||
      !raw);

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
    const qualities = [
      "maxresdefault.jpg",
      "sddefault.jpg",
      "hqdefault.jpg",
      "mqdefault.jpg",
      "0.jpg",
      "default.jpg",
    ];
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
  return /\/(?:sddefault|hqdefault|0)\.jpg/i.test(decodeURIComponent(src));
}

function appendRetryParam(url: string, retryRound: number): string {
  if (retryRound <= 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}retry=${retryRound}`;
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
  const [retryRound, setRetryRound] = useState(0);

  useEffect(() => {
    setCandidateIdx(0);
    setRetryRound(0);
  }, [track?.artworkUrl, track?.identifier, track?.uri]);

  const baseSrc = candidates[candidateIdx];

  // Automatic retry with backoff when all candidates fail due to transient network/rate-limit error
  useEffect(() => {
    if (!track || candidates.length === 0) return;
    if (candidateIdx < candidates.length) return;
    if (retryRound >= MAX_AUTO_RETRIES) return;

    const delay = RETRY_DELAYS_MS[Math.min(retryRound, RETRY_DELAYS_MS.length - 1)];
    const timer = setTimeout(() => {
      setRetryRound((r) => r + 1);
      setCandidateIdx(0);
    }, delay);

    return () => clearTimeout(timer);
  }, [candidateIdx, candidates.length, retryRound, track]);

  if (!track || !baseSrc) {
    return (
      <div
        onClick={() => {
          if (candidates.length > 0) {
            setRetryRound((r) => r + 1);
            setCandidateIdx(0);
          }
        }}
        className={`flex items-center justify-center bg-[#181818] text-zinc-600 ${className}`}
      >
        <Disc3 className={iconClassName} />
      </div>
    );
  }

  const src = appendRetryParam(baseSrc, retryRound);
  const cropBars = isLetterboxedYtFallback(baseSrc);

  return (
    <div className={`overflow-hidden bg-[#181818] ${className}`}>
      <img
        key={`${src}-${retryRound}`}
        src={src}
        alt={alt ?? track.title ?? "Artwork"}
        referrerPolicy="no-referrer"
        loading="lazy"
        onLoad={(e) => {
          const img = e.currentTarget;
          const decoded = decodeURIComponent(baseSrc);
          if (
            (img.naturalWidth === 0 || img.naturalHeight === 0) ||
            (/\/(?:maxresdefault|sddefault)\.(?:jpg|webp)/i.test(decoded) &&
              img.naturalWidth <= 120 &&
              img.naturalHeight <= 90)
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
