import type { ServerWebSocket } from "bun";
import { PermissionsBitField } from "discord.js";
import type { Context } from "hono";
import { createBunWebSocket } from "hono/bun";
import { getCookie } from "hono/cookie";
import type { WSContext } from "hono/ws";
import type { ToastLevel, WsClientMessage, WsServerMessage } from "@shared/types";
import { getSessionFromContext } from "./auth";
import type { CadenceBot } from "./bot";
import type { CadenceDatabase, SessionRecord } from "./db";
import { fetchLyrics } from "./lyrics";

type RawSocket = ServerWebSocket<unknown>;

interface ClientMeta {
  session: SessionRecord;
  selectedGuildId: string | null;
}

export class CadenceWsHub {
  readonly upgradeWebSocket;
  readonly websocket;
  private clients = new Map<RawSocket, ClientMeta>();

  constructor(
    private bot: CadenceBot,
    private db: CadenceDatabase
  ) {
    const bunWs = createBunWebSocket<ServerWebSocket>();
    this.upgradeWebSocket = bunWs.upgradeWebSocket;
    this.websocket = bunWs.websocket;
  }

  handleUpgrade() {
    return async (c: Context, next: () => Promise<void>) => {
      const session = getSessionFromContext(c, this.db);
      if (!session) {
        return c.text("Unauthorized", 401);
      }

      let preferredGuildId: string | null = null;
      try {
        const rawUi = getCookie(c, "cadence_ui");
        if (rawUi) {
          const parsedUi = JSON.parse(decodeURIComponent(rawUi)) as { selectedGuildId?: unknown };
          if (typeof parsedUi?.selectedGuildId === "string") {
            preferredGuildId = parsedUi.selectedGuildId;
          }
        }
      } catch {
        // Ignore malformed UI cookie
      }

      const handler = this.upgradeWebSocket((_ctx) => {
        const selectedGuildId = this.findInitialGuildForUser(session.user.id, preferredGuildId);

        return {
          onOpen: (_event, ws) => {
            const rawWs = ws.raw;
            if (!rawWs) return;
            this.clients.set(rawWs, { session, selectedGuildId });
            this.sendInitialSnapshot(rawWs, session, selectedGuildId);
          },
          onMessage: async (event, ws) => {
            const rawWs = ws.raw;
            if (!rawWs) return;
            const raw = typeof event.data === "string" ? event.data : "";
            if (!raw) return;

            let msg: WsClientMessage;
            try {
              msg = JSON.parse(raw) as WsClientMessage;
            } catch {
              return;
            }

            await this.handleMessage(rawWs, msg);
          },
          onClose: (_event, ws) => {
            if (ws.raw) {
              this.clients.delete(ws.raw);
            }
          },
          onError: (_event, ws) => {
            if (ws.raw) {
              this.clients.delete(ws.raw);
            }
          },
        };
      });

      return handler(c, next);
    };
  }

  private findInitialGuildForUser(userId: string, preferredGuildId?: string | null): string | null {
    const guilds = [...this.bot.client.guilds.cache.values()];

    // 1. Guild where user is currently inside a voice channel
    for (const guild of guilds) {
      const member = guild.members.cache.get(userId);
      if (member?.voice.channelId) {
        return guild.id;
      }
    }

    // 2. Mutual guild that currently has an active player
    for (const guild of guilds) {
      if (guild.members.cache.has(userId) && this.bot.music.getPlayer(guild.id)) {
        return guild.id;
      }
    }

    // 3. Previously selected guild stored in cadence_ui cookie
    if (preferredGuildId) {
      const preferred = this.bot.client.guilds.cache.get(preferredGuildId);
      if (preferred && preferred.members.cache.has(userId)) {
        return preferred.id;
      }
    }

    // 4. Any mutual guild
    for (const guild of guilds) {
      if (guild.members.cache.has(userId)) {
        return guild.id;
      }
    }

    return null;
  }

  private send(rawWs: RawSocket, payload: WsServerMessage): void {
    try {
      rawWs.send(JSON.stringify(payload));
    } catch {
      this.clients.delete(rawWs);
    }
  }

