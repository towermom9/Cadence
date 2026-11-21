import { PermissionsBitField, type Client, type GuildMember, type User } from "discord.js";
import {
  LavalinkManager,
  type LavalinkNode,
  type Player,
  type SearchPlatform,
  type Track,
  type UnresolvedTrack,
} from "lavalink-client";
import type {
  ArtistProfileDTO,
  EnqueueMode,
  FilterPreset,
  ListenerDTO,
  PlayerStateDTO,
  RepeatModeType,
  SearchSource,
  ToastLevel,
  TrackDTO,
} from "@shared/types";
import { config } from "./config";
import type { CadenceDatabase } from "./db";

export interface RequesterInfo {
  id: string;
  username: string;
  avatarUrl: string | null;
}

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

function isUrl(input: string): boolean {
  return /^https?:\/\/\S+$/i.test(input.trim());
}

export function userToRequester(user: User | GuildMember): RequesterInfo {
  if ("user" in user) {
    return {
      id: user.id,
      username: user.displayName || user.user.globalName || user.user.username,
      avatarUrl: user.user.displayAvatarURL({ size: 64 }),
    };
  }
  return {
    id: user.id,
    username: user.globalName || user.username,
    avatarUrl: user.displayAvatarURL({ size: 64 }),
  };
}

function extractRequester(raw: unknown): RequesterInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.id === "string" && typeof candidate.username === "string") {
    return {
      id: candidate.id,
      username: candidate.username,
      avatarUrl: typeof candidate.avatarUrl === "string" ? candidate.avatarUrl : null,
    };
  }
  return undefined;
}

const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function normalizeArtworkUrl(
  rawUrl: string | null | undefined,
  sourceName: string,
  identifier: string,
  uri?: string | null
): string | null {
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (
        parsed.hostname === "yt3.googleusercontent.com" ||
        parsed.hostname === "lh3.googleusercontent.com"
      ) {
        return rawUrl.replace(/=w\d+-h\d+[^/?#]*$/i, "=w544-h544-l90-rj");
      }
      return rawUrl;
    } catch {
      return rawUrl;
    }
  }

  const looksLikeYouTube =
    sourceName === "youtube" ||
    Boolean(uri && (uri.includes("youtube.com") || uri.includes("youtu.be")));
  if (looksLikeYouTube && YOUTUBE_ID_REGEX.test(identifier)) {
    return `https://i.ytimg.com/vi/${identifier}/hqdefault.jpg`;
  }

  return null;
}

export function trackToDTO(track: Track | UnresolvedTrack): TrackDTO {
  const info = track.info;
  const identifier = info.identifier || `${info.title ?? "unknown"}:${info.author ?? "unknown"}`;
  const sourceName = info.sourceName || "unknown";
  const rawArtwork = info.artworkUrl ?? track.pluginInfo?.artworkUrl ?? null;

  return {
    encoded: track.encoded || "",
    identifier,
    title: info.title || "Unknown Title",
    author: info.author || "Unknown Artist",
    duration: typeof info.duration === "number" ? info.duration : 0,
    uri: info.uri ?? null,
    artworkUrl: normalizeArtworkUrl(rawArtwork, sourceName, identifier, info.uri),
    sourceName,
    isStream: Boolean(info.isStream),
    requester: extractRequester(track.requester) ?? extractRequester(track.userData?.requester),
  };
}

export class MusicService {
  readonly manager: LavalinkManager;
  private activeFilters = new Map<string, FilterPreset>();
  private autoplayOverrides = new Map<string, boolean>();
  private inactivityTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastPositionBroadcast = new Map<string, number>();
  private onStateChange: (guildId: string) => void;
  private onGuildToast: (guildId: string, level: ToastLevel, message: string) => void;

