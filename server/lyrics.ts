import { cleanArtistTag, splitArtists } from "@shared/artists";
import type { LyricsDTO } from "@shared/types";
import type { Player } from "lavalink-client";

interface LrcLibRecord {
  trackName?: string;
  artistName?: string;
  duration?: number;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

const ENHANCED_WORD_TAG_REGEX = /<\d{1,3}:\d{2}(?:\.\d{1,3})?>/g;

export function stripEnhancedLrcTags(raw: string | null | undefined): string | null {
  if (!raw) return raw ?? null;
  return raw
    .replace(ENHANCED_WORD_TAG_REGEX, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^ +| +$/gm, "");
}

function cleanTrackTitle(raw: string, artist?: string): string {
  let title = raw;
  const primaryArtist = splitArtists(artist || "")[0];
  if (primaryArtist) {
    const escaped = primaryArtist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(`^${escaped}\\s*[-–—:|]\\s*`, "i"), "");
  }

  return title
    .replace(
      /\((official\s*(music\s*)?video|music\s*video|audio|lyric\s*video|lyrics|hd|4k|4k\s*remaster|\d{4}\s*remaster|remastered(?:\s*\d{4})?|visualizer|live)\)/gi,
      ""
    )
    .replace(
      /\[(official\s*(music\s*)?(video|mv)|music\s*video|mv|audio|lyric\s*video|lyrics|hd|4k|remastered(?:\s*\d{4})?|visualizer|live)\]/gi,
      ""
    )
    .replace(/\s*\|\s*[^|]+$/g, "")
    .replace(/\b(ft\.|feat\.)\s+[^-–—()[\]]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchLyrics(
  title: string,
  artist: string,
  durationMs?: number,
  player?: Player | null
): Promise<LyricsDTO | null> {
  const cleanedArtist = cleanArtistTag(artist);
  const primaryArtist = splitArtists(cleanedArtist)[0] || cleanedArtist || artist;
  const cleanedTitle = cleanTrackTitle(title, primaryArtist);

  // 1. Primary lookup via LRCLIB exact endpoint
  try {
    const params = new URLSearchParams({
      track_name: cleanedTitle || title,
      artist_name: primaryArtist || artist,
    });
    if (durationMs && durationMs > 0) {
      params.set("duration", String(Math.round(durationMs / 1000)));
    }

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { "User-Agent": "Cadence/1.0 (https://github.com/towermom9/Cadence)" },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const data = (await res.json()) as LrcLibRecord;
      if (data.plainLyrics || data.syncedLyrics) {
        return {
          title: data.trackName || cleanedTitle || title,
          artist: data.artistName || primaryArtist || artist,
          plainLyrics: stripEnhancedLrcTags(data.plainLyrics),
          syncedLyrics: data.syncedLyrics ?? null,
          source: "LRCLIB",
        };
      }
    }
  } catch {
    // Fall through to LRCLIB fuzzy search
  }

  // 2. Fallback via LRCLIB fuzzy search (scored by synced availability + duration proximity)
  try {
    const query = [primaryArtist, cleanedTitle].filter(Boolean).join(" ").trim() || title;
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      headers: { "User-Agent": "Cadence/1.0 (https://github.com/towermom9/Cadence)" },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const list = (await res.json()) as LrcLibRecord[];
      const candidates = list.filter((item) => item.syncedLyrics || item.plainLyrics);
      if (candidates.length > 0) {
        const targetSec = durationMs && durationMs > 0 ? durationMs / 1000 : null;
        candidates.sort((a, b) => {
          const aSynced = a.syncedLyrics ? 1 : 0;
          const bSynced = b.syncedLyrics ? 1 : 0;
          if (aSynced !== bSynced) return bSynced - aSynced;

          if (targetSec !== null) {
            const aDiff =
              typeof a.duration === "number" ? Math.abs(a.duration - targetSec) : 999;
            const bDiff =
              typeof b.duration === "number" ? Math.abs(b.duration - targetSec) : 999;
            return aDiff - bDiff;
          }
          return 0;
        });

        const match = candidates[0];
        return {
          title: match.trackName || cleanedTitle || title,
          artist: match.artistName || primaryArtist || artist,
          plainLyrics: stripEnhancedLrcTags(match.plainLyrics),
          syncedLyrics: match.syncedLyrics ?? null,
          source: "LRCLIB",
        };
      }
    }
  } catch {
    // Fall through to Lavalink LavaLyrics fallback
  }

  // 3. Optional Lavalink LavaLyrics fallback if current track is active
  if (player && typeof player.getCurrentLyrics === "function") {
    try {
      const lavaLyrics = await player.getCurrentLyrics(true);
      if (
        lavaLyrics &&
        (lavaLyrics.text || (Array.isArray(lavaLyrics.lines) && lavaLyrics.lines.length > 0))
      ) {
        const plain =
          lavaLyrics.text || lavaLyrics.lines.map((line) => line.line).join("\n");
        return {
          title: cleanedTitle || title,
          artist: primaryArtist || artist,
          plainLyrics: stripEnhancedLrcTags(plain),
          syncedLyrics: null,
          source: lavaLyrics.provider || "Lavalink",
        };
      }
    } catch {
      // Ignore if LavaLyrics plugin has no match
    }
  }

  return null;
}