  private sendToast(
    rawWs: RawSocket,
    level: "info" | "success" | "error",
    message: string
  ): void {
    this.send(rawWs, { type: "toast", level, message });
  }

  private sendPlaylists(rawWs: RawSocket, userId: string): void {
    this.send(rawWs, {
      type: "playlists",
      playlists: this.db.getUserPlaylists(userId),
      playlistSort: this.db.getUserPlaylistSort(userId),
    });
  }

  private sendHistoryPage(
    rawWs: RawSocket,
    userId: string,
    limit = 100,
    offset = 0
  ): void {
    const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
    const safeOffset = Math.max(0, Math.round(offset));
    const entries = this.db.getPlayHistory(userId, safeLimit, safeOffset);
    const total = this.db.getPlayHistoryCount(userId);
    this.send(rawWs, {
      type: "history",
      entries,
      total,
      hasMore: safeOffset + entries.length < total,
    });
  }

  private sendInitialSnapshot(
    rawWs: RawSocket,
    session: SessionRecord,
    selectedGuildId: string | null
  ): void {
    this.send(rawWs, { type: "ready", selectedGuildId });
    this.send(rawWs, { type: "meta", meta: this.bot.getBotMeta() });
    this.send(rawWs, {
      type: "preferences",
      preferences: this.db.getUserPreferences(session.user.id),
    });
    if (selectedGuildId) {
      const guild = this.bot.client.guilds.cache.get(selectedGuildId);
      if (guild && !guild.members.cache.has(session.user.id)) {
        void guild.members
          .fetch(session.user.id)
          .then(() => {
            this.send(rawWs, {
              type: "playerState",
              state: this.bot.music.serializePlayer(selectedGuildId, session.user.id),
            });
          })
          .catch(() => {});
      }
      this.send(rawWs, {
        type: "playerState",
        state: this.bot.music.serializePlayer(selectedGuildId, session.user.id),
      });
      if (this.bot.isGuildAdmin(selectedGuildId, session.user.id)) {
        const settings = this.db.getGuildSettings(selectedGuildId);
        this.send(rawWs, {
          type: "settings",
          settings: { ...settings, roles: this.bot.getGuildRoles(selectedGuildId) },
        });
      }
    }
    this.sendPlaylists(rawWs, session.user.id);
    this.send(rawWs, {
      type: "pinnedTracks",
      tracks: this.db.getPinnedTracks(session.user.id),
    });
    this.sendHistoryPage(rawWs, session.user.id, 100, 0);
  }

  notifyPlaylistsChanged(userId: string): void {
    for (const [rawWs, meta] of this.clients.entries()) {
      if (meta.session.user.id === userId) {
        this.sendPlaylists(rawWs, userId);
      }
    }
  }

  broadcastGuild(guildId: string): void {
    for (const [rawWs, meta] of this.clients.entries()) {
      if (meta.selectedGuildId === guildId) {
        this.send(rawWs, {
          type: "playerState",
          state: this.bot.music.serializePlayer(guildId, meta.session.user.id),
        });
      }
    }
  }

  broadcastToast(guildId: string, level: ToastLevel, message: string): void {
    for (const [rawWs, meta] of this.clients.entries()) {
      if (meta.selectedGuildId === guildId) {
        this.sendToast(rawWs, level, message);
      }
    }
  }

  broadcastMeta(): void {
    const meta = this.bot.getBotMeta();
    for (const [rawWs] of this.clients.entries()) {
      this.send(rawWs, { type: "meta", meta });
    }
  }

  private async ensureMemberInGuild(guildId: string, userId: string) {
    const guild = this.bot.client.guilds.cache.get(guildId);
    if (!guild) {
      throw new Error("Bot is not in the selected server.");
    }
    let member = guild.members.cache.get(userId);
    if (!member) {
      member = await guild.members.fetch(userId).catch(() => undefined);
    }
    if (!member) {
      throw new Error("You are not a member of that server.");
    }
    if (!this.bot.hasGuildAccess(guildId, userId)) {
      throw new Error("You don't have a Discord role with access to Cadence in this server.");
    }
    return { guild, member };
  }

