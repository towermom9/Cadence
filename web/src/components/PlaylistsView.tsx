import { useState, type FormEvent } from "react";
import { Disc3, Pencil, Play, Plus, Shuffle, Trash2, X } from "lucide-react";
import type { PlaylistDTO } from "@shared/types";
import { formatMs } from "../utils/format";

interface Props {
  playlists: PlaylistDTO[];
  onCreate: (name: string) => void;
  onRename: (playlistId: string, name: string) => void;
  onDelete: (playlistId: string) => void;
  onPlay: (playlistId: string, shuffle?: boolean) => void;
  onRemoveTrack: (playlistId: string, index: number) => void;
}

export function PlaylistsView({
  playlists,
  onCreate,
  onRename,
  onDelete,
  onPlay,
  onRemoveTrack,
}: Props) {
  const [newName, setNewName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const activePlaylist =
    playlists.find((p) => p.id === selectedId) ?? playlists[0] ?? null;

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreate(newName.trim());
    setNewName("");
  };

  const handleRenameSubmit = (e: FormEvent, playlistId: string) => {
    e.preventDefault();
    if (!renameValue.trim()) return;
    onRename(playlistId, renameValue.trim());
    setRenamingId(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="rounded-2xl border border-white/8 bg-[#111116] p-5 lg:col-span-5">
        <h2 className="text-lg font-semibold text-white">Your Playlists</h2>
        <form onSubmit={handleCreate} className="mt-3 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New playlist name..."
            className="flex-1 rounded-xl border border-white/10 bg-[#09090b] px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Create
          </button>
        </form>

        <div className="mt-4 space-y-2">
          {playlists.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">
              Create your first playlist above, then save tracks from Discover or Queue.
            </p>
          ) : (
            playlists.map((pl) => {
              const selected = activePlaylist?.id === pl.id;
              return (
                <div
                  key={pl.id}
                  onClick={() => setSelectedId(pl.id)}
                  className={`cursor-pointer rounded-xl border p-3 transition ${
                    selected
                      ? "border-violet-500/40 bg-violet-600/15"
                      : "border-white/6 bg-[#14141b] hover:border-white/15"
                  }`}
                >
                  {renamingId === pl.id ? (
                    <form
                      onSubmit={(e) => handleRenameSubmit(e, pl.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        className="flex-1 rounded-lg border border-white/15 bg-[#09090b] px-2.5 py-1 text-sm text-white outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white"
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{pl.name}</p>
                        <p className="text-xs text-zinc-400">{pl.tracks.length} tracks</p>
                      </div>
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(pl.id);
                            setRenameValue(pl.name);
                          }}
                          title="Rename playlist"
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(pl.id)}
                          title="Delete playlist"
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/20 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[#111116] p-5 lg:col-span-7">
        {activePlaylist ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{activePlaylist.name}</h3>
                <p className="text-xs text-zinc-400">
                  {activePlaylist.tracks.length} saved tracks
                </p>
              </div>
              {activePlaylist.tracks.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlay(activePlaylist.id, false)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-medium text-white transition hover:bg-violet-500"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Play All
                  </button>
                  <button
                    type="button"
                    onClick={() => onPlay(activePlaylist.id, true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                    Shuffle Play
                  </button>
                </div>
              )}
            </div>

            {activePlaylist.tracks.length === 0 ? (
              <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-10 text-sm text-zinc-400">
                <Disc3 className="mb-2 h-8 w-8 text-zinc-600" />
                No tracks in this playlist yet.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {activePlaylist.tracks.map((track, idx) => (
                  <div
                    key={`${track.identifier}-${idx}`}
                    className="flex items-center gap-3 rounded-xl border border-white/6 bg-[#14141b] p-2.5"
                  >
                    <span className="w-6 text-center text-xs tabular-nums text-zinc-500">
                      {idx + 1}
                    </span>
                    {track.artworkUrl ? (
                      <img
                        src={track.artworkUrl}
                        alt={track.title}
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-[10px] text-zinc-500">
                        Audio
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{track.title}</p>
                      <p className="truncate text-xs text-zinc-400">
                        {track.author} • {formatMs(track.duration)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveTrack(activePlaylist.id, idx)}
                      title="Remove from playlist"
                      className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full min-h-48 items-center justify-center text-sm text-zinc-400">
            Select or create a playlist to view its tracks.
          </div>
        )}
      </section>
    </div>
  );
}
