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