  private async requireSameVoice(guildId: string, userId: string): Promise<string> {
    const { member } = await this.ensureMemberInGuild(guildId, userId);
    const vcId = member.voice.channelId;
    if (!vcId) {
      throw new Error("Join a voice channel in Discord first.");
    }
    const player = this.bot.music.getPlayer(guildId);
    if (player?.voiceChannelId && player.voiceChannelId !== vcId) {
      throw new Error("Join the same voice channel as Cadence first.");
    }
    return vcId;
  }

  private requirePrivileged(guildId: string, userId: string): void {
    if (!this.bot.music.isPrivileged(guildId, userId)) {
      throw new Error("Requires Manage Server, DJ role, or being alone in voice.");
    }
  }

  private async handleMessage(
    ws: RawSocket,
    msg: WsClientMessage
  ): Promise<void> {
    const meta = this.clients.get(ws);
    if (!meta) return;

    const user = meta.session.user;
    const requester = {
      id: user.id,
      username: user.globalName || user.username,
      avatarUrl: user.avatarUrl,
    };

    try {
      switch (msg.type) {
        case "ping": {
          this.send(ws, { type: "pong" });
          return;
        }

        case "selectGuild": {
          await this.ensureMemberInGuild(msg.guildId, user.id);
          meta.selectedGuildId = msg.guildId;
          this.send(ws, {
            type: "playerState",
            state: this.bot.music.serializePlayer(msg.guildId, user.id),
          });
          if (this.bot.isGuildAdmin(msg.guildId, user.id)) {
            const settings = this.db.getGuildSettings(msg.guildId);
            this.send(ws, {
              type: "settings",
              settings: { ...settings, roles: this.bot.getGuildRoles(msg.guildId) },
            });
          }
          return;
        }

        case "search": {
          const resolvedSource =
            msg.source === "auto"
              ? this.db.getUserPreferences(user.id).defaultSearchSource
              : msg.source;
          const { tracks, playlistName } = await this.bot.music.search(
            msg.query,
            resolvedSource,
            requester
          );
          this.send(ws, {
            type: "searchResults",
            query: msg.query,
            source: resolvedSource,
            tracks,
            playlistName,
          });
          return;
        }

        case "enqueue": {
          const vcId = await this.requireSameVoice(msg.guildId, user.id);
          const res = await this.bot.music.enqueue(
            msg.guildId,
            vcId,
            msg.tracks,
            msg.mode,
            requester,
            undefined,
            msg.queueName ? { queueName: msg.queueName } : undefined
          );
          const label =
            res.added === 1
              ? `Queued "${msg.tracks[0]?.title || "track"}"`
              : `Queued ${res.added} tracks`;
          this.sendToast(ws, "success", label);
          this.sendHistoryPage(ws, user.id, 100, 0);
          return;
        }

        case "startMix": {
          const vcId = await this.requireSameVoice(msg.guildId, user.id);
          const res = await this.bot.music.startMix(msg.guildId, vcId, msg.track, requester);
          const suffix = res.added > 0 ? ` (+${res.added} tracks)` : "";
          this.sendToast(ws, "success", `Started mix for "${msg.track.title}"${suffix}`);
          this.sendHistoryPage(ws, user.id, 100, 0);
          return;
        }

        case "playTrack": {
          await this.requireSameVoice(msg.guildId, user.id);
          const prefs = this.db.getUserPreferences(user.id);
          const action = await this.bot.music.playTrack(
            msg.guildId,
            msg.index,
            prefs.autoplayClickBehavior
          );
          if (action === "queued_next") {
            this.sendToast(ws, "info", "Moved track to Play Next");
          } else if (action === "queued_end") {
            this.sendToast(ws, "info", "Added track to end of queue");
          }
          return;
        }

        case "playPrevious": {
          await this.requireSameVoice(msg.guildId, user.id);
          await this.bot.music.playPrevious(msg.guildId, msg.index);
          return;
        }

        case "pause": {
          await this.requireSameVoice(msg.guildId, user.id);
          await this.bot.music.setPause(msg.guildId, true);
          return;
        }

        case "resume": {
          await this.requireSameVoice(msg.guildId, user.id);
          await this.bot.music.setPause(msg.guildId, false);
          return;
        }

        case "skip": {
          await this.requireSameVoice(msg.guildId, user.id);
          await this.bot.music.skip(msg.guildId, 1);
          return;
        }

        case "previous": {
          await this.requireSameVoice(msg.guildId, user.id);
          await this.bot.music.previous(msg.guildId);
          return;
        }

        case "seek": {
          await this.requireSameVoice(msg.guildId, user.id);
          await this.bot.music.seek(msg.guildId, msg.position);
          return;
        }

        case "volume": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.setVolume(msg.guildId, msg.volume);
          return;
        }

        case "repeat": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.setRepeatMode(msg.guildId, msg.mode);
          return;
        }

        case "shuffle": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          const count = await this.bot.music.shuffle(msg.guildId);
          this.sendToast(ws, "info", `Shuffled ${count} tracks`);
          return;
        }

