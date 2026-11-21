import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  AutoplayClickBehavior,
  BackgroundMode,
  GuildSettingsDTO,
  HistoryEntryDTO,
  PinnedTrackDTO,
  PlaylistDTO,
  PlaylistSortMode,
  SearchSource,
  ThemeAccentId,
  TrackDTO,
  UserPreferencesDTO,
  UserProfileDTO,
} from "@shared/types";
import { config } from "./config";

const VALID_PLAYLIST_SORTS = new Set<PlaylistSortMode>([
  "recent_activity",
  "recently_saved",
  "recently_played",
  "recent_sync",
  "manual",
  "alphabetical",
]);

const VALID_THEME_ACCENTS = new Set<ThemeAccentId>([
  "red",
  "rose",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "emerald",
  "amber",
  "monochrome",
]);

const VALID_BG_MODES = new Set<BackgroundMode>(["amoled", "dark", "elevated"]);

const VALID_AUTOPLAY_CLICKS = new Set<AutoplayClickBehavior>([
  "play_now_here",
  "play_now_end",
  "queue_next",
  "queue_end",
]);

const DEFAULT_USER_PREFERENCES: UserPreferencesDTO = {
  playlistSort: "recent_activity",
  themeAccent: "red",
  backgroundMode: "dark",
  ambienceMode: true,
  artworkSeekButtons: true,
  artworkSeekSeconds: 10,
  lyricsAutoScroll: true,
  autoplayClickBehavior: "play_now_here",
};

function normalizeSeekSeconds(value: unknown, fallback = 10): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(5, Math.min(30, Math.round(value)));
}

export interface StoredAppConfig {
  discordToken: string;
  discordClientId: string;
  discordClientSecret: string;
  dashboardUrl: string;
  botPrefix: string;
  defaultSearchSource: SearchSource;
  ownerUserId: string | null;
  setupCompleted: boolean;
  updatedAt: number;
}

interface AppConfigRow {
  discord_token: string;
  discord_client_id: string;
  discord_client_secret: string;
  dashboard_url: string;
  bot_prefix: string;
  default_search_source: string;
  owner_user_id: string | null;
  setup_completed: number;
  updated_at: number;
}

export interface SessionRecord {
  id: string;
  user: UserProfileDTO;
  accessToken: string;
  expiresAt: number;
}

interface GuildSettingsRow {
  guild_id: string;
  prefix: string;
  default_volume: number;
  dj_role_id: string | null;
  stay_247: number;
  autoplay: number;
  allow_duplicates: number;
}

interface PlaylistRow {
  id: string;
  user_id: string;
  name: string;
  tracks_json: string;
  source_url: string | null;
  last_synced_at: number | null;
  last_played_at: number | null;
  is_liked: number;
  is_pinned: number;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

interface PinnedTrackRow {
  user_id: string;
  track_id: string;
  track_json: string;
  pinned_at: number;
}

interface HistoryRow {
  id: number;
  user_id: string;
  track_json: string;
  played_at: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  username: string;
  global_name: string | null;
  avatar_url: string | null;
  access_token: string;
  expires_at: number;
}

export class CadenceDatabase {
  private db: Database;

  constructor(dataDir: string = config.dataDir) {
    mkdirSync(dataDir, { recursive: true });
    const dbPath = join(dataDir, "cadence.sqlite");
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        prefix TEXT NOT NULL,
        default_volume INTEGER NOT NULL DEFAULT 100,
        dj_role_id TEXT,
        stay_247 INTEGER NOT NULL DEFAULT 0,
        autoplay INTEGER NOT NULL DEFAULT 0,
        allow_duplicates INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        tracks_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists(user_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        track_json TEXT NOT NULL,
        played_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_history_user ON play_history(user_id, played_at DESC);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        global_name TEXT,
        avatar_url TEXT,
        access_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS app_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        discord_token TEXT NOT NULL DEFAULT '',
        discord_client_id TEXT NOT NULL DEFAULT '',
        discord_client_secret TEXT NOT NULL DEFAULT '',
        dashboard_url TEXT NOT NULL DEFAULT '',
        bot_prefix TEXT NOT NULL DEFAULT '?',
        default_search_source TEXT NOT NULL DEFAULT 'ytmsearch',
        owner_user_id TEXT,
        setup_completed INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        playlist_sort TEXT NOT NULL DEFAULT 'recent_activity',
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pinned_tracks (
        user_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        track_json TEXT NOT NULL,
        pinned_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, track_id)
      );

      CREATE INDEX IF NOT EXISTS idx_pinned_tracks_user ON pinned_tracks(user_id, pinned_at DESC);
    `);

    const playlistCols = this.db
      .query<{ name: string }, []>(`PRAGMA table_info(playlists)`)
      .all()
      .map((col) => col.name);
    if (!playlistCols.includes("source_url")) {
      this.db.exec(`ALTER TABLE playlists ADD COLUMN source_url TEXT`);
    }
    if (!playlistCols.includes("last_synced_at")) {
      this.db.exec(`ALTER TABLE playlists ADD COLUMN last_synced_at INTEGER`);
    }
    if (!playlistCols.includes("is_liked")) {
      this.db.exec(`ALTER TABLE playlists ADD COLUMN is_liked INTEGER NOT NULL DEFAULT 0`);
    }
    if (!playlistCols.includes("is_pinned")) {
      this.db.exec(`ALTER TABLE playlists ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`);
    }
    if (!playlistCols.includes("last_played_at")) {
      this.db.exec(`ALTER TABLE playlists ADD COLUMN last_played_at INTEGER`);
    }
    if (!playlistCols.includes("sort_order")) {
      this.db.exec(`ALTER TABLE playlists ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
    }

