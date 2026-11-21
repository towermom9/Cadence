export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function sourceLabel(sourceName: string): string {
  switch (sourceName.toLowerCase()) {
    case "youtube":
      return "YouTube";
    case "youtubemusic":
      return "YT Music";
    case "spotify":
      return "Spotify";
    case "deezer":
      return "Deezer";
    case "soundcloud":
      return "SoundCloud";
    case "applemusic":
      return "Apple Music";
    case "bandcamp":
      return "Bandcamp";
    case "twitch":
      return "Twitch";
    default:
      return sourceName || "Audio";
  }
}

export function formatRelativeTime(timestampMs: number | null | undefined): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return "never";
  const diffSec = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (diffSec < 45) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}