        case "moveTrack": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.moveTrack(msg.guildId, msg.from, msg.to);
          return;
        }

        case "movePreviousTrack": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.movePreviousTrack(msg.guildId, msg.from, msg.to);
          return;
        }

        case "movePreviousToQueue": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.movePreviousToQueue(msg.guildId, msg.previousIndex, msg.queueIndex);
          return;
        }

        case "moveQueueToPrevious": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.moveQueueToPrevious(msg.guildId, msg.queueIndex, msg.previousIndex);
          return;
        }

        case "moveCurrentToQueue": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.moveCurrentToQueue(msg.guildId, msg.queueIndex);
          return;
        }

        case "moveCurrentToPrevious": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.moveCurrentToPrevious(msg.guildId, msg.previousIndex);
          return;
        }

        case "removeTrack": {
          await this.requireSameVoice(msg.guildId, user.id);
          if (!this.bot.music.canRemoveTrack(msg.guildId, user.id, msg.index)) {
            throw new Error("Requires DJ role, admin permissions, or being the track requester.");
          }
          await this.bot.music.removeTrack(msg.guildId, msg.index);
          this.sendToast(ws, "info", "Removed track from queue");
          return;
        }

        case "removePreviousTrack": {
          await this.requireSameVoice(msg.guildId, user.id);
          if (!this.bot.music.canRemovePreviousTrack(msg.guildId, user.id, msg.index)) {
            throw new Error("Requires DJ role, admin permissions, or being the track requester.");
          }
          await this.bot.music.removePreviousTrack(msg.guildId, msg.index);
          this.sendToast(ws, "info", "Removed track from queue");
          return;
        }

        case "clearQueue": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.clearQueue(msg.guildId);
          this.sendToast(ws, "info", "Cleared upcoming queue");
          return;
        }

        case "dismissQueue": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.dismissQueue(msg.guildId);
          this.sendToast(ws, "info", "Dismissed queue");
          return;
        }

        case "stop": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.stop(msg.guildId);
          this.sendToast(ws, "info", "Disconnected player");
          return;
        }

        case "toggleAutoplay": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.toggleAutoplay(msg.guildId, msg.enabled, user.id);
          this.sendToast(ws, "info", `Autoplay ${msg.enabled ? "enabled" : "disabled"}`);
          return;
        }

        case "setAutoplayMood": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.setAutoplayMood(msg.guildId, msg.mood, user.id);
          return;
        }

        case "setFilter": {
          await this.requireSameVoice(msg.guildId, user.id);
          this.requirePrivileged(msg.guildId, user.id);
          await this.bot.music.applyFilter(msg.guildId, msg.preset);
          this.sendToast(
            ws,
            "info",
            msg.preset === "none" ? "Filters reset" : `Applied ${msg.preset} filter`
          );
          return;
        }

        case "getLyrics": {
          const state = this.bot.music.serializePlayer(msg.guildId, user.id);
          const title = msg.title || state.current?.title;
          const artist = msg.artist || state.current?.author || "";
          const duration = msg.duration ?? state.current?.duration;
          if (!title) {
            this.send(ws, { type: "lyrics", guildId: msg.guildId, lyrics: null });
            return;
          }
          const lyrics = await fetchLyrics(
            title,
            artist,
            duration,
            this.bot.music.getPlayer(msg.guildId)
          );
          this.send(ws, {
            type: "lyrics",
            guildId: msg.guildId,
            lyrics,
            title,
            artist,
          });
          return;
        }

        case "getSettings": {
          await this.ensureMemberInGuild(msg.guildId, user.id);
          if (!this.bot.isGuildAdmin(msg.guildId, user.id)) {
            throw new Error("Server settings require Admin role, Manage Server permission, or Owner access.");
          }
          const settings = this.db.getGuildSettings(msg.guildId);
          this.send(ws, {
            type: "settings",
            settings: { ...settings, roles: this.bot.getGuildRoles(msg.guildId) },
          });
          return;
        }

        case "updateSettings": {
          await this.ensureMemberInGuild(msg.guildId, user.id);
          if (!this.bot.isGuildAdmin(msg.guildId, user.id)) {
            throw new Error("Server settings require Admin role, Manage Server permission, or Owner access.");
          }
          const updated = this.db.updateGuildSettings(msg.guildId, msg.settings);
          this.bot.music.onGuildSettingsUpdated(msg.guildId);
          if (
            msg.settings.pauseOnEmpty !== undefined ||
            msg.settings.pauseOnEmptySeconds !== undefined
          ) {
            const prefs = this.db.updateUserPreferences(user.id, {
              pauseOnEmpty: updated.pauseOnEmpty,
              pauseOnEmptySeconds: updated.pauseOnEmptySeconds,
            });
            this.send(ws, { type: "preferences", preferences: prefs });
          }
          this.send(ws, {
            type: "settings",
            settings: { ...updated, roles: this.bot.getGuildRoles(msg.guildId) },
          });
          this.sendToast(ws, "success", "Server settings saved");
          this.broadcastGuild(msg.guildId);
          return;
        }

        case "getPlaylists": {
          this.sendPlaylists(ws, user.id);
          return;
        }

        case "createPlaylist": {
          const created = this.db.createPlaylist(user.id, msg.name);
          this.sendPlaylists(ws, user.id);
          this.sendToast(ws, "success", `Created playlist "${created.name}"`);
          return;
        }

        case "createPlaylistWithTracks": {
          const created = this.db.createPlaylist(user.id, msg.name);
          if (msg.tracks.length > 0) {
            const res = this.db.addTracksToPlaylist(user.id, created.id, msg.tracks);
            this.sendPlaylists(ws, user.id);
            this.sendToast(
              ws,
              "success",
              `Created "${created.name}" with ${res.added} track${res.added === 1 ? "" : "s"}`
            );
          } else {
            this.sendPlaylists(ws, user.id);
            this.sendToast(ws, "success", `Created playlist "${created.name}"`);
          }
          return;
        }

        case "importPlaylist": {
          const url = msg.url.trim();
          if (!/^https?:\/\/\S+$/i.test(url)) {
            throw new Error("Please provide a valid http:// or https:// playlist URL.");
          }
          const { tracks, playlistName } = await this.bot.music.search(url, "auto", requester);
          if (tracks.length === 0) {
            throw new Error("No tracks found at that playlist URL.");
          }
          const customName = msg.name?.trim();
          const created = this.db.createSyncedPlaylist(
            user.id,
            customName || playlistName || "Imported Playlist",
            url,
            tracks,
            Boolean(customName)
          );
          this.sendPlaylists(ws, user.id);
          this.sendToast(
            ws,
            "success",
            `Saved & synced "${created.name}" (${created.tracks.length} tracks)`
          );
          return;
        }

        case "syncPlaylist": {
          const playlist = this.db.getPlaylist(user.id, msg.playlistId);
          if (!playlist) {
            throw new Error("Playlist not found.");
          }
          const targetUrl = (msg.url?.trim() || playlist.sourceUrl || "").trim();
          if (!/^https?:\/\/\S+$/i.test(targetUrl)) {
            throw new Error("No valid source URL linked to this playlist.");
          }
          const { tracks } = await this.bot.music.search(targetUrl, "auto", requester);
          if (tracks.length === 0) {
            throw new Error("No tracks found at the linked URL.");
          }
          const res = this.db.syncPlaylistTracks(user.id, playlist.id, tracks, targetUrl);
          this.sendPlaylists(ws, user.id);
          const delta =
            res.added || res.removed ? `, +${res.added} / -${res.removed}` : ", already up to date";
          this.sendToast(ws, "success", `Synced "${res.playlist.name}" (${res.total} tracks${delta})`);
          return;
        }

        case "renamePlaylist": {
          const renamed = this.db.renamePlaylist(user.id, msg.playlistId, msg.name);
          this.sendPlaylists(ws, user.id);
          this.sendToast(ws, "success", `Renamed playlist to "${renamed.name}"`);
          return;
        }

        case "deletePlaylist": {
          this.db.deletePlaylist(user.id, msg.playlistId);
          this.sendPlaylists(ws, user.id);
          this.sendToast(ws, "info", "Deleted playlist");
          return;
        }

        case "togglePinPlaylist": {
          const res = this.db.togglePinPlaylist(user.id, msg.playlistId);
          this.sendPlaylists(ws, user.id);
          this.sendToast(
            ws,
            res.pinned ? "success" : "info",
            res.pinned ? `Pinned "${res.playlist.name}"` : `Unpinned "${res.playlist.name}"`
          );
          return;
        }

        case "addTrackToPlaylist": {
          const updated = this.db.addTrackToPlaylist(user.id, msg.playlistId, msg.track);
          this.sendPlaylists(ws, user.id);
          this.sendToast(ws, "success", `Added "${msg.track.title}" to "${updated.name}"`);
          return;
        }

        case "addTracksToPlaylist": {
          const res = this.db.addTracksToPlaylist(user.id, msg.playlistId, msg.tracks);
          this.sendPlaylists(ws, user.id);
          this.sendToast(
            ws,
            "success",
            `Saved ${res.added} track${res.added === 1 ? "" : "s"} to "${res.playlist.name}"`
          );
          return;
        }

        case "removeTrackFromPlaylist": {
          this.db.removeTrackFromPlaylist(user.id, msg.playlistId, msg.index);
          this.sendPlaylists(ws, user.id);
          this.sendToast(ws, "info", "Removed track from playlist");
          return;
        }

        case "reorderPlaylistTracks": {
          this.db.reorderPlaylistTracks(user.id, msg.playlistId, msg.fromIndex, msg.toIndex);
          this.sendPlaylists(ws, user.id);
          return;
        }

        case "toggleLike": {
          const res = this.db.toggleLikedTrack(user.id, msg.track);
          this.sendPlaylists(ws, user.id);
          this.sendToast(
            ws,
            res.liked ? "success" : "info",
            res.liked
              ? `Added "${msg.track.title}" to Liked Music`
              : `Removed "${msg.track.title}" from Liked Music`
          );
          return;
        }

        case "togglePinTrack": {
          const res = this.db.togglePinTrack(user.id, msg.track);
          this.send(ws, { type: "pinnedTracks", tracks: res.pinnedTracks });
          this.sendToast(
            ws,
            res.pinned ? "success" : "info",
            res.pinned
              ? `Pinned "${msg.track.title}" to Listen again`
              : `Unpinned "${msg.track.title}" from Listen again`
          );
          return;
        }

        case "reorderPinnedTracks": {
          const tracks = this.db.reorderPinnedTracks(user.id, msg.trackIds);
          this.send(ws, { type: "pinnedTracks", tracks });
          return;
        }

        case "setPlaylistSort": {
          this.db.setUserPlaylistSort(user.id, msg.sort);
          this.sendPlaylists(ws, user.id);
          return;
        }

        case "reorderPlaylists": {
          this.db.reorderPlaylists(user.id, msg.playlistIds);
          this.sendPlaylists(ws, user.id);
          return;
        }

        case "playPlaylist": {
          const playlist = this.db.getPlaylist(user.id, msg.playlistId);
          if (!playlist) {
            throw new Error("Playlist not found.");
          }
          if (playlist.tracks.length === 0) {
            throw new Error("Playlist is empty.");
          }
          const vcId = await this.requireSameVoice(msg.guildId, user.id);
          const tracks = [...playlist.tracks];
          if (msg.shuffle) {
            for (let i = tracks.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
            }
          }

          this.db.markPlaylistPlayed(user.id, playlist.id);
          this.sendPlaylists(ws, user.id);

          const startIndex =
            !msg.shuffle &&
            typeof msg.startIndex === "number" &&
            msg.startIndex > 0 &&
            msg.startIndex < tracks.length
              ? msg.startIndex
              : 0;

          const res = await this.bot.music.enqueue(
            msg.guildId,
            vcId,
            startIndex > 0 ? tracks.slice(startIndex) : tracks,
            "replace",
            requester,
            undefined,
            {
              ...(startIndex > 0 ? { previousTracks: tracks.slice(0, startIndex) } : {}),
              queueName: playlist.name,
            }
          );
          this.sendToast(
            ws,
            "success",
            `Playing "${playlist.name}" (${res.added} track${res.added === 1 ? "" : "s"})`
          );
          return;
        }

        case "getHistory": {
          this.sendHistoryPage(ws, user.id, msg.limit ?? 100, msg.offset ?? 0);
          return;
        }

        case "updatePreferences": {
          const prefs = this.db.updateUserPreferences(user.id, msg.preferences);
          this.send(ws, { type: "preferences", preferences: prefs });
          if (
            meta.selectedGuildId &&
            (msg.preferences.pauseOnEmpty !== undefined ||
              msg.preferences.pauseOnEmptySeconds !== undefined) &&
            (this.bot.isGuildAdmin(meta.selectedGuildId, user.id) ||
              this.bot.music.isPrivileged(meta.selectedGuildId, user.id))
          ) {
            const updatedSettings = this.db.updateGuildSettings(meta.selectedGuildId, {
              ...(msg.preferences.pauseOnEmpty !== undefined
                ? { pauseOnEmpty: prefs.pauseOnEmpty }
                : {}),
              ...(msg.preferences.pauseOnEmptySeconds !== undefined
                ? { pauseOnEmptySeconds: prefs.pauseOnEmptySeconds }
                : {}),
            });
            this.bot.music.onGuildSettingsUpdated(meta.selectedGuildId);
            this.send(ws, {
              type: "settings",
              settings: {
                ...updatedSettings,
                roles: this.bot.getGuildRoles(meta.selectedGuildId),
              },
            });
            this.broadcastGuild(meta.selectedGuildId);
          }
          if (msg.preferences.playlistSort) {
            this.sendPlaylists(ws, user.id);
          }
          return;
        }

        case "clearHistory": {
          this.db.clearPlayHistory(user.id);
          this.send(ws, { type: "history", entries: [], total: 0, hasMore: false });
          this.sendToast(ws, "info", "Play history cleared");
          return;
        }

        case "removeHistoryEntry": {
          const removed = this.db.removePlayHistoryEntry(user.id, {
            historyId: msg.historyId,
            trackIdentifier: msg.trackIdentifier,
          });
          this.sendHistoryPage(ws, user.id, 100, 0);
          if (removed) {
            this.sendToast(ws, "info", "Removed from play history");
          }
          return;
        }
      }
    } catch (error) {
      console.error("[WS] Failed to handle message:", msg.type, error);
      this.sendToast(
        ws,
        "error",
        error instanceof Error ? error.message : "Operation failed."
      );
    }
  }
}
