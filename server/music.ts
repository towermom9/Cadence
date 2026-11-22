import { PermissionsBitField, type Client, type GuildMember, type User } from "discord.js";
import {
  LavalinkManager,
  type LavalinkNode,
  type Player,
  type SearchPlatform,
  type Track,
  type UnresolvedTrack,
} from "lavalink-client";
import { cleanArtistTag, splitArtists } from "@shared/artists";
import { uiVolumeToLavalink } from "@shared/volume";
import type {
  ArtistProfileDTO,
  AutoplayClickBehavior,
  AutoplayMood,
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
const YTIMG_PATH_REGEX = /^\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\/(?:default|mqdefault|hqdefault|sddefault)\.(?:jpg|webp)$/i;

const GOOGLE_IMAGE_HOSTS = new Set([
  "yt3.googleusercontent.com",
  "yt3.ggpht.com",
  "lh3.googleusercontent.com",
  "lh3.ggpht.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
]);

export function normalizeArtworkUrl(
  rawUrl: string | null | undefined,
  sourceName: string,
  identifier: string,
  uri?: string | null
): string | null {
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      if (GOOGLE_IMAGE_HOSTS.has(host)) {
        return rawUrl
          .replace(/=w\d+-h\d+[^/?#]*$/i, "=w1000-h1000-l90-rj")
          .replace(/=s\d+(-[^/?#]*)?$/i, "=s1000$1");
      }
      if (host === "i.ytimg.com" || host === "i9.ytimg.com" || host === "img.youtube.com") {
        const match = parsed.pathname.match(YTIMG_PATH_REGEX);
        if (match) {
          return `https://i.ytimg.com/vi/${match[1]}/maxresdefault.jpg`;
        }
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
    return `https://i.ytimg.com/vi/${identifier}/maxresdefault.jpg`;
  }

  return null;
}

export function trackToDTO(track: Track | UnresolvedTrack): TrackDTO {
  const info = track.info;
  const identifier = info.identifier || `${info.title ?? "unknown"}:${info.author ?? "unknown"}`;
  const sourceName = info.sourceName || "unknown";
  const rawArtwork = info.artworkUrl ?? track.pluginInfo?.artworkUrl ?? null;
  const userData = track.userData as Record<string, unknown> | undefined;

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
    isAutoplay: Boolean(userData?.isAutoplay),
    requester: extractRequester(track.requester) ?? extractRequester(track.userData?.requester),
  };
}

export type ControllerEventType = "trackStart" | "queueEnd" | "playerDestroy" | "stateChange";

export class MusicService {
  readonly manager: LavalinkManager;
  private activeFilters = new Map<string, FilterPreset>();
  private autoplayOverrides = new Map<string, boolean>();
  private autoplayMoods = new Map<string, AutoplayMood>();
  private autoplayGeneration = new Map<string, number>();
  private autoplayInFlight = new Set<string>();
  private queueNames = new Map<string, string>();
  private recentSeeks = new Map<string, { target: number; at: number }>();
  private uiVolumes = new Map<string, number>();
  private pendingVolumeUpdates = new Map<string, { target: number; inFlight: boolean }>();
  private inactivityTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastPositionBroadcast = new Map<string, number>();
  private onStateChange: (guildId: string) => void;
  private onControllerEvent: (event: ControllerEventType, guildId: string) => void = () => {};
  private onGuildToast: (guildId: string, level: ToastLevel, message: string) => void;
  private onLavalinkStatusChange: () => void = () => {};

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

  setControllerEventHandler(handler: (event: ControllerEventType, guildId: string) => void): void {
    this.onControllerEvent = handler;
  }

  setToastHandler(handler: (guildId: string, level: ToastLevel, message: string) => void): void {
    this.onGuildToast = handler;
  }

  setLavalinkStatusChangeHandler(handler: () => void): void {
    this.onLavalinkStatusChange = handler;
  }

  getUiVolume(guildId: string): number {
    return this.uiVolumes.get(guildId) ?? this.db.getGuildSettings(guildId).defaultVolume;
  }

  private emitStateChange(guildId: string, withController = true): void {
    this.onStateChange(guildId);
    if (withController) {
      this.onControllerEvent("stateChange", guildId);
    }
  }

  private registerEvents(): void {
    this.manager.nodeManager.on("connect", (node) => {
      console.log(`[Lavalink] Node "${node.id}" connected.`);
      this.onLavalinkStatusChange();
    });

    this.manager.nodeManager.on("disconnect", (node, reason) => {
      console.warn(`[Lavalink] Node "${node.id}" disconnected:`, reason.reason || reason.code);
      this.onLavalinkStatusChange();
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
      this.autoplayMoods.delete(player.guildId);
      this.autoplayGeneration.delete(player.guildId);
      this.autoplayInFlight.delete(player.guildId);
      this.queueNames.delete(player.guildId);
      this.recentSeeks.delete(player.guildId);
      this.uiVolumes.delete(player.guildId);
      this.pendingVolumeUpdates.delete(player.guildId);
      this.lastPositionBroadcast.delete(player.guildId);
      this.onStateChange(player.guildId);
      this.onControllerEvent("playerDestroy", player.guildId);
    });

    this.manager.on("trackStart", (player, track) => {
      this.clearInactivityTimer(player.guildId);
      this.recentSeeks.delete(player.guildId);
      if (track) {
        if (!this.queueNames.has(player.guildId) && track.info.title) {
          this.queueNames.set(player.guildId, track.info.title);
        }
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

      if (this.isAutoplayEnabled(player.guildId)) {
        const autoplayRemaining = player.queue.tracks.filter((t) => this.isAutoplayTrack(t)).length;
        if (autoplayRemaining < 4) {
          void this.populateAutoplayQueue(player.guildId, false);
        }
      }

      this.onStateChange(player.guildId);
      this.onControllerEvent("trackStart", player.guildId);
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
      this.queueNames.delete(player.guildId);
      this.scheduleInactivityCheck(player.guildId);
      this.onStateChange(player.guildId);
      this.onControllerEvent("queueEnd", player.guildId);
    });

    this.manager.on("playerPaused", (player) => {
      this.emitStateChange(player.guildId);
    });

    this.manager.on("playerResumed", (player) => {
      this.emitStateChange(player.guildId);
    });

    this.manager.on("playerClientUpdate", (_oldJson, player) => {
      this.emitStateChange(player.guildId);
    });

    this.manager.on("playerUpdate", (_oldJson, player) => {
      const now = Date.now();
      const recent = this.recentSeeks.get(player.guildId);
      if (recent) {
        const elapsed = now - recent.at;
        if (elapsed < 2500) {
          const expected = player.paused ? recent.target : recent.target + elapsed;
          const actual = typeof player.position === "number" ? player.position : 0;
          if (Math.abs(actual - expected) > 2000) {
            return;
          }
          this.recentSeeks.delete(player.guildId);
        } else {
          this.recentSeeks.delete(player.guildId);
        }
      }

      const last = this.lastPositionBroadcast.get(player.guildId) ?? 0;
      if (now - last >= 1500) {
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
      if (textChannelId) {
        existing.textChannelId = textChannelId;
      }
      return existing;
    }

    const settings = this.db.getGuildSettings(guildId);
    this.uiVolumes.set(guildId, settings.defaultVolume);
    const player = this.manager.createPlayer({
      guildId,
      voiceChannelId,
      textChannelId,
      selfDeaf: true,
      selfMute: false,
      volume: uiVolumeToLavalink(settings.defaultVolume),
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

  private dtoToLavalinkTrack(dto: TrackDTO, requester?: RequesterInfo): Track | UnresolvedTrack {
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
          if (searchResult.loadType !== "error" && searchResult.tracks.length > 0) {
            if (!looksLikeYouTube) {
              const ytMatch = searchResult.tracks.find((t) =>
                YOUTUBE_ID_REGEX.test(t.info.identifier || "")
              );
              if (ytMatch?.info.identifier) {
                try {
                  const mixUrl = `https://www.youtube.com/watch?v=${ytMatch.info.identifier}&list=RD${ytMatch.info.identifier}`;
                  const mixResult = await node.search({ query: mixUrl }, requester);
                  if (mixResult.loadType !== "error") {
                    candidatePool.push(...mixResult.tracks);
                  }
                } catch {
                  // Continue with ytmsearch tracks if RD mix lookup fails
                }
              }
            }
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
    const cleanName = cleanArtistTag(artistName);
    if (!cleanName) {
      throw new Error("Artist name is required.");
    }

    const node = this.getConnectedNode();
    const searches = await Promise.allSettled([
      node.search({ query: cleanName, source: "ytmsearch" }, requester),
      node.search({ query: `${cleanName} songs`, source: "ytmsearch" }, requester),
      node.search({ query: `${cleanName} - Topic`, source: "ytsearch" }, requester),
      node.search({ query: `${cleanName} official music`, source: "ytsearch" }, requester),
    ]);

    const needle = cleanName.toLowerCase();
    const needleRegex = new RegExp(
      `(?:^|\\b)${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|$)`,
      "i"
    );
    const exactMatches: TrackDTO[] = [];
    const fallbackTracks: TrackDTO[] = [];
    const seenIds = new Set<string>();
    const seenTitleDur = new Set<string>();

    const normalizeTitleKey = (title: string, duration: number) => {
      const stripped = title
        .replace(/\(.*?\)|\[.*?\]/g, "")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .toLowerCase();
      if (!stripped || duration <= 0) return "";
      return `${stripped}:${Math.round(duration / 3000)}`;
    };

    for (const outcome of searches) {
      if (outcome.status !== "fulfilled" || outcome.value.loadType === "error") continue;
      for (const rawTrack of outcome.value.tracks) {
        if (rawTrack.info.isStream) continue;
        const dto = trackToDTO(rawTrack);
        if (seenIds.has(dto.identifier)) continue;
        seenIds.add(dto.identifier);

        const titleDurKey = normalizeTitleKey(dto.title, dto.duration);
        if (titleDurKey && seenTitleDur.has(titleDurKey)) continue;
        if (titleDurKey) seenTitleDur.add(titleDurKey);

        const authorLower = cleanArtistTag(dto.author).toLowerCase();
        const artistParts = splitArtists(dto.author).map((p) => p.toLowerCase());
        const titleLower = dto.title.toLowerCase();

        const isArtistMatch =
          authorLower === needle ||
          artistParts.includes(needle) ||
          (needle.length >= 4 && titleLower.startsWith(`${needle} -`)) ||
          /\b(?:feat\.|ft\.)\s+[^-–—]+/i.test(dto.title) && needleRegex.test(dto.title);

        if (isArtistMatch) {
          exactMatches.push(dto);
        } else {
          fallbackTracks.push(dto);
        }
      }
    }

    const topSongs =
      exactMatches.length >= 4
        ? exactMatches.slice(0, 60)
        : [...exactMatches, ...fallbackTracks].slice(0, 60);
    const usedIds = new Set(topSongs.map((t) => t.identifier));
    const relatedTracks = fallbackTracks
      .filter((t) => !usedIds.has(t.identifier))
      .slice(0, 18);

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
    textChannelId?: string,
    options?: {
      skipAutoplayPopulate?: boolean;
      previousTracks?: TrackDTO[];
      queueName?: string;
    }
  ): Promise<{ added: number; playingNow: TrackDTO | null }> {
    if (dtos.length === 0) {
      return { added: 0, playingNow: null };
    }

    const settings = this.db.getGuildSettings(guildId);
    const player = await this.ensurePlayer(guildId, voiceChannelId, textChannelId);
    this.clearInactivityTimer(guildId);
    const wasIdle = !player.playing && !player.paused && !player.queue.current;

    let filtered = dtos;
    if (!settings.allowDuplicates && (mode === "end" || mode === "next")) {
      const existingIds = new Set<string>();
      if (player.queue.current) {
        existingIds.add(player.queue.current.info.identifier);
      }
      for (const item of player.queue.tracks) {
        if (this.isAutoplayTrack(item)) continue;
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

    const requestedName = options?.queueName?.trim();
    if (mode === "replace" || mode === "now" || wasIdle || !this.queueNames.has(guildId)) {
      this.queueNames.set(guildId, requestedName || filtered[0].title);
    }

    const tracks = filtered.map((dto) => this.dtoToLavalinkTrack(dto, requester));

    if (mode !== "replace") {
      const addedIds = new Set(filtered.map((t) => t.identifier).filter(Boolean));
      for (let i = player.queue.tracks.length - 1; i >= 0; i--) {
        const existing = player.queue.tracks[i];
        if (
          this.isAutoplayTrack(existing) &&
          existing.info.identifier &&
          addedIds.has(existing.info.identifier)
        ) {
          await player.queue.splice(i, 1);
        }
      }
    }

    if (mode === "replace") {
      if (player.queue.tracks.length > 0) {
        await player.queue.splice(0, player.queue.tracks.length);
      }
      player.queue.previous.splice(0, player.queue.previous.length);
      if (options?.previousTracks && options.previousTracks.length > 0) {
        const seededPrev = options.previousTracks.slice(-25);
        for (const prevDto of seededPrev) {
          this.pushPrevious(player, this.dtoToLavalinkTrack(prevDto, requester));
        }
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
      const firstAutoIdx = player.queue.tracks.findIndex((t) => this.isAutoplayTrack(t));
      if (firstAutoIdx >= 0) {
        await player.queue.add(tracks, firstAutoIdx);
      } else {
        await player.queue.add(tracks);
      }
      if (!player.playing && !player.paused && !player.queue.current) {
        await player.play();
      }
    }

    if (!options?.skipAutoplayPopulate && this.isAutoplayEnabled(guildId)) {
      if (mode === "now" || mode === "replace") {
        void this.populateAutoplayQueue(guildId, mode === "replace", requester.id);
      } else {
        const remainingAuto = player.queue.tracks.filter((t) => this.isAutoplayTrack(t)).length;
        if (remainingAuto < 4) {
          void this.populateAutoplayQueue(guildId, false, requester.id);
        }
      }
    }

    this.emitStateChange(guildId);
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
    this.autoplayOverrides.set(guildId, true);
    this.autoplayMoods.set(guildId, "all");
    this.autoplayGeneration.set(guildId, (this.autoplayGeneration.get(guildId) ?? 0) + 1);
    await this.enqueue(guildId, voiceChannelId, [seedTrack], "replace", requester, textChannelId, {
      skipAutoplayPopulate: true,
      queueName: `${seedTrack.title} Mix`,
    });

    const player = this.getPlayer(guildId);
    if (!player) {
      return { added: 0 };
    }

    const excludedIds = new Set<string>([seedTrack.identifier]);
    for (const t of player.queue.tracks) {
      if (t.info.identifier) excludedIds.add(t.info.identifier);
    }

    const listeners = this.getVoiceListenerIds(guildId, requester.id);
    const related = await this.getAutoplayCandidates(
      seedTrack,
      "all",
      excludedIds,
      requester,
      10,
      listeners
    );
    if (related.length > 0) {
      await player.queue.add(related);
      await player.queue.utils.save();
    }

    this.emitStateChange(guildId);
    return { added: related.length };
  }

  async playTrack(
    guildId: string,
    index: number,
    autoplayClickBehavior: AutoplayClickBehavior = "play_now_here"
  ): Promise<"played" | "queued_next" | "queued_end"> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (index < 0 || index >= player.queue.tracks.length) {
      throw new Error("Selected track is out of range.");
    }

    const target = player.queue.tracks[index];
    const wasAutoplay = this.isAutoplayTrack(target);
    this.clearAutoplayFlag(target);

    if (wasAutoplay) {
      if (autoplayClickBehavior === "queue_next") {
        await player.queue.splice(index, 1);
        await player.queue.add(target, 0);
        await player.queue.utils.save();
        this.emitStateChange(guildId);
        return "queued_next";
      }

      if (autoplayClickBehavior === "queue_end") {
        await player.queue.splice(index, 1);
        const firstAutoIdx = player.queue.tracks.findIndex((t) => this.isAutoplayTrack(t));
        if (firstAutoIdx >= 0) {
          await player.queue.add(target, firstAutoIdx);
        } else {
          await player.queue.add(target);
        }
        await player.queue.utils.save();
        this.emitStateChange(guildId);
        return "queued_end";
      }

      this.pushPrevious(player, player.queue.current);
      if (autoplayClickBehavior === "play_now_end") {
        const manualTracks = player.queue.tracks.filter((t) => !this.isAutoplayTrack(t));
        for (const m of manualTracks) {
          this.pushPrevious(player, m);
        }
        const remainingAuto = player.queue.tracks.filter(
          (t, i) => i !== index && this.isAutoplayTrack(t)
        );
        await player.queue.splice(0, player.queue.tracks.length);
        if (remainingAuto.length > 0) {
          await player.queue.add(remainingAuto);
        }
      } else {
        await player.queue.splice(index, 1);
      }
    } else {
      this.pushPrevious(player, player.queue.current);
      for (let i = 0; i < index; i++) {
        this.pushPrevious(player, player.queue.tracks[i]);
      }
      await player.queue.splice(0, index + 1);
    }

    await player.play({ clientTrack: target, paused: false });
    await player.queue.utils.save();

    if (this.isAutoplayEnabled(guildId)) {
      const remainingAuto = player.queue.tracks.filter((t) => this.isAutoplayTrack(t)).length;
      if (remainingAuto < 4) {
        void this.populateAutoplayQueue(guildId, false);
      }
    }

    this.emitStateChange(guildId);
    return "played";
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
    this.emitStateChange(guildId);
  }

  async togglePause(guildId: string): Promise<boolean> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");

    if (player.paused) {
      await player.resume();
    } else {
      await player.pause();
    }
    this.emitStateChange(guildId);
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
    this.emitStateChange(guildId);
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
    this.emitStateChange(guildId);
  }

  private getEffectivePosition(guildId: string, player: Player): number {
    let position = typeof player.position === "number" ? player.position : 0;
    const recent = this.recentSeeks.get(guildId);
    if (recent) {
      const elapsed = Date.now() - recent.at;
      if (elapsed < 2500) {
        const expected = player.paused ? recent.target : recent.target + elapsed;
        if (Math.abs(position - expected) > 2000) {
          const duration = player.queue.current?.info.duration || expected;
          position = Math.min(duration, Math.max(0, Math.round(expected)));
        }
      }
    }
    return position;
  }

  async previous(guildId: string): Promise<"restarted" | "previous"> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");

    const current = player.queue.current;
    if (
      current &&
      current.info.isSeekable &&
      !current.info.isStream &&
      this.getEffectivePosition(guildId, player) > 5000
    ) {
      await this.seek(guildId, 0);
      return "restarted";
    }

    if (player.queue.previous.length > 0) {
      await this.playPrevious(guildId, 0);
      return "previous";
    }

    if (current?.info.isSeekable && !current.info.isStream) {
      await this.seek(guildId, 0);
      return "restarted";
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
    const clamped = Math.round(
      Math.max(0, Math.min(positionMs, player.queue.current.info.duration || positionMs))
    );
    this.recentSeeks.set(guildId, { target: clamped, at: Date.now() });
    await player.seek(clamped);
    this.onStateChange(guildId);
  }

  async setVolume(guildId: string, volume: number): Promise<number> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    const clamped = Math.max(0, Math.min(100, Math.round(volume)));
    this.uiVolumes.set(guildId, clamped);
    this.emitStateChange(guildId);

    let entry = this.pendingVolumeUpdates.get(guildId);
    if (entry) {
      entry.target = clamped;
      if (entry.inFlight) {
        return clamped;
      }
    } else {
      entry = { target: clamped, inFlight: false };
      this.pendingVolumeUpdates.set(guildId, entry);
    }

    entry.inFlight = true;
    try {
      while (true) {
        const targetUi = entry.target;
        await player.setVolume(uiVolumeToLavalink(targetUi));
        if (entry.target === targetUi) {
          break;
        }
      }
    } finally {
      entry.inFlight = false;
      if (this.pendingVolumeUpdates.get(guildId) === entry) {
        this.pendingVolumeUpdates.delete(guildId);
      }
    }

    return clamped;
  }

  async setRepeatMode(guildId: string, mode: RepeatModeType): Promise<RepeatModeType> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    await player.setRepeatMode(mode);
    this.emitStateChange(guildId);
    return mode;
  }

  async shuffle(guildId: string): Promise<number> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (player.queue.tracks.length < 2) {
      throw new Error("Need at least 2 queued tracks to shuffle.");
    }
    const count = await player.queue.shuffle();
    this.emitStateChange(guildId);
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
    const wasAutoplay = this.isAutoplayTrack(target);
    const firstAutoIdx = player.queue.tracks.findIndex((t) => this.isAutoplayTrack(t));

    let clampedTo = to;
    if (!wasAutoplay && firstAutoIdx !== -1 && clampedTo >= firstAutoIdx) {
      clampedTo = firstAutoIdx - 1;
    }
    if (wasAutoplay && firstAutoIdx !== -1 && clampedTo < firstAutoIdx) {
      this.clearAutoplayFlag(target);
    }
    if (clampedTo < 0 || from === clampedTo) return;

    await player.queue.splice(from, 1);
    await player.queue.add(target, clampedTo);
    await player.queue.utils.save();
    this.emitStateChange(guildId);
  }

  canRemoveTrack(guildId: string, userId: string, index: number): boolean {
    if (this.isPrivileged(guildId, userId)) return true;
    const player = this.getPlayer(guildId);
    if (!player || index < 0 || index >= player.queue.tracks.length) return true;
    const track = player.queue.tracks[index];
    if (this.isAutoplayTrack(track)) return true;
    const req = extractRequester(track.requester) ?? extractRequester(track.userData?.requester);
    return req?.id === userId;
  }

  async removeTrack(guildId: string, index: number): Promise<TrackDTO | null> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (index < 0 || index >= player.queue.tracks.length) {
      throw new Error("Track position is out of range.");
    }
    const removed = trackToDTO(player.queue.tracks[index]);
    await player.queue.splice(index, 1);
    this.emitStateChange(guildId);
    return removed;
  }

  canRemovePreviousTrack(guildId: string, userId: string, index: number): boolean {
    if (this.isPrivileged(guildId, userId)) return true;
    const player = this.getPlayer(guildId);
    if (!player || index < 0 || index >= player.queue.previous.length) return true;
    const track = player.queue.previous[index];
    if (this.isAutoplayTrack(track)) return true;
    const req = extractRequester(track.requester) ?? extractRequester(track.userData?.requester);
    return req?.id === userId;
  }

  async removePreviousTrack(guildId: string, index: number): Promise<TrackDTO | null> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (index < 0 || index >= player.queue.previous.length) {
      throw new Error("Previous track position is out of range.");
    }
    const [target] = player.queue.previous.splice(index, 1);
    const removed = target ? trackToDTO(target) : null;
    await player.queue.utils.save();
    this.emitStateChange(guildId);
    return removed;
  }

  async movePreviousTrack(guildId: string, from: number, to: number): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    const len = player.queue.previous.length;
    if (from < 0 || from >= len || to < 0 || to >= len) {
      throw new Error("Previous track position is out of range.");
    }
    if (from === to) return;
    const [target] = player.queue.previous.splice(from, 1);
    player.queue.previous.splice(to, 0, target);
    await player.queue.utils.save();
    this.emitStateChange(guildId);
  }

  async movePreviousToQueue(
    guildId: string,
    previousIndex: number,
    queueIndex: number
  ): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (previousIndex < 0 || previousIndex >= player.queue.previous.length) {
      throw new Error("Previous track position is out of range.");
    }
    const [target] = player.queue.previous.splice(previousIndex, 1);
    if (!target) return;
    this.clearAutoplayFlag(target);

    if (target.info.identifier) {
      for (let i = player.queue.tracks.length - 1; i >= 0; i--) {
        const existing = player.queue.tracks[i];
        if (
          this.isAutoplayTrack(existing) &&
          existing.info.identifier === target.info.identifier
        ) {
          await player.queue.splice(i, 1);
        }
      }
    }

    const firstAutoIdx = player.queue.tracks.findIndex((t) => this.isAutoplayTrack(t));
    const maxInsert = firstAutoIdx === -1 ? player.queue.tracks.length : firstAutoIdx;
    const clampedIdx = Math.max(0, Math.min(queueIndex, maxInsert));
    await player.queue.add(target, clampedIdx);
    await player.queue.utils.save();
    this.emitStateChange(guildId);
  }

  async moveQueueToPrevious(
    guildId: string,
    queueIndex: number,
    previousIndex: number
  ): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (queueIndex < 0 || queueIndex >= player.queue.tracks.length) {
      throw new Error("Track position is out of range.");
    }
    const target = player.queue.tracks[queueIndex];
    this.clearAutoplayFlag(target);
    await player.queue.splice(queueIndex, 1);

    const insertIdx = Math.max(0, Math.min(previousIndex, player.queue.previous.length));
    player.queue.previous.splice(insertIdx, 0, target as Track);
    const maxPrev = player.queue.options?.maxPreviousTracks || 25;
    if (player.queue.previous.length > maxPrev) {
      player.queue.previous.splice(maxPrev);
    }
    await player.queue.utils.save();
    this.emitStateChange(guildId);
  }

  async clearQueue(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    if (player.queue.tracks.length > 0) {
      await player.queue.splice(0, player.queue.tracks.length);
    }
    this.emitStateChange(guildId);
  }

  async dismissQueue(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) throw new Error("No active player in this server.");
    this.autoplayGeneration.set(guildId, (this.autoplayGeneration.get(guildId) ?? 0) + 1);
    this.queueNames.delete(guildId);
    this.recentSeeks.delete(guildId);

    if (player.queue.tracks.length > 0) {
      await player.queue.splice(0, player.queue.tracks.length);
    }
    if (player.queue.previous.length > 0) {
      player.queue.previous.splice(0, player.queue.previous.length);
    }

    await player.stopPlaying(true, false);
    player.queue.current = null;
    player.playing = false;
    player.paused = false;

    await player.queue.utils.save();
    this.scheduleInactivityCheck(guildId);
    this.emitStateChange(guildId);
  }

  async stop(guildId: string): Promise<void> {
    const player = this.getPlayer(guildId);
    if (!player) return;
    this.clearInactivityTimer(guildId);
    await player.destroy("Stopped by user");
    this.onStateChange(guildId);
  }

  private isAutoplayTrack(track: Track | UnresolvedTrack): boolean {
    const userData = track.userData as Record<string, unknown> | undefined;
    return userData?.isAutoplay === 1 || userData?.isAutoplay === true;
  }

  private markAsAutoplay(track: Track | UnresolvedTrack): void {
    track.userData = { ...(track.userData ?? {}), isAutoplay: 1 };
  }

  private clearAutoplayFlag(track: Track | UnresolvedTrack): void {
    if (track.userData && typeof track.userData === "object") {
      track.userData = { ...track.userData, isAutoplay: 0 };
    }
  }

  private async clearAutoplayTracksFromQueue(player: Player): Promise<void> {
    if (!player.queue.tracks.some((t) => this.isAutoplayTrack(t))) return;
    const manualTracks = player.queue.tracks.filter((t) => !this.isAutoplayTrack(t));
    await player.queue.splice(0, player.queue.tracks.length);
    if (manualTracks.length > 0) {
      await player.queue.add(manualTracks);
    }
    await player.queue.utils.save();
  }

  private getVoiceListenerIds(guildId: string, extraUserId?: string): string[] {
    const ids = new Set<string>();
    if (extraUserId) ids.add(extraUserId);
    const guild = this.client.guilds.cache.get(guildId);
    const player = this.getPlayer(guildId);
    if (guild && player?.voiceChannelId) {
      const vc = guild.channels.cache.get(player.voiceChannelId);
      if (vc && vc.isVoiceBased()) {
        for (const member of vc.members.values()) {
          if (!member.user.bot) ids.add(member.id);
        }
      }
    }
    return [...ids];
  }

  private async getAutoplayCandidates(
    seed: TrackDTO,
    mood: AutoplayMood,
    excludedIds: Set<string>,
    requester: RequesterInfo | undefined,
    limit = 10,
    listenerUserIds: string[] = []
  ): Promise<(Track | UnresolvedTrack)[]> {
    const normTitle = (raw: string) =>
      raw
        .toLowerCase()
        .replace(/\(.*?\)|\[.*?\]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const seedNormTitle = normTitle(seed.title || "");
    const cleanAuthor = (seed.author || "").replace(/\s*-\s*Topic$/i, "").trim();
    const seedAuthor = cleanAuthor.toLowerCase();
    const cleanTitle = (seed.title || "").replace(/\(.*?\)|\[.*?\]/g, "").trim();

    const searchQuery = async (
      query: string,
      preferredSource: SearchPlatform = "ytmsearch"
    ): Promise<(Track | UnresolvedTrack)[]> => {
      const q = query.trim();
      if (!q) return [];
      try {
        const node = this.getConnectedNode();
        const res = await node.search({ query: q, source: preferredSource }, requester);
        if (res.loadType !== "error" && res.tracks.length > 0) {
          return res.tracks;
        }
        if (preferredSource !== "ytsearch") {
          const fallback = await node.search({ query: q, source: "ytsearch" }, requester);
          if (fallback.loadType !== "error") {
            return fallback.tracks;
          }
        }
      } catch {
        // Ignore transient search failures per mood branch
      }
      return [];
    };

    const isSameArtist = (t: Track | UnresolvedTrack) => {
      if (!seedAuthor) return false;
      const a = (t.info.author || "").replace(/\s*-\s*Topic$/i, "").trim().toLowerCase();
      return Boolean(a && (a === seedAuthor || a.includes(seedAuthor) || seedAuthor.includes(a)));
    };

    const basePool = await this.fetchRelatedLavalinkTracks(seed, requester, 25);
    const baseTopIds = new Set(
      basePool
        .slice(0, 8)
        .map((t) => t.info.identifier)
        .filter((id): id is string => Boolean(id))
    );

    const userKnownTracks: TrackDTO[] = [];
    const userKnownSeen = new Set<string>();
    for (const uid of listenerUserIds) {
      try {
        const liked = this.db.ensureLikedPlaylist(uid);
        for (const t of liked.tracks.slice(0, 25)) {
          if (!t.isStream && !userKnownSeen.has(t.identifier)) {
            userKnownSeen.add(t.identifier);
            userKnownTracks.push(t);
          }
        }
        const hist = this.db.getPlayHistory(uid, 40);
        for (const h of hist) {
          if (!h.track.isStream && !userKnownSeen.has(h.track.identifier)) {
            userKnownSeen.add(h.track.identifier);
            userKnownTracks.push(h.track);
          }
        }
      } catch {
        // Ignore if listener history lookup fails
      }
    }

    let orderedPool: (Track | UnresolvedTrack)[] = [];

    switch (mood) {
      case "familiar": {
        const artistSongs = cleanAuthor ? await searchQuery(cleanAuthor, "ytmsearch") : [];
        const baseSameArtist = basePool.filter((t) => isSameArtist(t));
        const userLavalink = userKnownTracks
          .filter((t) => !excludedIds.has(t.identifier) && t.identifier !== seed.identifier)
          .map((t) => this.dtoToLavalinkTrack(t, requester));

        const primaryFamiliar: (Track | UnresolvedTrack)[] = [];
        const maxLen = Math.max(artistSongs.length, userLavalink.length);
        for (let i = 0; i < maxLen; i++) {
          if (i < userLavalink.length) primaryFamiliar.push(userLavalink[i]);
          if (i < artistSongs.length) primaryFamiliar.push(artistSongs[i]);
        }
        orderedPool = [...primaryFamiliar, ...baseSameArtist, ...basePool];
        break;
      }

      case "discover": {
        const knownIds = new Set<string>([
          ...userKnownTracks.map((t) => t.identifier),
          ...basePool
            .slice(0, 6)
            .map((t) => t.info.identifier)
            .filter((id): id is string => Boolean(id)),
        ]);

        const nonSeedArtists = basePool.filter(
          (t, idx) => !isSameArtist(t) && YOUTUBE_ID_REGEX.test(t.info.identifier || "") && idx >= 2
        );
        const hopSeed = nonSeedArtists[0] ?? basePool.find((t) => YOUTUBE_ID_REGEX.test(t.info.identifier || ""));
        let secondHop: (Track | UnresolvedTrack)[] = [];
        if (hopSeed?.info.identifier) {
          try {
            const node = this.getConnectedNode();
            const hopRes = await node.search(
              {
                query: `https://www.youtube.com/watch?v=${hopSeed.info.identifier}&list=RD${hopSeed.info.identifier}`,
              },
              requester
            );
            if (hopRes.loadType !== "error") {
              secondHop = hopRes.tracks;
            }
          } catch {
            // Continue with discover search below
          }
        }
        const discoverSearch = await searchQuery(
          `similar artists to ${cleanAuthor || cleanTitle}`,
          "ytmsearch"
        );

        const combined = [...secondHop, ...discoverSearch, ...basePool.filter((t) => !isSameArtist(t))];
        const fresh = combined.filter(
          (t) => !isSameArtist(t) && !knownIds.has(t.info.identifier || "")
        );
        const otherNonArtist = combined.filter((t) => !isSameArtist(t));
        orderedPool = [...fresh, ...otherNonArtist, ...basePool];
        break;
      }

      case "popular": {
        const [artistHits, topicHits] = await Promise.all([
          cleanAuthor ? searchQuery(`${cleanAuthor} greatest hits popular songs`) : Promise.resolve([]),
          searchQuery(`${cleanTitle} ${cleanAuthor} top hits`),
        ]);
        const merged = [...artistHits, ...topicHits];
        const fresh = merged.filter((t) => !baseTopIds.has(t.info.identifier || ""));
        orderedPool = [...fresh, ...merged, ...basePool];
        break;
      }

      case "deep_cuts": {
        const [acousticLive, albumCuts] = await Promise.all([
          cleanAuthor ? searchQuery(`${cleanAuthor} acoustic live version b-side`) : Promise.resolve([]),
          cleanAuthor ? searchQuery(`${cleanAuthor} underrated album track`) : Promise.resolve([]),
        ]);
        const deepBase = basePool.slice(8).reverse();
        const combined = [...acousticLive, ...deepBase, ...albumCuts];
        const fresh = combined.filter((t) => !baseTopIds.has(t.info.identifier || ""));
        orderedPool = [...fresh, ...combined, ...basePool.slice().reverse()];
        break;
      }

      case "chill": {
        const [artistChill, songChill] = await Promise.all([
          cleanAuthor ? searchQuery(`${cleanAuthor} chill acoustic slow`) : Promise.resolve([]),
          searchQuery(`${cleanTitle} lofi chill acoustic`),
        ]);
        let chillPool = [...artistChill, ...songChill];
        if (chillPool.length < 6) {
          const genericChill = await searchQuery("chill mellow acoustic indie");
          chillPool = [...chillPool, ...genericChill];
        }
        const fresh = chillPool.filter((t) => !baseTopIds.has(t.info.identifier || ""));
        orderedPool = [...fresh, ...chillPool, ...basePool];
        break;
      }

      case "upbeat": {
        const [artistUpbeat, songUpbeat] = await Promise.all([
          cleanAuthor ? searchQuery(`${cleanAuthor} upbeat remix energetic`) : Promise.resolve([]),
          searchQuery(`${cleanTitle} upbeat dance pop`),
        ]);
        let upbeatPool = [...artistUpbeat, ...songUpbeat];
        if (upbeatPool.length < 6) {
          const genericUpbeat = await searchQuery("upbeat energetic pop electronic");
          upbeatPool = [...upbeatPool, ...genericUpbeat];
        }
        const fresh = upbeatPool.filter((t) => !baseTopIds.has(t.info.identifier || ""));
        orderedPool = [...fresh, ...upbeatPool, ...basePool];
        break;
      }

      case "all":
      default:
        orderedPool = basePool;
        break;
    }

    const seenIds = new Set<string>(excludedIds);
    const seenTitles = new Set<string>(seedNormTitle ? [seedNormTitle] : []);
    const picked: (Track | UnresolvedTrack)[] = [];

    for (const candidate of orderedPool) {
      if (candidate.info.isStream) continue;
      const cid = candidate.info.identifier;
      if (cid && seenIds.has(cid)) continue;
      const cTitle = normTitle(candidate.info.title || "");
      if (cTitle && seenTitles.has(cTitle)) continue;

      if (cid) seenIds.add(cid);
      if (cTitle) seenTitles.add(cTitle);
      this.markAsAutoplay(candidate);
      picked.push(candidate);
      if (picked.length >= limit) break;
    }

    return picked;
  }

  async populateAutoplayQueue(
    guildId: string,
    replaceExisting = false,
    preferredUserId?: string
  ): Promise<number> {
    if (!this.isAutoplayEnabled(guildId)) return 0;
    if (!replaceExisting && this.autoplayInFlight.has(guildId)) return 0;

    const player = this.getPlayer(guildId);
    if (!player) return 0;

    const gen = (this.autoplayGeneration.get(guildId) ?? 0) + 1;
    this.autoplayGeneration.set(guildId, gen);
    this.autoplayInFlight.add(guildId);

    try {
      const manualTracks = player.queue.tracks.filter((t) => !this.isAutoplayTrack(t));
      const seedTrack =
        manualTracks[manualTracks.length - 1] ?? player.queue.current ?? player.queue.previous[0];
      if (!seedTrack) return 0;

      if (replaceExisting) {
        await this.clearAutoplayTracksFromQueue(player);
        this.onStateChange(guildId);
      }

      const existingAutoCount = player.queue.tracks.filter((t) => this.isAutoplayTrack(t)).length;
      if (!replaceExisting && existingAutoCount >= 6) {
        return 0;
      }

      const excludedIds = new Set<string>();
      if (player.queue.current?.info.identifier) {
        excludedIds.add(player.queue.current.info.identifier);
      }
      for (const prev of player.queue.previous.slice(0, 20)) {
        if (prev.info.identifier) excludedIds.add(prev.info.identifier);
      }
      for (const qTrack of player.queue.tracks) {
        if (qTrack.info.identifier) excludedIds.add(qTrack.info.identifier);
      }

      const mood = this.autoplayMoods.get(guildId) ?? "all";
      const targetAdd = Math.max(8, 10 - existingAutoCount);
      const botRequester = this.client.user ? userToRequester(this.client.user) : undefined;
      const listeners = this.getVoiceListenerIds(guildId, preferredUserId);
      const candidates = await this.getAutoplayCandidates(
        trackToDTO(seedTrack),
        mood,
        excludedIds,
        botRequester,
        targetAdd,
        listeners
      );

      if (this.autoplayGeneration.get(guildId) !== gen || !this.isAutoplayEnabled(guildId)) {
        return 0;
      }

      if (candidates.length > 0) {
        await player.queue.add(candidates);
        await player.queue.utils.save();
        this.onStateChange(guildId);
      }
      return candidates.length;
    } catch (error) {
      console.warn(`[Autoplay] Failed to populate queue for guild ${guildId}:`, error);
      return 0;
    } finally {
      if (this.autoplayGeneration.get(guildId) === gen) {
        this.autoplayInFlight.delete(guildId);
      }
    }
  }

  async toggleAutoplay(
    guildId: string,
    enabled: boolean,
    preferredUserId?: string
  ): Promise<boolean> {
    this.autoplayOverrides.set(guildId, enabled);
    this.emitStateChange(guildId);

    const player = this.getPlayer(guildId);
    if (player) {
      if (enabled) {
        await this.populateAutoplayQueue(guildId, false, preferredUserId);
      } else {
        this.autoplayGeneration.set(guildId, (this.autoplayGeneration.get(guildId) ?? 0) + 1);
        this.autoplayInFlight.delete(guildId);
        await this.clearAutoplayTracksFromQueue(player);
        this.emitStateChange(guildId);
      }
    }

    return enabled;
  }

  async setAutoplayMood(
    guildId: string,
    mood: AutoplayMood,
    preferredUserId?: string
  ): Promise<AutoplayMood> {
    this.autoplayMoods.set(guildId, mood);
    this.autoplayOverrides.set(guildId, true);
    this.emitStateChange(guildId);
    await this.populateAutoplayQueue(guildId, true, preferredUserId);
    return mood;
  }

  isAutoplayEnabled(guildId: string): boolean {
    if (this.autoplayOverrides.has(guildId)) {
      return Boolean(this.autoplayOverrides.get(guildId));
    }
    return this.db.getGuildSettings(guildId).autoplay;
  }

  getAutoplayMood(guildId: string): AutoplayMood {
    return this.autoplayMoods.get(guildId) ?? "all";
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
    this.emitStateChange(guildId);
    return preset;
  }

  private async handleAutoplay(player: Player, lastPlayedTrack: Track): Promise<void> {
    if (!this.isAutoplayEnabled(player.guildId)) return;
    if (!lastPlayedTrack?.info?.title) return;

    try {
      const excludedIds = new Set<string>([lastPlayedTrack.info.identifier]);
      for (const prev of player.queue.previous.slice(0, 20)) {
        if (prev.info.identifier) excludedIds.add(prev.info.identifier);
      }
      for (const qTrack of player.queue.tracks) {
        if (qTrack.info.identifier) excludedIds.add(qTrack.info.identifier);
      }

      const mood = this.getAutoplayMood(player.guildId);
      const botRequester = this.client.user ? userToRequester(this.client.user) : undefined;
      const listeners = this.getVoiceListenerIds(player.guildId);
      const candidates = await this.getAutoplayCandidates(
        trackToDTO(lastPlayedTrack),
        mood,
        excludedIds,
        botRequester,
        8,
        listeners
      );
      if (candidates.length > 0) {
        await player.queue.add(candidates);
        await player.queue.utils.save();
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
        queueName: null,
        voiceChannelId: null,
        voiceChannelName: null,
        connected: false,
        playing: false,
        paused: false,
        position: 0,
        volume: settings.defaultVolume,
        repeatMode: "off",
        autoplay: this.isAutoplayEnabled(guildId),
        autoplayMood: this.getAutoplayMood(guildId),
        activeFilter: "none",
        current: null,
        queue: [],
        previous: [],
        listeners: [],
        isPrivileged: userId ? this.isPrivileged(guildId, userId) : false,
        updatedAt: Date.now(),
      };
    }

    const position = this.getEffectivePosition(guildId, player);

    return {
      guildId,
      guildName: guild?.name || "Unknown Server",
      queueName:
        this.queueNames.get(guildId) ??
        (player.queue.current ? player.queue.current.info.title : null),
      voiceChannelId: vcId,
      voiceChannelName: vc?.name ?? null,
      connected: Boolean(player.connected),
      playing: Boolean(player.playing),
      paused: Boolean(player.paused),
      position,
      volume: this.getUiVolume(guildId),
      repeatMode: player.repeatMode || "off",
      autoplay: this.isAutoplayEnabled(guildId),
      autoplayMood: this.getAutoplayMood(guildId),
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
