import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Disc3, Plus, X } from "lucide-react";
import type { PlaylistDTO, TrackDTO } from "@shared/types";
import { PlaylistArtwork } from "./PlaylistArtwork";

interface Props {
  tracks: TrackDTO[] | null;
  playlists: PlaylistDTO[];
  onClose: () => void;
  onSaveToPlaylist: (playlistId: string, tracks: TrackDTO[]) => void;
  onCreatePlaylistWithTracks: (name: string, tracks: TrackDTO[]) => void;
}

export function SaveToPlaylistModal({
  tracks,
  playlists,
  onClose,
  onSaveToPlaylist,
  onCreatePlaylistWithTracks,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setCreating(false);
    setNewName("");
  }, [tracks]);

  useEffect(() => {
    if (!tracks) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, tracks]);

  const recentPlaylists = useMemo(
    () => [...playlists].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4),
    [playlists]
  );

  const allPlaylists = useMemo(
    () =>
      [...playlists].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
      ),
    [playlists]
  );

  if (!tracks || tracks.length === 0) return null;

  const singleTrackId = tracks.length === 1 ? tracks[0]?.identifier : null;

  const handleSelectPlaylist = (playlistId: string) => {
    onSaveToPlaylist(playlistId, tracks);
    onClose();
  };

  const handleCreateSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreatePlaylistWithTracks(trimmed, tracks);
    onClose();
  };

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save to playlist"
        className="relative flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/10 bg-[#212121] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">Save to playlist</h2>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              {tracks.length === 1
                ? `${tracks[0].title} • ${tracks[0].author}`
                : `${tracks.length} tracks selected`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-20 pt-2">
          {playlists.length === 0 && !creating ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-[#181818] p-8 text-center">
              <Disc3 className="mx-auto h-9 w-9 text-zinc-500" />
              <p className="mt-3 text-sm font-medium text-white">No playlists yet</p>
              <p className="mt-1 text-xs text-zinc-400">
                Click &ldquo;+ New playlist&rdquo; below to create one and save.
              </p>
            </div>
          ) : (
            <>
              {recentPlaylists.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold text-zinc-300">Recent</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {recentPlaylists.map((pl) => {
                      const alreadyIn = Boolean(
                        singleTrackId && pl.tracks.some((t) => t.identifier === singleTrackId)
                      );
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => handleSelectPlaylist(pl.id)}
                          className="group min-w-0 text-left"
                        >
                          <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[#181818] ring-1 ring-white/10 transition group-hover:ring-white/30">
                            <PlaylistArtwork
                              playlist={pl}
                              className="h-full w-full transition duration-200 group-hover:brightness-75"
                            />
                            {alreadyIn && (
                              <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-black shadow">
                                <Check className="h-3 w-3 stroke-[2.5]" />
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 truncate text-xs font-medium text-white">
                            {pl.name}
                          </p>
                          <p className="truncate text-[11px] text-zinc-400">
                            {pl.tracks.length} {pl.tracks.length === 1 ? "song" : "songs"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {recentPlaylists.length > 0 && allPlaylists.length > 0 && (
                <div className="my-4 border-t border-white/10" />
              )}

              {allPlaylists.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-300">All playlists</h3>
                  <div className="space-y-1">
                    {allPlaylists.map((pl) => {
                      const alreadyIn = Boolean(
                        singleTrackId && pl.tracks.some((t) => t.identifier === singleTrackId)
                      );
                      return (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => handleSelectPlaylist(pl.id)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/[0.08]"
                        >
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-[#181818] ring-1 ring-white/10">
                            <PlaylistArtwork playlist={pl} className="h-full w-full" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{pl.name}</p>
                            <p className="truncate text-xs text-zinc-400">
                              {pl.tracks.length} {pl.tracks.length === 1 ? "track" : "tracks"}
                            </p>
                          </div>
                          {alreadyIn && (
                            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          {creating && (
            <form
              onSubmit={handleCreateSubmit}
              className="mt-4 rounded-xl border border-white/15 bg-[#181818] p-3"
            >
              <label className="block text-xs font-medium text-zinc-300">
                New playlist name
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter playlist name..."
                autoFocus
                className="mt-2 w-full rounded-lg border border-white/15 bg-[#121212] px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-white/40"
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setNewName("");
                  }}
                  className="rounded-full px-3.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim()}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Floating bottom-right + New playlist pill */}
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="absolute bottom-4 right-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-xl transition hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            New playlist
          </button>
        )}
      </div>
    </div>
  );
}
