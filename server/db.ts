import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  GuildSettingsDTO,
  HistoryEntryDTO,
  PlaylistDTO,
  SearchSource,
  TrackDTO,
  UserProfileDTO,
} from "@shared/types";
import { config } from "./config";

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
  created_at: number;
  updated_at: number;
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
    `);
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
      defaultVolume: row.default_volume,
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
          ? Math.max(0, Math.min(150, Math.round(patch.defaultVolume)))
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

  getUserPlaylists(userId: string): PlaylistDTO[] {
    const rows = this.db
      .query<PlaylistRow, [string]>(
        `SELECT id, user_id, name, tracks_json, created_at, updated_at
         FROM playlists WHERE user_id = ? ORDER BY updated_at DESC`
      )
      .all(userId);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      tracks: this.safeParseTracks(row.tracks_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getPlaylist(userId: string, playlistId: string): PlaylistDTO | null {
    const row = this.db
      .query<PlaylistRow, [string, string]>(
        `SELECT id, user_id, name, tracks_json, created_at, updated_at
         FROM playlists WHERE id = ? AND user_id = ?`
      )
      .get(playlistId, userId);

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      tracks: this.safeParseTracks(row.tracks_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  findPlaylistByName(userId: string, name: string): PlaylistDTO | null {
    const row = this.db
      .query<PlaylistRow, [string, string]>(
        `SELECT id, user_id, name, tracks_json, created_at, updated_at
         FROM playlists WHERE user_id = ? AND lower(name) = lower(?) LIMIT 1`
      )
      .get(userId, name.trim());

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      tracks: this.safeParseTracks(row.tracks_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  createPlaylist(userId: string, rawName: string): PlaylistDTO {
    const name = rawName.trim().slice(0, 60);
    if (!name) {
      throw new Error("Playlist name cannot be empty.");
    }

    const existing = this.getUserPlaylists(userId);
    if (existing.length >= 25) {
      throw new Error("Maximum of 25 playlists reached.");
    }
    if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Playlist "${name}" already exists.`);
    }

    const now = Date.now();
    const id = randomUUID();
    this.db
      .query(
        `INSERT INTO playlists (id, user_id, name, tracks_json, created_at, updated_at)
         VALUES (?, ?, ?, '[]', ?, ?)`
      )
      .run(id, userId, name, now, now);

    return { id, name, tracks: [], createdAt: now, updatedAt: now };
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
    const result = this.db
      .query(`DELETE FROM playlists WHERE id = ? AND user_id = ?`)
      .run(playlistId, userId);
    return result.changes > 0;
  }

  addTrackToPlaylist(userId: string, playlistId: string, track: TrackDTO): PlaylistDTO {
    const playlist = this.getPlaylist(userId, playlistId);
    if (!playlist) {
      throw new Error("Playlist not found.");
    }
    if (track.isStream) {
      throw new Error("Live streams cannot be saved to a playlist.");
    }
    if (playlist.tracks.length >= 500) {
      throw new Error("Playlist limit of 500 tracks reached.");
    }

    const updatedTracks = [...playlist.tracks, track];
    const now = Date.now();
    this.db
      .query(`UPDATE playlists SET tracks_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(JSON.stringify(updatedTracks), now, playlistId, userId);

    return { ...playlist, tracks: updatedTracks, updatedAt: now };
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