  constructor(
    private client: Client,
    private db: CadenceDatabase,
    onStateChange?: (guildId: string) => void,
    onGuildToast?: (guildId: string, level: ToastLevel, message: string) => void
  ) {
    this.onStateChange = onStateChange ?? (() => {});
    this.onGuildToast = onGuildToast ?? (() => {});

    this.manager = new LavalinkManager({
      nodes: [
        {
          id: "main",
          host: config.lavalink.host,
          port: config.lavalink.port,
          authorization: config.lavalink.password,
          secure: config.lavalink.secure,
          retryAmount: 1000,
          retryDelay: 5000,
        },
      ],
      sendToShard: (guildId, payload) => {
        const guild = this.client.guilds.cache.get(guildId);
        if (guild) {
          guild.shard.send(payload);
        }
      },
      autoSkip: true,
      catchLifeCycleRejections: true,
      queueOptions: {
        maxPreviousTracks: 25,
      },
      playerOptions: {
        defaultSearchPlatform: config.defaultSearchSource as SearchPlatform,
        clientBasedPositionUpdateInterval: 250,
        requesterTransformer: (requester) => extractRequester(requester) ?? requester,
        onDisconnect: {
          autoReconnect: true,
          destroyPlayer: false,
        },
        onEmptyQueue: {
          autoPlayFunction: async (player, lastPlayedTrack) => {
            await this.handleAutoplay(player, lastPlayedTrack);
          },
        },
      },
    });

    this.registerEvents();
  }

  setStateChangeHandler(handler: (guildId: string) => void): void {
    this.onStateChange = handler;
  }

  setToastHandler(handler: (guildId: string, level: ToastLevel, message: string) => void): void {
    this.onGuildToast = handler;
  }

  private registerEvents(): void {
    this.manager.nodeManager.on("connect", (node) => {
      console.log(`[Lavalink] Node "${node.id}" connected.`);
    });

    this.manager.nodeManager.on("disconnect", (node, reason) => {
      console.warn(`[Lavalink] Node "${node.id}" disconnected:`, reason.reason || reason.code);
    });

    this.manager.nodeManager.on("error", (node, error) => {
      console.error(`[Lavalink] Node "${node.id}" error:`, error.message);
    });

    this.manager.on("playerCreate", (player) => {
      const settings = this.db.getGuildSettings(player.guildId);
      if (!this.autoplayOverrides.has(player.guildId)) {
        this.autoplayOverrides.set(player.guildId, settings.autoplay);
      }
      this.onStateChange(player.guildId);
    });

    this.manager.on("playerDestroy", (player) => {
      this.clearInactivityTimer(player.guildId);
      this.activeFilters.delete(player.guildId);
      this.autoplayOverrides.delete(player.guildId);
      this.lastPositionBroadcast.delete(player.guildId);
      this.onStateChange(player.guildId);
    });

    this.manager.on("trackStart", (player, track) => {
      this.clearInactivityTimer(player.guildId);
      if (track) {
        const dto = trackToDTO(track);
        const requesterId = dto.requester?.id;
        if (requesterId && requesterId !== this.client.user?.id) {
          this.db.recordPlayHistory(requesterId, dto);
        }
        // Also record for non-bot voice listeners so Discover "Recently Played" stays rich
        const guild = this.client.guilds.cache.get(player.guildId);
        const channel = player.voiceChannelId ? guild?.channels.cache.get(player.voiceChannelId) : null;
        if (channel && channel.isVoiceBased()) {
          for (const member of channel.members.values()) {
            if (!member.user.bot && member.id !== requesterId) {
              this.db.recordPlayHistory(member.id, dto);
            }
          }
        }
      }
      this.onStateChange(player.guildId);
    });

    this.manager.on("trackEnd", (player) => {
      this.onStateChange(player.guildId);
    });

    this.manager.on("trackError", (player, track, payload) => {
      const title = track?.info?.title || "Unknown Track";
      const rawMessage = payload.exception?.message || payload.error || "Unknown playback error";
      const rawCause = payload.exception?.cause || "";
      console.error(`[Music] Track error in guild ${player.guildId} (${title}):`, payload.exception ?? rawMessage);

      const userMessage = /AllClientsFailed|requires login|not a bot|Sign in/i.test(
        `${rawMessage} ${rawCause}`
      )
        ? `Playback failed for "${title}": YouTube blocked anonymous playback on this IP. Try enabling YT_OAUTH_ENABLED=true in .env or using another source.`
        : `Playback failed for "${title}": ${rawMessage}`;

      this.onGuildToast(player.guildId, "error", userMessage);
      this.onStateChange(player.guildId);
    });

    this.manager.on("trackStuck", (player, track, payload) => {
      const title = track?.info?.title || "Unknown Track";
      console.warn(
        `[Music] Track stuck in guild ${player.guildId} (${title}) after ${payload.thresholdMs}ms`
      );
      this.onGuildToast(player.guildId, "error", `Track "${title}" got stuck and was skipped.`);
      this.onStateChange(player.guildId);
    });

    this.manager.on("queueEnd", (player) => {
      this.scheduleInactivityCheck(player.guildId);
      this.onStateChange(player.guildId);
    });

    this.manager.on("playerPaused", (player) => {
      this.onStateChange(player.guildId);
    });

    this.manager.on("playerResumed", (player) => {
      this.onStateChange(player.guildId);
    });

    this.manager.on("playerClientUpdate", (_oldJson, player) => {
      this.onStateChange(player.guildId);
    });

    this.manager.on("playerUpdate", (_oldJson, player) => {
      const now = Date.now();
      const last = this.lastPositionBroadcast.get(player.guildId) ?? 0;
      if (now - last >= 1000) {
        this.lastPositionBroadcast.set(player.guildId, now);
        this.onStateChange(player.guildId);
      }
    });
  }