    const prefCols = this.db
      .query<{ name: string }, []>(`PRAGMA table_info(user_preferences)`)
      .all()
      .map((col) => col.name);
    if (!prefCols.includes("preferences_json")) {
      this.db.exec(`ALTER TABLE user_preferences ADD COLUMN preferences_json TEXT`);
    }
  }

  getGuildSettings(guildId: string): GuildSettingsDTO {
    const row = this.db
      .query<GuildSettingsRow, [string]>(
        `SELECT guild_id, prefix, default_volume, dj_role_id, stay_247, autoplay, allow_duplicates
         FROM guild_settings WHERE guild_id = ?`
      )
      .get(guildId);

    if (!row) {
      return {
        guildId,
        prefix: config.botPrefix,
        defaultVolume: 100,
        djRoleId: null,
        stay247: false,
        autoplay: false,
        allowDuplicates: true,
      };
    }

    return {
      guildId: row.guild_id,
      prefix: row.prefix || config.botPrefix,
      defaultVolume: Math.max(0, Math.min(100, row.default_volume)),
      djRoleId: row.dj_role_id,
      stay247: row.stay_247 === 1,
      autoplay: row.autoplay === 1,
      allowDuplicates: row.allow_duplicates === 1,
    };
  }

  updateGuildSettings(
    guildId: string,
    patch: Partial<Omit<GuildSettingsDTO, "guildId" | "roles">>
  ): GuildSettingsDTO {
    const current = this.getGuildSettings(guildId);
    const next: GuildSettingsDTO = {
      guildId,
      prefix:
        typeof patch.prefix === "string" && patch.prefix.trim().length > 0
          ? patch.prefix.trim().slice(0, 5)
          : current.prefix,
      defaultVolume:
        typeof patch.defaultVolume === "number" && Number.isFinite(patch.defaultVolume)
          ? Math.max(0, Math.min(100, Math.round(patch.defaultVolume)))
          : current.defaultVolume,
      djRoleId: patch.djRoleId === undefined ? current.djRoleId : patch.djRoleId,
      stay247: typeof patch.stay247 === "boolean" ? patch.stay247 : current.stay247,
      autoplay: typeof patch.autoplay === "boolean" ? patch.autoplay : current.autoplay,
      allowDuplicates:
        typeof patch.allowDuplicates === "boolean"
          ? patch.allowDuplicates
          : current.allowDuplicates,
    };

    this.db
      .query(
        `INSERT INTO guild_settings (guild_id, prefix, default_volume, dj_role_id, stay_247, autoplay, allow_duplicates)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id) DO UPDATE SET
           prefix = excluded.prefix,
           default_volume = excluded.default_volume,
           dj_role_id = excluded.dj_role_id,
           stay_247 = excluded.stay_247,
           autoplay = excluded.autoplay,
           allow_duplicates = excluded.allow_duplicates`
      )
      .run(
        next.guildId,
        next.prefix,
        next.defaultVolume,
        next.djRoleId,
        next.stay247 ? 1 : 0,
        next.autoplay ? 1 : 0,
        next.allowDuplicates ? 1 : 0
      );

    return next;
  }

