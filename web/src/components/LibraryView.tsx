import { useState, type FormEvent, type MouseEvent } from "react";
import { Disc3, MoreVertical, Play, Plus } from "lucide-react";
import type {
  EnqueueMode,
  GuildSettingsDTO,
  HistoryEntryDTO,
  PlaylistDTO,
  TrackDTO,
} from "@shared/types";
import { formatMs, sourceLabel } from "../utils/format";
import type { TrackMenuContext } from "./ContextMenu";
import { PlaylistArtwork } from "./PlaylistArtwork";
import { SettingsView } from "./SettingsView";
import { TrackArtwork } from "./TrackArtwork";

interface Props {
  playlists: PlaylistDTO[];
  history: HistoryEntryDTO[];
  guildId: string | null;
  guildName: string;
  canManage: boolean;
  settings: GuildSettingsDTO | null;
  initialTab?: "playlists" | "history" | "settings";
  onCreatePlaylist: (name: string) => void;
  onSelectPlaylist: (playlistId: string) => void;
  onPlayPlaylist: (playlistId: string) => void;
  onEnqueue: (tracks: TrackDTO[], mode: EnqueueMode, sourceLabel?: string) => void;
  onLoadSettings: (guildId: string) => void;
  onSaveSettings: (patch: Partial<Omit<GuildSettingsDTO, "guildId" | "roles">>) => void;
  onTrackContextMenu: (e: MouseEvent, track: TrackDTO, ctx?: TrackMenuContext) => void;
  onPlaylistContextMenu: (e: MouseEvent, playlist: PlaylistDTO) => void;
}

export function LibraryView({
  playlists,
  history,
  guildId,
  guildName,
  canManage,
  settings,
  initialTab = "playlists",
  onCreatePlaylist,
  onSelectPlaylist,
  onPlayPlaylist,
  onEnqueue,
  onLoadSettings,
  onSaveSettings,
  onTrackContextMenu,
  onPlaylistContextMenu,
}: Props) {
  const [tab, setTab] = useState<"playlists" | "history" | "settings">(initialTab);
  const [newName, setNewName] = useState("");

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreatePlaylist(newName.trim());
    setNewName("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("playlists")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === "playlists"
                ? "bg-white text-black"
                : "bg-white/[0.06] text-zinc-300 hover:bg-white/12"
            }`}
          >
            Playlists ({playlists.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("history")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === "history"
                ? "bg-white text-black"
                : "bg-white/[0.06] text-zinc-300 hover:bg-white/12"
            }`}
          >
            History ({history.length})
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setTab("settings")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                tab === "settings"
                  ? "bg-white text-black"
                  : "bg-white/[0.06] text-zinc-300 hover:bg-white/12"
              }`}
            >
              Server Settings
            </button>
          )}
        </div>

        {tab === "playlists" && (
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New playlist name..."
              className="rounded-full border border-white/15 bg-[#121212] px-4 py-1.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/40"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
          </form>
        )}
      </div>

      {tab === "playlists" && (
        <>
          {playlists.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#121212] p-12 text-center">
              <Disc3 className="mx-auto h-10 w-10 text-zinc-600" />
              <p className="mt-3 text-sm font-medium text-white">No playlists yet</p>
              <p className="mt-1 text-xs text-zinc-400">
                Create a playlist above and save tracks from search results or the player bar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {playlists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => onSelectPlaylist(pl.id)}
                  onContextMenu={(e) => onPlaylistContextMenu(e, pl)}
                  className="group cursor-pointer space-y-2.5"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-[#181818] ring-1 ring-white/10">
                    <PlaylistArtwork
                      playlist={pl}
                      className="h-full w-full transition duration-300 group-hover:brightness-75"
                    />
                    {pl.tracks.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayPlaylist(pl.id);
                        }}
                        title="Play playlist"
                        className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-white opacity-0 shadow-lg transition hover:scale-105 group-hover:opacity-100"
                      >
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      </button>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{pl.name}</p>
                    <p className="truncate text-xs text-zinc-400">
                      {pl.tracks.length} {pl.tracks.length === 1 ? "track" : "tracks"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        <>
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#121212] p-10 text-center text-sm text-zinc-400">
              Songs you play will show up here.
            </div>
          ) : (
            <div className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#121212]">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  onClick={() => onEnqueue([entry.track], "now", "History")}
                  onContextMenu={(e) => onTrackContextMenu(e, entry.track)}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]"
                >
                  <TrackArtwork
                    track={entry.track}
                    className="h-10 w-10 shrink-0 rounded"
                    iconClassName="h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{entry.track.title}</p>
                    <p className="truncate text-xs text-zinc-400">
                      {entry.track.author} • {sourceLabel(entry.track.sourceName)} •{" "}
                      {formatMs(entry.track.duration)}
                    </p>
                  </div>
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-0.5"
                  >
                    <button
                      type="button"
                      onClick={() => onEnqueue([entry.track], "now", "History")}
                      title="Play now"
                      className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <Play className="h-4 w-4 fill-current" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEnqueue([entry.track], "end", "History")}
                      title="Add to queue"
                      className="rounded-full p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onTrackContextMenu(e, entry.track)}
                      title="More options"
                      className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "settings" && (
        <SettingsView
          guildId={guildId}
          guildName={guildName}
          canManage={canManage}
          settings={settings}
          onLoadSettings={onLoadSettings}
          onSaveSettings={onSaveSettings}
        />
      )}
    </div>
  );
}
