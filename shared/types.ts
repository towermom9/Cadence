export type SearchSource = "auto" | "ytsearch" | "ytmsearch" | "spsearch" | "dzsearch" | "scsearch";

export type RepeatModeType = "off" | "track" | "queue";

export type AutoplayMood =
  | "all"
  | "familiar"
  | "discover"
  | "popular"
  | "deep_cuts"
  | "chill"
  | "upbeat";

export type PlaylistSortMode =
  | "recent_activity"
  | "recently_saved"
  | "recently_played"
  | "recent_sync"
  | "manual"
  | "alphabetical";

export type ThemeAccentId =
  | "red"
  | "rose"
  | "violet"
  | "indigo"
  | "blue"
  | "cyan"
  | "emerald"
  | "amber"
  | "monochrome";

export type BackgroundMode = "amoled" | "dark" | "elevated";

export type AutoplayClickBehavior =
  | "play_now_here"
  | "play_now_end"
  | "queue_next"
  | "queue_end";

export interface UserPreferencesDTO {
  playlistSort: PlaylistSortMode;
  themeAccent: ThemeAccentId;
  backgroundMode: BackgroundMode;
  ambienceMode: boolean;
  artworkSeekButtons: boolean;
  artworkSeekSeconds: number;
  lyricsAutoScroll: boolean;
  autoplayClickBehavior: AutoplayClickBehavior;
  defaultSearchSource: SearchSource;
}

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
  isAutoplay?: boolean;
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
  queueName: string | null;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  connected: boolean;
  playing: boolean;
  paused: boolean;
  position: number;
  volume: number;
  repeatMode: RepeatModeType;
  autoplay: boolean;
  autoplayMood: AutoplayMood;
  activeFilter: FilterPreset;
  current: TrackDTO | null;
  queue: TrackDTO[];
  previous: TrackDTO[];
  listeners: ListenerDTO[];
  isPrivileged: boolean;
  updatedAt: number;
}

export type AccessTier =
  | "bot_owner"
  | "server_owner"
  | "admin"
  | "dj"
  | "user"
  | "none";

export interface GuildSummaryDTO {
  id: string;
  name: string;
  iconUrl: string | null;
  botPresent: boolean;
  canManage: boolean;
  isOwner?: boolean;
  hasAccess?: boolean;
  accessTier?: AccessTier;
  inVoice: boolean;
  hasActivePlayer: boolean;
  memberCount?: number;
}

export interface GuildSettingsDTO {
  guildId: string;
  prefix: string;
  defaultVolume: number;
  djRoleId: string | null;
  accessRoleIds?: string[];
  adminRoleIds?: string[];
  stay247: boolean;
  autoplay: boolean;
  allowDuplicates: boolean;
  roles?: { id: string; name: string }[];
}

