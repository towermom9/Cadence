import type { LyricsDTO } from "@shared/types";
import type { Player } from "lavalink-client";

interface LrcLibRecord {
  trackName?: string;
  artistName?: string;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function cleanTrackTitle(raw: string): string {
  return raw
    .replace(/\((official\s*(music\s*)?video|audio|lyric\s*video|lyrics|hd|4k|visualizer|live)\)/gi, "")
    .replace(/\[(official\s*(music\s*)?video|audio|lyric\s*video|lyrics|hd|4k|visualizer|live)\]/gi, "")
    .replace(/\b(ft\.|feat\.)\s+[^-–—]+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanArtistName(raw: string): string {
  return raw
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .trim();
}

export async function fetchLyrics(
  title: string,
  artist: string,
  durationMs?: number,
  player?: Player | null
): Promise<LyricsDTO | null> {
  const cleanedTitle = cleanTrackTitle(title);
  const cleanedArtist = cleanArtistName(artist);

  // 1. Primary free lookup via LRCLIB exact endpoint
  try {
    const params = new URLSearchParams({
      track_name: cleanedTitle || title,
      artist_name: cleanedArtist || artist,
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
          artist: data.artistName || cleanedArtist || artist,
          plainLyrics: data.plainLyrics ?? null,
          syncedLyrics: data.syncedLyrics ?? null,
          source: "LRCLIB",
        };
      }
    }
  } catch {
    // Fall through to LRCLIB search
  }

  // 2. Fallback via LRCLIB fuzzy search
  try {
    const query = [cleanedArtist, cleanedTitle].filter(Boolean).join(" ").trim() || title;
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      headers: { "User-Agent": "Cadence/1.0 (https://github.com/towermom9/Cadence)" },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const list = (await res.json()) as LrcLibRecord[];
      const match = list.find((item) => item.syncedLyrics || item.plainLyrics);
      if (match) {
        return {
          title: match.trackName || cleanedTitle || title,
          artist: match.artistName || cleanedArtist || artist,
          plainLyrics: match.plainLyrics ?? null,
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
      if (lavaLyrics && (lavaLyrics.text || (Array.isArray(lavaLyrics.lines) && lavaLyrics.lines.length > 0))) {
        const plain =
          lavaLyrics.text ||
          lavaLyrics.lines.map((line) => line.line).join("\n");
        return {
          title: cleanedTitle || title,
          artist: cleanedArtist || artist,
          plainLyrics: plain,
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