  private rowToPlaylist(row: PlaylistRow): PlaylistDTO {
    return {
      id: row.id,
      name: row.name,
      tracks: this.safeParseTracks(row.tracks_json),
      sourceUrl: row.source_url ?? null,
      lastSyncedAt: row.last_synced_at ?? null,
      lastPlayedAt: row.last_played_at ?? null,
      isLiked: row.is_liked === 1,
      isPinned: row.is_pinned === 1,
      sortOrder: row.sort_order ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  ensureLikedPlaylist(userId: string): PlaylistDTO {
    const existing = this.db
      .query<PlaylistRow, [string]>(
        `SELECT id, user_id, name, tracks_json, source_url, last_synced_at,
                last_played_at, is_liked, is_pinned, sort_order, created_at, updated_at
         FROM playlists WHERE user_id = ? AND is_liked = 1 LIMIT 1`
      )
      .get(userId);
    if (existing) {
      return this.rowToPlaylist(existing);
    }

    const now = Date.now();
    const id = randomUUID();
    const sortOrder = -1_000_000;
    this.db
      .query(
        `INSERT INTO playlists (id, user_id, name, tracks_json, is_liked, is_pinned, sort_order, created_at, updated_at)
         VALUES (?, ?, 'Liked Music', '[]', 1, 1, ?, ?, ?)`
      )
      .run(id, userId, sortOrder, now, now);

    return {
      id,
      name: "Liked Music",
      tracks: [],
      sourceUrl: null,
      lastSyncedAt: null,
      lastPlayedAt: null,
      isLiked: true,
      isPinned: true,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
  }

  getUserPlaylists(userId: string): PlaylistDTO[] {
    this.ensureLikedPlaylist(userId);
    const rows = this.db
      .query<PlaylistRow, [string]>(
        `SELECT id, user_id, name, tracks_json, source_url, last_synced_at,
                last_played_at, is_liked, is_pinned, sort_order, created_at, updated_at
         FROM playlists WHERE user_id = ? ORDER BY is_liked DESC, is_pinned DESC, updated_at DESC`
      )
      .all(userId);

    return rows.map((row) => this.rowToPlaylist(row));
  }

  getPlaylist(userId: string, playlistId: string): PlaylistDTO | null {
    const row = this.db
      .query<PlaylistRow, [string, string]>(
        `SELECT id, user_id, name, tracks_json, source_url, last_synced_at,
                last_played_at, is_liked, is_pinned, sort_order, created_at, updated_at
         FROM playlists WHERE id = ? AND user_id = ?`
      )
      .get(playlistId, userId);

    return row ? this.rowToPlaylist(row) : null;
  }

  findPlaylistByName(userId: string, name: string): PlaylistDTO | null {
    const row = this.db
      .query<PlaylistRow, [string, string]>(
        `SELECT id, user_id, name, tracks_json, source_url, last_synced_at,
                last_played_at, is_liked, is_pinned, sort_order, created_at, updated_at
         FROM playlists WHERE user_id = ? AND lower(name) = lower(?) LIMIT 1`
      )
      .get(userId, name.trim());

    return row ? this.rowToPlaylist(row) : null;
  }

  createPlaylist(userId: string, rawName: string): PlaylistDTO {
    const name = rawName.trim().slice(0, 60);
    if (!name) {
      throw new Error("Playlist name cannot be empty.");
    }

    const existing = this.getUserPlaylists(userId);
    if (existing.filter((p) => !p.isLiked).length >= 25) {
      throw new Error("Maximum of 25 playlists reached.");
    }
    if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Playlist "${name}" already exists.`);
    }

    const minOrder = existing
      .filter((p) => !p.isLiked)
      .reduce((min, p) => Math.min(min, p.sortOrder ?? 0), 0);
    const sortOrder = minOrder - 1;

    const now = Date.now();
    const id = randomUUID();
    this.db
      .query(
        `INSERT INTO playlists (id, user_id, name, tracks_json, is_liked, is_pinned, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, '[]', 0, 0, ?, ?, ?)`
      )
      .run(id, userId, name, sortOrder, now, now);

    return {
      id,
      name,
      tracks: [],
      sourceUrl: null,
      lastSyncedAt: null,
      lastPlayedAt: null,
      isLiked: false,
      isPinned: false,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
  }

  createSyncedPlaylist(
    userId: string,
    rawName: string,
    sourceUrl: string,
    tracks: TrackDTO[],
    customName = false
  ): PlaylistDTO {
    const existing = this.getUserPlaylists(userId);
    if (existing.filter((p) => !p.isLiked).length >= 25) {
      throw new Error("Maximum of 25 playlists reached.");
    }

    let baseName = rawName.trim().slice(0, 60) || "Imported Playlist";
    if (customName) {
      if (existing.some((p) => p.name.toLowerCase() === baseName.toLowerCase())) {
        throw new Error(`Playlist "${baseName}" already exists.`);
      }
    } else {
      let candidate = baseName;
      let suffix = 2;
      const lowerNames = new Set(existing.map((p) => p.name.toLowerCase()));
      while (lowerNames.has(candidate.toLowerCase())) {
        const tag = ` (${suffix++})`;
        candidate = `${baseName.slice(0, Math.max(1, 60 - tag.length))}${tag}`;
      }
      baseName = candidate;
    }

    const minOrder = existing
      .filter((p) => !p.isLiked)
      .reduce((min, p) => Math.min(min, p.sortOrder ?? 0), 0);
    const sortOrder = minOrder - 1;

    const saveable = tracks.filter((t) => !t.isStream).slice(0, 500);
    const now = Date.now();
    const id = randomUUID();
    this.db
      .query(
        `INSERT INTO playlists (id, user_id, name, tracks_json, source_url, last_synced_at, is_liked, is_pinned, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`
      )
      .run(id, userId, baseName, JSON.stringify(saveable), sourceUrl, now, sortOrder, now, now);

    return {
      id,
      name: baseName,
      tracks: saveable,
      sourceUrl,
      lastSyncedAt: now,
      lastPlayedAt: null,
      isLiked: false,
      isPinned: false,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
  }

  syncPlaylistTracks(
    userId: string,
    playlistId: string,
    tracks: TrackDTO[],
    sourceUrl?: string
  ): { playlist: PlaylistDTO; added: number; removed: number; total: number } {
    const playlist = this.getPlaylist(userId, playlistId);
    if (!playlist) {
      throw new Error("Playlist not found.");
    }

    const nextTracks = tracks.filter((t) => !t.isStream).slice(0, 500);
    const oldIds = new Set(playlist.tracks.map((t) => t.identifier));
    const newIds = new Set(nextTracks.map((t) => t.identifier));

    let added = 0;
    for (const id of newIds) {
      if (!oldIds.has(id)) added++;
    }
    let removed = 0;
    for (const id of oldIds) {
      if (!newIds.has(id)) removed++;
    }

    const resolvedUrl = sourceUrl?.trim() || playlist.sourceUrl || null;
    const now = Date.now();
    this.db
      .query(
        `UPDATE playlists
         SET tracks_json = ?,
             source_url = COALESCE(?, source_url),
             last_synced_at = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`
      )
      .run(JSON.stringify(nextTracks), resolvedUrl, now, now, playlistId, userId);

    return {
      playlist: {
        ...playlist,
        tracks: nextTracks,
        sourceUrl: resolvedUrl,
        lastSyncedAt: now,
        updatedAt: now,
      },
      added,
      removed,
      total: nextTracks.length,
    };
  }

  renamePlaylist(userId: string, playlistId: string, rawName: string): PlaylistDTO {
    const name = rawName.trim().slice(0, 60);
    if (!name) {
      throw new Error("Playlist name cannot be empty.");
    }

    const existing = this.getUserPlaylists(userId);
    const target = existing.find((p) => p.id === playlistId);
    if (!target) {
      throw new Error("Playlist not found.");
    }
    if (target.isLiked) {
      throw new Error("Liked Music is an auto-playlist and cannot be renamed.");
    }
    if (existing.some((p) => p.id !== playlistId && p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Playlist "${name}" already exists.`);
    }

    const now = Date.now();
    this.db
      .query(`UPDATE playlists SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(name, now, playlistId, userId);

    return { ...target, name, updatedAt: now };
  }

  deletePlaylist(userId: string, playlistId: string): boolean {
    const target = this.getPlaylist(userId, playlistId);
    if (target?.isLiked) {
      throw new Error("Liked Music is an auto-playlist and cannot be deleted.");
    }
    const result = this.db
      .query(`DELETE FROM playlists WHERE id = ? AND user_id = ?`)
      .run(playlistId, userId);
    return result.changes > 0;
  }

  togglePinPlaylist(
    userId: string,
    playlistId: string
  ): { playlist: PlaylistDTO; pinned: boolean } {
    const target = this.getPlaylist(userId, playlistId);
    if (!target) {
      throw new Error("Playlist not found.");
    }
    if (target.isLiked) {
      throw new Error("Liked Music is always pinned.");
    }
    const nextPinned = !Boolean(target.isPinned);
    this.db
      .query(`UPDATE playlists SET is_pinned = ? WHERE id = ? AND user_id = ?`)
      .run(nextPinned ? 1 : 0, playlistId, userId);

    return {
      playlist: { ...target, isPinned: nextPinned },
      pinned: nextPinned,
    };
  }

  getPinnedTracks(userId: string, limit = 20): PinnedTrackDTO[] {
    const rows = this.db
      .query<PinnedTrackRow, [string, number]>(
        `SELECT user_id, track_id, track_json, pinned_at
         FROM pinned_tracks
         WHERE user_id = ?
         ORDER BY pinned_at DESC
         LIMIT ?`
      )
      .all(userId, limit);

    const pinned: PinnedTrackDTO[] = [];
    for (const row of rows) {
      try {
        const track = JSON.parse(row.track_json) as TrackDTO;
        pinned.push({ track, pinnedAt: row.pinned_at });
      } catch {
        // Ignore corrupted pinned track JSON
      }
    }
    return pinned;
  }

  togglePinTrack(
    userId: string,
    track: TrackDTO
  ): { pinnedTracks: PinnedTrackDTO[]; pinned: boolean } {
    if (track.isStream) {
      throw new Error("Live streams cannot be pinned to Listen again.");
    }
    const existing = this.db
      .query<{ track_id: string }, [string, string]>(
        `SELECT track_id FROM pinned_tracks WHERE user_id = ? AND track_id = ? LIMIT 1`
      )
      .get(userId, track.identifier);

    if (existing) {
      this.db
        .query(`DELETE FROM pinned_tracks WHERE user_id = ? AND track_id = ?`)
        .run(userId, track.identifier);
      return { pinnedTracks: this.getPinnedTracks(userId), pinned: false };
    }

    const currentCount = this.db
      .query<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt FROM pinned_tracks WHERE user_id = ?`
      )
      .get(userId)?.cnt ?? 0;

    if (currentCount >= 20) {
      throw new Error("Maximum of 20 pinned tracks reached.");
    }

    this.db
      .query(
        `INSERT INTO pinned_tracks (user_id, track_id, track_json, pinned_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(userId, track.identifier, JSON.stringify(track), Date.now());

    return { pinnedTracks: this.getPinnedTracks(userId), pinned: true };
  }

  toggleLikedTrack(
    userId: string,
    track: TrackDTO
  ): { playlist: PlaylistDTO; liked: boolean } {
    if (track.isStream) {
      throw new Error("Live streams cannot be saved to Liked Music.");
    }
    const playlist = this.ensureLikedPlaylist(userId);
    const alreadyLiked = playlist.tracks.some((t) => t.identifier === track.identifier);
    const nextTracks = alreadyLiked
      ? playlist.tracks.filter((t) => t.identifier !== track.identifier)
      : [track, ...playlist.tracks].slice(0, 500);
    const now = Date.now();
    this.db
      .query(`UPDATE playlists SET tracks_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(JSON.stringify(nextTracks), now, playlist.id, userId);

    return {
      playlist: { ...playlist, tracks: nextTracks, updatedAt: now },
      liked: !alreadyLiked,
    };
  }

  markPlaylistPlayed(userId: string, playlistId: string): void {
    this.db
      .query(`UPDATE playlists SET last_played_at = ? WHERE id = ? AND user_id = ?`)
      .run(Date.now(), playlistId, userId);
  }

  getUserPlaylistSort(userId: string): PlaylistSortMode {
    const row = this.db
      .query<{ playlist_sort: string }, [string]>(
        `SELECT playlist_sort FROM user_preferences WHERE user_id = ?`
      )
      .get(userId);
    if (row && VALID_PLAYLIST_SORTS.has(row.playlist_sort as PlaylistSortMode)) {
      return row.playlist_sort as PlaylistSortMode;
    }
    return "recent_activity";
  }

  setUserPlaylistSort(userId: string, sort: PlaylistSortMode): PlaylistSortMode {
    const safeSort: PlaylistSortMode = VALID_PLAYLIST_SORTS.has(sort) ? sort : "recent_activity";
    const current = this.getUserPreferences(userId);
    const updated: UserPreferencesDTO = { ...current, playlistSort: safeSort };
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO user_preferences (user_id, playlist_sort, preferences_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           playlist_sort = excluded.playlist_sort,
           preferences_json = excluded.preferences_json,
           updated_at = excluded.updated_at`
      )
      .run(userId, safeSort, JSON.stringify(updated), now);
    return safeSort;
  }

  hasStoredUserPreferences(userId: string): boolean {
    const row = this.db
      .query<{ user_id: string }, [string]>(
        `SELECT user_id FROM user_preferences WHERE user_id = ? LIMIT 1`
      )
      .get(userId);
    return Boolean(row);
  }

  getUserPreferences(userId: string): UserPreferencesDTO {
    const row = this.db
      .query<{ playlist_sort: string; preferences_json: string | null }, [string]>(
        `SELECT playlist_sort, preferences_json FROM user_preferences WHERE user_id = ?`
      )
      .get(userId);

    if (!row) {
      return { ...DEFAULT_USER_PREFERENCES };
    }

    let parsed: Partial<UserPreferencesDTO> = {};
    if (row.preferences_json) {
      try {
        const raw = JSON.parse(row.preferences_json);
        if (raw && typeof raw === "object") {
          parsed = raw as Partial<UserPreferencesDTO>;
        }
      } catch {
        // Ignore corrupted JSON preferences
      }
    }

    const colSort = VALID_PLAYLIST_SORTS.has(row.playlist_sort as PlaylistSortMode)
      ? (row.playlist_sort as PlaylistSortMode)
      : DEFAULT_USER_PREFERENCES.playlistSort;

    return {
      playlistSort:
        parsed.playlistSort && VALID_PLAYLIST_SORTS.has(parsed.playlistSort)
          ? parsed.playlistSort
          : colSort,
      themeAccent:
        parsed.themeAccent && VALID_THEME_ACCENTS.has(parsed.themeAccent)
          ? parsed.themeAccent
          : DEFAULT_USER_PREFERENCES.themeAccent,
      backgroundMode:
        parsed.backgroundMode && VALID_BG_MODES.has(parsed.backgroundMode)
          ? parsed.backgroundMode
          : DEFAULT_USER_PREFERENCES.backgroundMode,
      ambienceMode:
        typeof parsed.ambienceMode === "boolean"
          ? parsed.ambienceMode
          : DEFAULT_USER_PREFERENCES.ambienceMode,
      artworkSeekButtons:
        typeof parsed.artworkSeekButtons === "boolean"
          ? parsed.artworkSeekButtons
          : DEFAULT_USER_PREFERENCES.artworkSeekButtons,
      artworkSeekSeconds: normalizeSeekSeconds(
        parsed.artworkSeekSeconds,
        DEFAULT_USER_PREFERENCES.artworkSeekSeconds
      ),
      lyricsAutoScroll:
        typeof parsed.lyricsAutoScroll === "boolean"
          ? parsed.lyricsAutoScroll
          : DEFAULT_USER_PREFERENCES.lyricsAutoScroll,
      autoplayClickBehavior:
        parsed.autoplayClickBehavior && VALID_AUTOPLAY_CLICKS.has(parsed.autoplayClickBehavior)
          ? parsed.autoplayClickBehavior
          : DEFAULT_USER_PREFERENCES.autoplayClickBehavior,
    };
  }

  updateUserPreferences(
    userId: string,
    patch: Partial<UserPreferencesDTO>
  ): UserPreferencesDTO {
    const current = this.getUserPreferences(userId);
    const next: UserPreferencesDTO = {
      playlistSort:
        patch.playlistSort && VALID_PLAYLIST_SORTS.has(patch.playlistSort)
          ? patch.playlistSort
          : current.playlistSort,
      themeAccent:
        patch.themeAccent && VALID_THEME_ACCENTS.has(patch.themeAccent)
          ? patch.themeAccent
          : current.themeAccent,
      backgroundMode:
        patch.backgroundMode && VALID_BG_MODES.has(patch.backgroundMode)
          ? patch.backgroundMode
          : current.backgroundMode,
      ambienceMode:
        typeof patch.ambienceMode === "boolean"
          ? patch.ambienceMode
          : current.ambienceMode,
      artworkSeekButtons:
        typeof patch.artworkSeekButtons === "boolean"
          ? patch.artworkSeekButtons
          : current.artworkSeekButtons,
      artworkSeekSeconds: normalizeSeekSeconds(
        patch.artworkSeekSeconds,
        current.artworkSeekSeconds
      ),
      lyricsAutoScroll:
        typeof patch.lyricsAutoScroll === "boolean"
          ? patch.lyricsAutoScroll
          : current.lyricsAutoScroll,
      autoplayClickBehavior:
        patch.autoplayClickBehavior && VALID_AUTOPLAY_CLICKS.has(patch.autoplayClickBehavior)
          ? patch.autoplayClickBehavior
          : current.autoplayClickBehavior,
    };

    const now = Date.now();
    this.db
      .query(
        `INSERT INTO user_preferences (user_id, playlist_sort, preferences_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           playlist_sort = excluded.playlist_sort,
           preferences_json = excluded.preferences_json,
           updated_at = excluded.updated_at`
      )
      .run(userId, next.playlistSort, JSON.stringify(next), now);

    return next;
  }

  reorderPlaylists(userId: string, orderedIds: string[]): PlaylistDTO[] {
    const custom = this.getUserPlaylists(userId).filter((p) => !p.isLiked);
    const byId = new Map(custom.map((p) => [p.id, p]));
    const nextOrder: string[] = [];
    const seen = new Set<string>();

    for (const id of orderedIds) {
      if (!seen.has(id) && byId.has(id)) {
        seen.add(id);
        nextOrder.push(id);
      }
    }
    for (const p of custom) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        nextOrder.push(p.id);
      }
    }

    const updateStmt = this.db.query(
      `UPDATE playlists SET sort_order = ? WHERE id = ? AND user_id = ?`
    );
    const tx = this.db.transaction((ids: string[]) => {
      ids.forEach((id, idx) => {
        updateStmt.run(idx, id, userId);
      });
    });
    tx(nextOrder);
    this.setUserPlaylistSort(userId, "manual");
    return this.getUserPlaylists(userId);
  }

  addTrackToPlaylist(userId: string, playlistId: string, track: TrackDTO): PlaylistDTO {
    return this.addTracksToPlaylist(userId, playlistId, [track]).playlist;
  }

  addTracksToPlaylist(
    userId: string,
    playlistId: string,
    tracks: TrackDTO[]
  ): { playlist: PlaylistDTO; added: number } {
    const playlist = this.getPlaylist(userId, playlistId);
    if (!playlist) {
      throw new Error("Playlist not found.");
    }
    const saveable = tracks.filter((t) => !t.isStream);
    if (tracks.length > 0 && saveable.length === 0) {
      throw new Error("Live streams cannot be saved to a playlist.");
    }
    const remaining = Math.max(0, 500 - playlist.tracks.length);
    if (tracks.length > 0 && remaining === 0) {
      throw new Error("Playlist limit of 500 tracks reached.");
    }

    const toAppend = saveable.slice(0, remaining);
    if (tracks.length > 0 && toAppend.length === 0) {
      throw new Error("No eligible tracks to save to playlist.");
    }

    const updatedTracks = [...playlist.tracks, ...toAppend];
    const now = Date.now();
    this.db
      .query(`UPDATE playlists SET tracks_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(JSON.stringify(updatedTracks), now, playlistId, userId);

    return {
      playlist: { ...playlist, tracks: updatedTracks, updatedAt: now },
      added: toAppend.length,
    };
  }

  removeTrackFromPlaylist(userId: string, playlistId: string, index: number): PlaylistDTO {
    const playlist = this.getPlaylist(userId, playlistId);
    if (!playlist) {
      throw new Error("Playlist not found.");
    }
    if (index < 0 || index >= playlist.tracks.length) {
      throw new Error("Track position is out of range.");
    }

    const updatedTracks = playlist.tracks.filter((_, idx) => idx !== index);
    const now = Date.now();
    this.db
      .query(`UPDATE playlists SET tracks_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(JSON.stringify(updatedTracks), now, playlistId, userId);

    return { ...playlist, tracks: updatedTracks, updatedAt: now };
  }

  recordPlayHistory(userId: string, track: TrackDTO): void {
    const now = Date.now();
    this.db
      .query(`INSERT INTO play_history (user_id, track_json, played_at) VALUES (?, ?, ?)`)
      .run(userId, JSON.stringify(track), now);

    // Keep at most 50 recent tracks per user.
    this.db
      .query(
        `DELETE FROM play_history
         WHERE user_id = ?
           AND id NOT IN (
             SELECT id FROM play_history WHERE user_id = ? ORDER BY played_at DESC, id DESC LIMIT 50
           )`
      )
      .run(userId, userId);
  }

  getPlayHistory(userId: string, limit = 30): HistoryEntryDTO[] {
    const rows = this.db
      .query<HistoryRow, [string, number]>(
        `SELECT id, user_id, track_json, played_at
         FROM play_history
         WHERE user_id = ?
         ORDER BY played_at DESC, id DESC
         LIMIT ?`
      )
      .all(userId, limit);

    const entries: HistoryEntryDTO[] = [];
    for (const row of rows) {
      try {
        const track = JSON.parse(row.track_json) as TrackDTO;
        entries.push({ id: row.id, track, playedAt: row.played_at });
      } catch {
        // Ignore corrupted history rows
      }
    }
    return entries;
  }

  clearPlayHistory(userId: string): void {
    this.db.query(`DELETE FROM play_history WHERE user_id = ?`).run(userId);
  }

  createSession(user: UserProfileDTO, accessToken: string, ttlMs = 30 * 24 * 60 * 60 * 1000): SessionRecord {
    const id = randomUUID();
    const expiresAt = Date.now() + ttlMs;
    this.db
      .query(
        `INSERT INTO sessions (id, user_id, username, global_name, avatar_url, access_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, user.id, user.username, user.globalName, user.avatarUrl, accessToken, expiresAt);

    return { id, user, accessToken, expiresAt };
  }

  getSession(sessionId: string): SessionRecord | null {
    const row = this.db
      .query<SessionRow, [string]>(
        `SELECT id, user_id, username, global_name, avatar_url, access_token, expires_at
         FROM sessions WHERE id = ?`
      )
      .get(sessionId);

    if (!row) return null;
    if (row.expires_at <= Date.now()) {
      this.deleteSession(sessionId);
      return null;
    }

    return {
      id: row.id,
      user: {
        id: row.user_id,
        username: row.username,
        globalName: row.global_name,
        avatarUrl: row.avatar_url,
      },
      accessToken: row.access_token,
      expiresAt: row.expires_at,
    };
  }

  deleteSession(sessionId: string): void {
    this.db.query(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  }

  pruneExpiredSessions(): void {
    this.db.query(`DELETE FROM sessions WHERE expires_at <= ?`).run(Date.now());
  }

  getAppConfig(): StoredAppConfig | null {
    const row = this.db
      .query<AppConfigRow, []>(
        `SELECT discord_token, discord_client_id, discord_client_secret, dashboard_url,
                bot_prefix, default_search_source, owner_user_id, setup_completed, updated_at
         FROM app_config WHERE id = 1`
      )
      .get();

    if (!row) return null;

    return {
      discordToken: row.discord_token,
      discordClientId: row.discord_client_id,
      discordClientSecret: row.discord_client_secret,
      dashboardUrl: row.dashboard_url,
      botPrefix: row.bot_prefix || "?",
      defaultSearchSource: (row.default_search_source || "ytmsearch") as SearchSource,
      ownerUserId: row.owner_user_id,
      setupCompleted: row.setup_completed === 1,
      updatedAt: row.updated_at,
    };
  }

  saveAppConfig(cfg: Omit<StoredAppConfig, "updatedAt">): StoredAppConfig {
    const updatedAt = Date.now();
    this.db
      .query(
        `INSERT INTO app_config (
           id, discord_token, discord_client_id, discord_client_secret,
           dashboard_url, bot_prefix, default_search_source, owner_user_id,
           setup_completed, updated_at
         ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           discord_token = excluded.discord_token,
           discord_client_id = excluded.discord_client_id,
           discord_client_secret = excluded.discord_client_secret,
           dashboard_url = excluded.dashboard_url,
           bot_prefix = excluded.bot_prefix,
           default_search_source = excluded.default_search_source,
           owner_user_id = excluded.owner_user_id,
           setup_completed = excluded.setup_completed,
           updated_at = excluded.updated_at`
      )
      .run(
        cfg.discordToken,
        cfg.discordClientId,
        cfg.discordClientSecret,
        cfg.dashboardUrl,
        cfg.botPrefix,
        cfg.defaultSearchSource,
        cfg.ownerUserId,
        cfg.setupCompleted ? 1 : 0,
        updatedAt
      );

    return { ...cfg, updatedAt };
  }

  close(): void {
    this.db.close();
  }

  private safeParseTracks(raw: string): TrackDTO[] {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as TrackDTO[]) : [];
    } catch {
      return [];
    }
  }
}