export interface PlaylistDTO {
  id: string;
  name: string;
  tracks: TrackDTO[];
  sourceUrl?: string | null;
  lastSyncedAt?: number | null;
  lastPlayedAt?: number | null;
  isLiked?: boolean;
  isPinned?: boolean;
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PinnedTrackDTO {
  track: TrackDTO;
  pinnedAt: number;
}

export interface DailyRecommendationsDTO {
  tracks: TrackDTO[];
  basedOn: string[];
  date: string;
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
  redirectUri: string;
  appVersion?: string;
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

export type EnqueueMode = "end" | "next" | "now" | "replace";

export interface ArtistProfileDTO {
  name: string;
  artworkUrl: string | null;
  trackCount: number;
  topSongs: TrackDTO[];
  relatedTracks: TrackDTO[];
}

export interface SearchSuggestResponseDTO {
  query: string;
  suggestions: string[];
  tracks: TrackDTO[];
}

export interface DebugLogEntryDTO {
  ts: number;
  level: "log" | "info" | "warn" | "error";
  message: string;
}

export interface SystemInfoDTO {
  appVersion: string;
  runtime: {
    name: string;
    version: string;
    platform: string;
    arch: string;
    uptimeSeconds: number;
    memoryRssMb: number;
  };
  lavalink: {
    connected: boolean;
    version: string | null;
    lavaplayer: string | null;
    jvm: string | null;
    plugins: { name: string; version: string }[];
  };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  logCount: number;
}

export type WsClientMessage =
  | { type: "selectGuild"; guildId: string }
  | { type: "search"; query: string; source: SearchSource }
  | { type: "enqueue"; guildId: string; tracks: TrackDTO[]; mode: EnqueueMode; queueName?: string }
  | { type: "startMix"; guildId: string; track: TrackDTO }
  | { type: "playTrack"; guildId: string; index: number }
  | { type: "playPrevious"; guildId: string; index: number }
  | { type: "pause"; guildId: string }
  | { type: "resume"; guildId: string }
  | { type: "skip"; guildId: string }
  | { type: "previous"; guildId: string }
  | { type: "seek"; guildId: string; position: number }
  | { type: "volume"; guildId: string; volume: number }
  | { type: "repeat"; guildId: string; mode: RepeatModeType }
  | { type: "shuffle"; guildId: string }
  | { type: "moveTrack"; guildId: string; from: number; to: number }
  | { type: "movePreviousTrack"; guildId: string; from: number; to: number }
  | { type: "movePreviousToQueue"; guildId: string; previousIndex: number; queueIndex: number }
  | { type: "moveQueueToPrevious"; guildId: string; queueIndex: number; previousIndex: number }
  | { type: "moveCurrentToQueue"; guildId: string; queueIndex: number }
  | { type: "moveCurrentToPrevious"; guildId: string; previousIndex: number }
  | { type: "removeTrack"; guildId: string; index: number }
  | { type: "removePreviousTrack"; guildId: string; index: number }
  | { type: "clearQueue"; guildId: string }
  | { type: "dismissQueue"; guildId: string }
  | { type: "stop"; guildId: string }
  | { type: "toggleAutoplay"; guildId: string; enabled: boolean }
  | { type: "setAutoplayMood"; guildId: string; mood: AutoplayMood }
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
  | { type: "createPlaylistWithTracks"; name: string; tracks: TrackDTO[] }
  | { type: "importPlaylist"; url: string; name?: string }
  | { type: "syncPlaylist"; playlistId: string; url?: string }
  | { type: "renamePlaylist"; playlistId: string; name: string }
  | { type: "deletePlaylist"; playlistId: string }
  | { type: "togglePinPlaylist"; playlistId: string }
  | { type: "addTrackToPlaylist"; playlistId: string; track: TrackDTO }
  | { type: "addTracksToPlaylist"; playlistId: string; tracks: TrackDTO[] }
  | { type: "removeTrackFromPlaylist"; playlistId: string; index: number }
  | { type: "reorderPlaylistTracks"; playlistId: string; fromIndex: number; toIndex: number }
  | { type: "toggleLike"; track: TrackDTO }
  | { type: "togglePinTrack"; track: TrackDTO }
  | { type: "reorderPinnedTracks"; trackIds: string[] }
  | {
      type: "playPlaylist";
      guildId: string;
      playlistId: string;
      shuffle?: boolean;
      startIndex?: number;
    }
  | { type: "setPlaylistSort"; sort: PlaylistSortMode }
  | { type: "reorderPlaylists"; playlistIds: string[] }
  | { type: "updatePreferences"; preferences: Partial<UserPreferencesDTO> }
  | { type: "getHistory" }
  | { type: "clearHistory" }
  | { type: "removeHistoryEntry"; historyId?: number; trackIdentifier?: string }
  | { type: "ping" };

export type ToastLevel = "info" | "success" | "error";

export type WsServerMessage =
  | { type: "ready"; selectedGuildId: string | null }
  | { type: "meta"; meta: AppMetaDTO }
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
  | { type: "playlists"; playlists: PlaylistDTO[]; playlistSort?: PlaylistSortMode }
  | { type: "pinnedTracks"; tracks: PinnedTrackDTO[] }
  | { type: "preferences"; preferences: UserPreferencesDTO }
  | { type: "history"; entries: HistoryEntryDTO[] }
  | { type: "toast"; level: ToastLevel; message: string }
  | { type: "pong" };
