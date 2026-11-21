export type SearchSource = "auto" | "ytsearch" | "ytmsearch" | "spsearch" | "dzsearch" | "scsearch";

export type RepeatModeType = "off" | "track" | "queue";

export type FilterPreset =
  | "none"
  | "bassboost"
  | "nightcore"
  | "vaporwave"
  | "8d"
  | "karaoke"
  | "lowpass"
  | "tremolo"
  | "vibrato";

export interface TrackDTO {
  encoded: string;
  identifier: string;
  title: string;
  author: string;
  duration: number;
  uri: string | null;
  artworkUrl: string | null;
  sourceName: string;
  isStream: boolean;
  requester?: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

export interface ListenerDTO {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface PlayerStateDTO {
  guildId: string;
  guildName: string;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  connected: boolean;
  playing: boolean;
  paused: boolean;
  position: number;
  volume: number;
  repeatMode: RepeatModeType;
  autoplay: boolean;
  activeFilter: FilterPreset;
  current: TrackDTO | null;
  queue: TrackDTO[];
  previous: TrackDTO[];
  listeners: ListenerDTO[];
  isPrivileged: boolean;
  updatedAt: number;
}

export interface GuildSummaryDTO {
  id: string;
  name: string;
  iconUrl: string | null;
  botPresent: boolean;
  canManage: boolean;
  inVoice: boolean;
  hasActivePlayer: boolean;
  memberCount?: number;
}

export interface GuildSettingsDTO {
  guildId: string;
  prefix: string;
  defaultVolume: number;
  djRoleId: string | null;
  stay247: boolean;
  autoplay: boolean;
  allowDuplicates: boolean;
  roles?: { id: string; name: string }[];
}

export interface PlaylistDTO {
  id: string;
  name: string;
  tracks: TrackDTO[];
  createdAt: number;
  updatedAt: number;
}

export interface HistoryEntryDTO {
  id: number;
  track: TrackDTO;
  playedAt: number;
}

export interface LyricsDTO {
  title: string;
  artist: string;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  source: string;
}

export interface UserProfileDTO {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
}

export interface AppMetaDTO {
  botReady: boolean;
  botId: string | null;
  botName: string;
  botAvatarUrl: string | null;
  inviteUrl: string | null;
  lavalinkConnected: boolean;
  lavalinkVersion: string | null;
  needsSetup: boolean;
  setupTokenRequired: boolean;
  oauthConfigured: boolean;
}

export interface SetupStatusDTO {
  needsSetup: boolean;
  setupTokenRequired: boolean;
  lavalinkReachable: boolean;
  lavalinkVersion: string | null;
  lavalinkHost: string;
  lavalinkPort: number;
  defaults: {
    dashboardUrl: string;
    botPrefix: string;
    defaultSearchSource: SearchSource;
  };
}

export interface TokenTestResultDTO {
  valid: boolean;
  botId: string;
  botUsername: string;
  botAvatarUrl: string | null;
  clientId: string;
  appName: string;
  ownerUserId: string | null;
  membersIntentEnabled: boolean;
  messageContentIntentEnabled: boolean;
}

export interface SetupCompletePayload {
  setupToken?: string;
  discordToken: string;
  discordClientId: string;
  discordClientSecret: string;
  dashboardUrl: string;
  botPrefix: string;
  defaultSearchSource: SearchSource;
}

export type EnqueueMode = "end" | "next" | "now";

export type WsClientMessage =
  | { type: "selectGuild"; guildId: string }
  | { type: "search"; query: string; source: SearchSource }
  | { type: "enqueue"; guildId: string; tracks: TrackDTO[]; mode: EnqueueMode }
  | { type: "playTrack"; guildId: string; index: number }
  | { type: "pause"; guildId: string }
  | { type: "resume"; guildId: string }
  | { type: "skip"; guildId: string }
  | { type: "previous"; guildId: string }
  | { type: "seek"; guildId: string; position: number }
  | { type: "volume"; guildId: string; volume: number }
  | { type: "repeat"; guildId: string; mode: RepeatModeType }
  | { type: "shuffle"; guildId: string }
  | { type: "moveTrack"; guildId: string; from: number; to: number }
  | { type: "removeTrack"; guildId: string; index: number }
  | { type: "clearQueue"; guildId: string }
  | { type: "stop"; guildId: string }
  | { type: "toggleAutoplay"; guildId: string; enabled: boolean }
  | { type: "setFilter"; guildId: string; preset: FilterPreset }
  | { type: "getLyrics"; guildId: string; title?: string; artist?: string; duration?: number }
  | { type: "getSettings"; guildId: string }
  | {
      type: "updateSettings";
      guildId: string;
      settings: Partial<Omit<GuildSettingsDTO, "guildId" | "roles">>;
    }
  | { type: "getPlaylists" }
  | { type: "createPlaylist"; name: string }
  | { type: "renamePlaylist"; playlistId: string; name: string }
  | { type: "deletePlaylist"; playlistId: string }
  | { type: "addTrackToPlaylist"; playlistId: string; track: TrackDTO }
  | { type: "removeTrackFromPlaylist"; playlistId: string; index: number }
  | { type: "playPlaylist"; guildId: string; playlistId: string; shuffle?: boolean }
  | { type: "getHistory" }
  | { type: "ping" };

export type ToastLevel = "info" | "success" | "error";

export type WsServerMessage =
  | { type: "ready"; selectedGuildId: string | null }
  | { type: "playerState"; state: PlayerStateDTO }
  | {
      type: "searchResults";
      query: string;
      source: SearchSource;
      tracks: TrackDTO[];
      playlistName?: string | null;
    }
  | { type: "lyrics"; guildId: string; lyrics: LyricsDTO | null; title?: string; artist?: string }
  | { type: "settings"; settings: GuildSettingsDTO }
  | { type: "playlists"; playlists: PlaylistDTO[] }
  | { type: "history"; entries: HistoryEntryDTO[] }
  | { type: "toast"; level: ToastLevel; message: string }
  | { type: "pong" };