  async init(clientId: string, username?: string): Promise<void> {
    if (this.manager.initiated) return;
    await this.manager.init({ id: clientId, username: username || "Cadence" });
  }

  isLavalinkConnected(): boolean {
    for (const node of this.manager.nodeManager.nodes.values()) {
      if (node.connected) return true;
    }
    return false;
  }

  private getConnectedNode(): LavalinkNode {
    const leastUsed = this.manager.nodeManager.leastUsedNodes();
    const connected = leastUsed.find((n) => n.connected);
    if (connected) return connected;

    for (const node of this.manager.nodeManager.nodes.values()) {
      if (node.connected) return node;
    }
    throw new Error("Audio engine (Lavalink) is not connected yet.");
  }

  getPlayer(guildId: string): Player | undefined {
    return this.manager.getPlayer(guildId);
  }

  async ensurePlayer(
    guildId: string,
    voiceChannelId: string,
    textChannelId?: string
  ): Promise<Player> {
    const existing = this.manager.getPlayer(guildId);
    if (existing) {
      if (!existing.connected) {
        await existing.connect();
      }
      if (textChannelId && !existing.textChannelId) {
        existing.textChannelId = textChannelId;
      }
      return existing;
    }

    const settings = this.db.getGuildSettings(guildId);
    const player = this.manager.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId,
      selfDeaf: true,
      selfMute: false,
      volume: settings.defaultVolume,
      instaUpdateFiltersFix: true,
    });

    if (!player.connected) {
      await player.connect();
    }
    return player;
  }

  async search(
    query: string,
    source: SearchSource,
    requester?: RequesterInfo
  ): Promise<{ tracks: TrackDTO[]; playlistName: string | null }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return { tracks: [], playlistName: null };
    }

    const node = this.getConnectedNode();
    const resolvedSource: SearchPlatform | undefined =
      isUrl(trimmed) || source === "auto"
        ? isUrl(trimmed)
          ? undefined
          : (config.defaultSearchSource as SearchPlatform)
        : (source as SearchPlatform);

    const result = await node.search(
      resolvedSource ? { query: trimmed, source: resolvedSource } : { query: trimmed },
      requester
    );

    if (result.loadType === "error") {
      throw new Error(result.exception?.message || "Failed to load tracks from audio source.");
    }

    const tracks = result.tracks.map((track) => {
      const dto = trackToDTO(track);
      if (requester) dto.requester = requester;
      return dto;
    });

    return {
      tracks,
      playlistName: result.loadType === "playlist" ? result.playlist?.name ?? null : null,
    };
  }

  private dtoToLavalinkTrack(dto: TrackDTO, requester: RequesterInfo): Track | UnresolvedTrack {
    if (dto.encoded) {
      return this.manager.utils.buildTrack(
        {
          encoded: dto.encoded,
          info: {
            identifier: dto.identifier,
            title: dto.title,
            author: dto.author,
            length: dto.duration,
            artworkUrl: dto.artworkUrl,
            uri: dto.uri || "",
            sourceName: dto.sourceName as Track["info"]["sourceName"],
            isSeekable: !dto.isStream,
            isStream: dto.isStream,
            isrc: null,
          },
          pluginInfo: {},
        },
        requester
      );
    }

    return this.manager.utils.buildUnresolvedTrack(
      {
        title: dto.title,
        author: dto.author,
        uri: dto.uri ?? undefined,
        duration: dto.duration,
        artworkUrl: dto.artworkUrl,
      },
      requester
    );
  }

  private pushPrevious(
    player: Player,
    track: Track | UnresolvedTrack | null | undefined
  ): void {
    if (!track) return;
    player.queue.previous.unshift(track as Track);
    const maxPrev = player.queue.options?.maxPreviousTracks || 25;
    if (player.queue.previous.length > maxPrev) {
      player.queue.previous.splice(maxPrev);
    }
  }

  private async fetchRelatedLavalinkTracks(
    seedTrack: Pick<TrackDTO, "identifier" | "title" | "author" | "sourceName" | "uri">,
    requester?: RequesterInfo,
    limit = 20
  ): Promise<(Track | UnresolvedTrack)[]> {
    const node = this.getConnectedNode();
    const candidatePool: (Track | UnresolvedTrack)[] = [];

    const looksLikeYouTube =
      YOUTUBE_ID_REGEX.test(seedTrack.identifier) &&
      (seedTrack.sourceName === "youtube" ||
        Boolean(seedTrack.uri?.includes("youtube")) ||
        Boolean(seedTrack.uri?.includes("youtu.be")));

    if (looksLikeYouTube) {
      try {
        const mixUrl = `https://www.youtube.com/watch?v=${seedTrack.identifier}&list=RD${seedTrack.identifier}`;
        const mixResult = await node.search({ query: mixUrl }, requester);
        if (mixResult.loadType !== "error") {
          candidatePool.push(...mixResult.tracks);
        }
      } catch (error) {
        console.warn(`[Mix] YouTube RD mix lookup failed for ${seedTrack.identifier}:`, error);
      }
    }

    const nonSeedFromMix = candidatePool.filter(
      (t) => !t.info.isStream && t.info.identifier !== seedTrack.identifier
    );
    if (nonSeedFromMix.length < 2) {
      try {
        const fallbackQuery = `${seedTrack.author} ${seedTrack.title}`.trim() || seedTrack.title;
        if (fallbackQuery) {
          const searchResult = await node.search(
            { query: fallbackQuery, source: "ytmsearch" },
            requester
          );
          if (searchResult.loadType !== "error") {
            candidatePool.push(...searchResult.tracks);
          }
        }
      } catch (error) {
        console.warn(`[Mix] Fallback ytmsearch failed for ${seedTrack.title}:`, error);
      }
    }

    const seenIds = new Set<string>(seedTrack.identifier ? [seedTrack.identifier] : []);
    const related: (Track | UnresolvedTrack)[] = [];
    for (const candidate of candidatePool) {
      if (candidate.info.isStream) continue;
      const cid = candidate.info.identifier;
      if (cid && seenIds.has(cid)) continue;
      if (cid) seenIds.add(cid);
      related.push(candidate);
      if (related.length >= limit) break;
    }

    return related;
  }

  async getRelatedTracks(
    seedTrack: Pick<TrackDTO, "identifier" | "title" | "author" | "sourceName" | "uri">,
    requester?: RequesterInfo,
    limit = 20
  ): Promise<TrackDTO[]> {
    const rawTracks = await this.fetchRelatedLavalinkTracks(seedTrack, requester, limit);
    return rawTracks.map((t) => trackToDTO(t));
  }

  async getArtistProfile(
    artistName: string,
    requester?: RequesterInfo
  ): Promise<ArtistProfileDTO> {
    const cleanName = artistName.trim();
    if (!cleanName) {
      throw new Error("Artist name is required.");
    }

    const node = this.getConnectedNode();
    const result = await node.search(
      { query: cleanName, source: "ytmsearch" },
      requester
    );
    if (result.loadType === "error") {
      throw new Error(result.exception?.message || "Failed to load artist tracks.");
    }

    const needle = cleanName.toLowerCase();
    const exactMatches: TrackDTO[] = [];
    const fallbackTracks: TrackDTO[] = [];
    const seen = new Set<string>();

    for (const rawTrack of result.tracks) {
      if (rawTrack.info.isStream) continue;
      const dto = trackToDTO(rawTrack);
      if (seen.has(dto.identifier)) continue;
      seen.add(dto.identifier);

      const authorLower = dto.author.toLowerCase();
      const artistParts = authorLower
        .split(/[,&•/]|feat\.|ft\./i)
        .map((part) => part.trim())
        .filter(Boolean);

      const isArtistMatch =
        authorLower === needle ||
        artistParts.includes(needle) ||
        authorLower.includes(needle);

      if (isArtistMatch) {
        exactMatches.push(dto);
      } else {
        fallbackTracks.push(dto);
      }
    }

    const topSongs =
      exactMatches.length >= 4
        ? exactMatches.slice(0, 20)
        : [...exactMatches, ...fallbackTracks].slice(0, 20);
    const usedIds = new Set(topSongs.map((t) => t.identifier));
    const relatedTracks = fallbackTracks
      .filter((t) => !usedIds.has(t.identifier))
      .slice(0, 12);

    return {
      name: cleanName,
      artworkUrl: topSongs[0]?.artworkUrl ?? null,
      trackCount: topSongs.length,
      topSongs,
      relatedTracks,
    };
  }

  async enqueue(
    guildId: string,
    voiceChannelId: string,
    dtos: TrackDTO[],
    mode: EnqueueMode,
    requester: RequesterInfo,
    textChannelId?: string
  ): Promise<{ added: number; playingNow: TrackDTO | null }> {
    if (dtos.length === 0) {
      return { added: 0, playingNow: null };
    }

    const settings = this.db.getGuildSettings(guildId);
    const player = await this.ensurePlayer(guildId, voiceChannelId, textChannelId);
    this.clearInactivityTimer(guildId);

    let filtered = dtos;
    if (!settings.allowDuplicates && (mode === "end" || mode === "next")) {
      const existingIds = new Set<string>();
      if (player.queue.current) {
        existingIds.add(player.queue.current.info.identifier);
      }
      for (const item of player.queue.tracks) {
        if (item.info.identifier) {
          existingIds.add(item.info.identifier);
        }
      }
      filtered = dtos.filter((t) => {
        if (existingIds.has(t.identifier)) return false;
        existingIds.add(t.identifier);
        return true;
      });
    }

    if (filtered.length === 0) {
      throw new Error("Duplicate tracks are disabled on this server.");
    }

    const tracks = filtered.map((dto) => this.dtoToLavalinkTrack(dto, requester));

    if (mode === "replace") {
      if (player.queue.tracks.length > 0) {
        await player.queue.splice(0, player.queue.tracks.length);
      }
      if (player.queue.current) {
        this.pushPrevious(player, player.queue.current);
      }
      if (tracks.length > 1) {
        await player.queue.add(tracks.slice(1));
      }
      await player.play({ clientTrack: tracks[0], paused: false });
      await player.queue.utils.save();
    } else if (mode === "now") {
      if (player.queue.current) {
        this.pushPrevious(player, player.queue.current);
      }
      if (tracks.length > 1) {
        await player.queue.add(tracks.slice(1), 0);
      }
      await player.play({ clientTrack: tracks[0], paused: false });
      await player.queue.utils.save();
    } else if (mode === "next") {
      await player.queue.add(tracks, 0);
      if (!player.playing && !player.paused && !player.queue.current) {
        await player.play();
      }
    } else {
      await player.queue.add(tracks);
      if (!player.playing && !player.paused && !player.queue.current) {
        await player.play();
      }
    }

    this.onStateChange(guildId);
    return {
      added: tracks.length,
      playingNow: player.queue.current ? trackToDTO(player.queue.current) : filtered[0] ?? null,
    };
  }

  async startMix(
    guildId: string,
    voiceChannelId: string,
    seedTrack: TrackDTO,
    requester: RequesterInfo,
    textChannelId?: string
  ): Promise<{ added: number }> {
    await this.enqueue(guildId, voiceChannelId, [seedTrack], "replace", requester, textChannelId);
    this.autoplayOverrides.set(guildId, true);

    const player = this.getPlayer(guildId);
    if (!player) {
      return { added: 0 };
    }

    const related = await this.fetchRelatedLavalinkTracks(seedTrack, requester, 10);
    if (related.length > 0) {
      await player.queue.add(related);
    }

    this.onStateChange(guildId);
    return { added: related.length };
  }

  async playTrack(guildId: string, index: number): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (index < 0 || index >= player.queue.tracks.length) {
      throw new Error("Selected track is out of range.");
    }

    const target = player.queue.tracks[index];
    this.pushPrevious(player, player.queue.current);
    for (let i = 0; i < index; i++) {
      this.pushPrevious(player, player.queue.tracks[i]);
    }
    await player.queue.splice(0, index + 1);
    await player.play({ clientTrack: target, paused: false });
    await player.queue.utils.save();
    this.onStateChange(guildId);
  }

  async playPrevious(guildId: string, previousIndex: number): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (previousIndex < 0 || previousIndex >= player.queue.previous.length) {
      throw new Error("No previous track at that position.");
    }

    const target = player.queue.previous[previousIndex];
    const skippedBack = player.queue.previous.slice(0, previousIndex).reverse();
    const toRequeue: (Track | UnresolvedTrack)[] = [...skippedBack];
    if (player.queue.current) {
      toRequeue.push(player.queue.current);
    }

    player.queue.previous.splice(0, previousIndex + 1);
    if (toRequeue.length > 0) {
      await player.queue.add(toRequeue, 0);
    }

    await player.play({ clientTrack: target, paused: false });
    await player.queue.utils.save();
    this.onStateChange(guildId);
  }

  async togglePause(guildId: string): Promise<boolean> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");

    if (player.paused) {
      await player.resume();
    } else {
      await player.pause();
    }
    this.onStateChange(guildId);
    return player.paused;
  }

  async setPause(guildId: string, paused: boolean): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");

    if (paused && !player.paused) {
      await player.pause();
    } else if (!paused && player.paused) {
      await player.resume();
    }
    this.onStateChange(guildId);
  }

  async skip(guildId: string, amount = 1): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");

    if (amount > 1 && amount > player.queue.tracks.length) {
      throw new Error(`Cannot skip ${amount} tracks — only ${player.queue.tracks.length} queued.`);
    }

    if (player.queue.tracks.length === 0) {
      if (!player.queue.current && !player.playing) {
        throw new Error("Nothing is currently playing.");
      }
      await player.skip(0, false);
    } else {
      await player.skip(amount > 1 ? amount : 0, false);
    }
    this.onStateChange(guildId);
  }

  async previous(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");

    if (player.queue.previous.length > 0) {
      await this.playPrevious(guildId, 0);
      return;
    }

    if (player.queue.current?.info.isSeekable) {
      await player.seek(0);
      this.onStateChange(guildId);
      return;
    }

    throw new Error("No previous track in history.");
  }

  async seek(guildId: string, positionMs: number): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player || !player.queue.current) {
      throw new Error("Nothing is currently playing.");
    }
    if (!player.queue.current.info.isSeekable) {
      throw new Error("Current track does not support seeking.");
    }
    const clamped = Math.max(0, Math.min(positionMs, player.queue.current.info.duration || positionMs));
    await player.seek(clamped);
    this.onStateChange(guildId);
  }

  async setVolume(guildId: string, volume: number): Promise<number> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    const clamped = Math.max(0, Math.min(150, Math.round(volume)));
    await player.setVolume(clamped);
    this.onStateChange(guildId);
    return clamped;
  }

  async setRepeatMode(guildId: string, mode: RepeatModeType): Promise<RepeatModeType> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    await player.setRepeatMode(mode);
    this.onStateChange(guildId);
    return mode;
  }

  async shuffle(guildId: string): Promise<number> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (player.queue.tracks.length < 2) {
      throw new Error("Need at least 2 queued tracks to shuffle.");
    }
    const count = await player.queue.shuffle();
    this.onStateChange(guildId);
    return count;
  }

  async moveTrack(guildId: string, from: number, to: number): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    const len = player.queue.tracks.length;
    if (from < 0 || from >= len || to < 0 || to >= len) {
      throw new Error("Track position is out of range.");
    }
    if (from === to) return;

    const target = player.queue.tracks[from];
    await player.queue.splice(from, 1);
    await player.queue.add(target, to);
    this.onStateChange(guildId);
  }

  async removeTrack(guildId: string, index: number): Promise<TrackDTO | null> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (index < 0 || index >= player.queue.tracks.length) {
      throw new Error("Track position is out of range.");
    }
    const removed = trackToDTO(player.queue.tracks[index]);
    await player.queue.splice(index, 1);
    this.onStateChange(guildId);
    return removed;
  }

  async clearQueue(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (player.queue.tracks.length > 0) {
      await player.queue.splice(0, player.queue.tracks.length);
    }
    this.onStateChange(guildId);
  }

  async stop(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) return;
    this.clearInactivityTimer(guildId);
    await player.destroy("Stopped by user");
    this.onStateChange(guildId);
  }

  toggleAutoplay(guildId: string, enabled: boolean): boolean {
    this.autoplayOverrides.set(guildId, enabled);
    this.onStateChange(guildId);
    return enabled;
  }

  isAutoplayEnabled(guildId: string): boolean {
    if (this.autoplayOverrides.has(guildId)) {
      return Boolean(this.autoplayOverrides.get(guildId));
    }
    return this.db.getGuildSettings(guildId).autoplay;
  }

  async applyFilter(guildId: string, preset: FilterPreset): Promise<FilterPreset> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");

    await player.filterManager.resetFilters();

    switch (preset) {
      case "none":
        break;
      case "bassboost":
        await player.filterManager.setEQPreset("BassboostMedium");
        break;
      case "nightcore":
        await player.filterManager.toggleNightcore();
        break;
      case "vaporwave":
        await player.filterManager.toggleVaporwave();
        break;
      case "8d":
        await player.filterManager.toggleRotation(0.2);
        break;
      case "karaoke":
        await player.filterManager.toggleKaraoke();
        break;
      case "lowpass":
        await player.filterManager.toggleLowPass();
        break;
      case "tremolo":
        await player.filterManager.toggleTremolo();
        break;
      case "vibrato":
        await player.filterManager.toggleVibrato();
        break;
    }

    this.activeFilters.set(guildId, preset);
    this.onStateChange(guildId);
    return preset;
  }

  private async handleAutoplay(player: Player, lastPlayedTrack: Track): Promise<void> {
    if (!this.isAutoplayEnabled(player.guildId)) return;
    if (!lastPlayedTrack?.info?.title) return;

    try {
      const excludedIds = new Set<string>([lastPlayedTrack.info.identifier]);
      for (const prev of player.queue.previous.slice(0, 12)) {
        excludedIds.add(prev.info.identifier);
      }

      const query = `${lastPlayedTrack.info.author} ${lastPlayedTrack.info.title}`.trim();
      const result = await player.search(
        { query, source: "ytmsearch" },
        this.client.user ? userToRequester(this.client.user) : undefined
      );

      const candidate = result.tracks.find(
        (track) =>
          !track.info.isStream &&
          (!track.info.identifier || !excludedIds.has(track.info.identifier))
      );
      if (candidate) {
        await player.queue.add(candidate);
      }
    } catch (error) {
      console.warn(`[Autoplay] Failed for guild ${player.guildId}:`, error);
    }
  }

  scheduleInactivityCheck(guildId: string): void {
    this.clearInactivityTimer(guildId);
    const settings = this.db.getGuildSettings(guildId);
    if (settings.stay247) return;

    const player = this.getPlayer(guildId);
    if (!player) return;

    const guild = this.client.guilds.cache.get(guildId);
    const vc = player.voiceChannelId ? guild?.channels.cache.get(player.voiceChannelId) : null;
    const humanListeners =
      vc && vc.isVoiceBased()
        ? vc.members.filter((member) => !member.user.bot).size
        : 0;

    const isIdle = !player.playing && !player.queue.current && player.queue.tracks.length === 0;
    if (humanListeners > 0 && !isIdle) return;

    const timer = setTimeout(async () => {
      this.inactivityTimers.delete(guildId);
      const currentSettings = this.db.getGuildSettings(guildId);
      if (currentSettings.stay247) return;
      const currentPlayer = this.getPlayer(guildId);
      if (!currentPlayer) return;

      const currentGuild = this.client.guilds.cache.get(guildId);
      const currentVc = currentPlayer.voiceChannelId
        ? currentGuild?.channels.cache.get(currentPlayer.voiceChannelId)
        : null;
      const currentHumans =
        currentVc && currentVc.isVoiceBased()
          ? currentVc.members.filter((m) => !m.user.bot).size
          : 0;

      const stillIdle =
        !currentPlayer.playing &&
        !currentPlayer.queue.current &&
        currentPlayer.queue.tracks.length === 0;

      if (currentHumans === 0 || stillIdle) {
        await currentPlayer.destroy("Inactivity timeout").catch(() => {});
        this.onStateChange(guildId);
      }
    }, INACTIVITY_TIMEOUT_MS);

    this.inactivityTimers.set(guildId, timer);
  }

  clearInactivityTimer(guildId: string): void {
    const existing = this.inactivityTimers.get(guildId);
    if (existing) {
      clearTimeout(existing);
      this.inactivityTimers.delete(guildId);
    }
  }

  isPrivileged(guildId: string, userId: string): boolean {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return false;

    const member = guild.members.cache.get(userId);
    if (!member) return false;

    if (
      member.permissions.has(PermissionsBitField.Flags.Administrator) ||
      member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      return true;
    }

    const settings = this.db.getGuildSettings(guildId);
    if (settings.djRoleId && member.roles.cache.has(settings.djRoleId)) {
      return true;
    }

    const player = this.getPlayer(guildId);
    if (player?.voiceChannelId) {
      const vc = guild.channels.cache.get(player.voiceChannelId);
      if (vc && vc.isVoiceBased()) {
        const humans = vc.members.filter((m) => !m.user.bot);
        if (humans.size <= 1 && humans.has(userId)) {
          return true;
        }
      }
    } else if (member.voice.channelId) {
      const vc = member.voice.channel;
      if (vc && vc.members.filter((m) => !m.user.bot).size <= 1) {
        return true;
      }
    }

    return false;
  }

  serializePlayer(guildId: string, userId?: string): PlayerStateDTO {
    const guild = this.client.guilds.cache.get(guildId);
    const player = this.getPlayer(guildId);
    const settings = this.db.getGuildSettings(guildId);

    const vcId = player?.voiceChannelId ?? null;
    const vc = vcId ? guild?.channels.cache.get(vcId) : null;
    const listeners: ListenerDTO[] =
      vc && vc.isVoiceBased()
        ? vc.members
            .filter((member) => !member.user.bot)
            .map((member) => ({
              id: member.id,
              username: member.displayName || member.user.globalName || member.user.username,
              avatarUrl: member.user.displayAvatarURL({ size: 64 }),
            }))
        : [];

    if (!player) {
      return {
        guildId,
        guildName: guild?.name || "Unknown Server",
        voiceChannelId: null,
        voiceChannelName: null,
        connected: false,
        playing: false,
        paused: false,
        position: 0,
        volume: settings.defaultVolume,
        repeatMode: "off",
        autoplay: this.isAutoplayEnabled(guildId),
        activeFilter: "none",
        current: null,
        queue: [],
        previous: [],
        listeners: [],
        isPrivileged: userId ? this.isPrivileged(guildId, userId) : false,
        updatedAt: Date.now(),
      };
    }

    return {
      guildId,
      guildName: guild?.name || "Unknown Server",
      voiceChannelId: vcId,
      voiceChannelName: vc?.name ?? null,
      connected: Boolean(player.connected),
      playing: Boolean(player.playing),
      paused: Boolean(player.paused),
      position: typeof player.position === "number" ? player.position : 0,
      volume: typeof player.volume === "number" ? player.volume : settings.defaultVolume,
      repeatMode: player.repeatMode || "off",
      autoplay: this.isAutoplayEnabled(guildId),
      activeFilter: this.activeFilters.get(guildId) ?? "none",
      current: player.queue.current ? trackToDTO(player.queue.current) : null,
      queue: player.queue.tracks.map(trackToDTO),
      previous: player.queue.previous.slice(0, 25).map(trackToDTO),
      listeners,
      isPrivileged: userId ? this.isPrivileged(guildId, userId) : false,
      updatedAt: Date.now(),
    };
  }

  async destroy(): Promise<void> {
    for (const guildId of this.inactivityTimers.keys()) {
      this.clearInactivityTimer(guildId);
    }
    for (const player of this.manager.players.values()) {
      await player.destroy("Server shutting down").catch(() => {});
    }
  }
}
