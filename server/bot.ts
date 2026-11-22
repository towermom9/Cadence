import pkg from "../package.json";
import {
  ActionRowBuilder,
  ActivityType,
  type AutocompleteInteraction,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  type MessageActionRowComponentBuilder,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
  type Message,
  type StringSelectMenuInteraction,
} from "discord.js";
import type {
  AppMetaDTO,
  FilterPreset,
  GuildSummaryDTO,
  RepeatModeType,
  SearchSource,
  ToastLevel,
  TrackDTO,
} from "@shared/types";
import type { SearchPlatform } from "lavalink-client";
import { config } from "./config";
import type { CadenceDatabase } from "./db";
import { fetchLyrics, stripEnhancedLrcTags } from "./lyrics";
import { MusicService, trackToDTO, userToRequester } from "./music";

export interface DiscordOAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  owner?: boolean;
  permissions: string;
}

const BRAND_COLOR = 0xff0033;
const INACTIVE_COLOR = 0xb3b3b3;

function getSourceColor(sourceName: string): number {
  switch (sourceName.toLowerCase().trim()) {
    case "youtube":
    case "youtubemusic":
      return 0xff0000;
    case "spotify":
      return 0x1db954;
    case "soundcloud":
      return 0xff7700;
    case "deezer":
      return 0xa238ff;
    case "applemusic":
      return 0xe298c4;
    default:
      return 0xb3b3b3;
  }
}

const SEARCH_SOURCES: { name: string; value: SearchSource }[] = [
  { name: "Auto (URL or Default)", value: "auto" },
  { name: "YouTube Music", value: "ytmsearch" },
  { name: "YouTube", value: "ytsearch" },
  { name: "Spotify", value: "spsearch" },
  { name: "Deezer", value: "dzsearch" },
  { name: "SoundCloud", value: "scsearch" },
];

const FILTER_CHOICES: { name: string; value: FilterPreset }[] = [
  { name: "Off (Reset)", value: "none" },
  { name: "Bass Boost", value: "bassboost" },
  { name: "Nightcore", value: "nightcore" },
  { name: "Vaporwave", value: "vaporwave" },
  { name: "8D Rotation", value: "8d" },
  { name: "Karaoke", value: "karaoke" },
  { name: "Low Pass", value: "lowpass" },
  { name: "Tremolo", value: "tremolo" },
  { name: "Vibrato", value: "vibrato" },
];

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export class CadenceBot {
  client!: Client;
  music!: MusicService;
  private ready = false;
  private pendingSearchCache = new Map<string, TrackDTO[]>();
  private controllerMessages = new Map<string, { channelId: string; messageId: string }>();
  private controllerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private controllerQueues = new Map<string, Promise<void>>();
  private lastNonZeroVolume = new Map<string, number>();
  private buttonCooldowns = new Map<string, number>();
  private onGuildStateChange: (guildId: string) => void;
  private onGuildToast: (guildId: string, level: ToastLevel, message: string) => void;
  private onUserPlaylistsChange: (userId: string) => void = () => {};

  constructor(
    private db: CadenceDatabase,
    onGuildStateChange?: (guildId: string) => void,
    onGuildToast?: (guildId: string, level: ToastLevel, message: string) => void
  ) {
    this.onGuildStateChange = onGuildStateChange ?? (() => {});
    this.onGuildToast = onGuildToast ?? (() => {});
    this.initClientAndMusic();
  }

  private initClientAndMusic(): void {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.music = new MusicService(
      this.client,
      this.db,
      (guildId) => {
        this.onGuildStateChange(guildId);
      },
      (guildId, level, message) => {
        this.onGuildToast(guildId, level, message);
      }
    );

    this.music.setControllerEventHandler((event, guildId) => {
      if (event === "trackStart") {
        void this.invokeController(guildId, { repostIfStale: true });
      } else if (event === "stateChange") {
        this.scheduleControllerUpdate(guildId);
      } else if (event === "queueEnd") {
        void this.invokeController(guildId, { repostIfStale: false });
      } else if (event === "playerDestroy") {
        void this.deleteControllerMessage(guildId);
      }
    });

    this.registerDiscordListeners();
  }

  private clearControllerState(): void {
    for (const timer of this.controllerTimers.values()) {
      clearTimeout(timer);
    }
    this.controllerTimers.clear();
    this.controllerMessages.clear();
    this.controllerQueues.clear();
  }

  private async resetClient(): Promise<void> {
    this.ready = false;
    this.clearControllerState();
    await this.music.destroy().catch(() => {});
    await this.client.destroy().catch(() => {});
    this.initClientAndMusic();
  }

  setStateChangeHandler(handler: (guildId: string) => void): void {
    this.onGuildStateChange = handler;
    this.music.setStateChangeHandler(handler);
  }

  setUserPlaylistsChangeHandler(handler: (userId: string) => void): void {
    this.onUserPlaylistsChange = handler;
  }

  setToastHandler(handler: (guildId: string, level: ToastLevel, message: string) => void): void {
    this.onGuildToast = handler;
    this.music.setToastHandler(handler);
  }

  isReady(): boolean {
    return this.ready && Boolean(this.client.user);
  }

  async probeLavalink(): Promise<{ reachable: boolean; version: string | null }> {
    for (const node of this.music.manager.nodeManager.nodes.values()) {
      if (node.connected) {
        return {
          reachable: true,
          version: node.info?.version?.semver ?? "4.x",
        };
      }
    }

    const protocol = config.lavalink.secure ? "https" : "http";
    try {
      const res = await fetch(
        `${protocol}://${config.lavalink.host}:${config.lavalink.port}/version`,
        {
          headers: { Authorization: config.lavalink.password },
          signal: AbortSignal.timeout(2000),
        }
      );
      if (res.ok) {
        const versionText = (await res.text()).trim();
        return { reachable: true, version: versionText || "4.x" };
      }
    } catch {
      // Lavalink not reachable yet
    }

    return { reachable: false, version: null };
  }

  getBotMeta(lavalinkProbe?: { reachable: boolean; version: string | null }): AppMetaDTO {
    const user = this.client.user;
    const clientId = user?.id || config.discordClientId || null;
    const inviteUrl = clientId
      ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=36700160&scope=bot%20applications.commands`
      : null;

    const managerConnected = this.music.isLavalinkConnected();
    let connectedVersion: string | null = null;
    if (managerConnected) {
      for (const node of this.music.manager.nodeManager.nodes.values()) {
        if (node.connected) {
          connectedVersion = node.info?.version?.semver ?? "4.x";
          break;
        }
      }
    }

    return {
      botReady: this.isReady(),
      botId: clientId,
      botName: user?.username || "Cadence",
      botAvatarUrl: user ? user.displayAvatarURL({ size: 256 }) : null,
      inviteUrl,
      lavalinkConnected: managerConnected || Boolean(lavalinkProbe?.reachable),
      lavalinkVersion: connectedVersion ?? lavalinkProbe?.version ?? null,
      needsSetup: config.needsSetup,
      setupTokenRequired: Boolean(config.setupToken),
      oauthConfigured: config.hasOAuthConfig,
      redirectUri: config.discordRedirectUri,
      appVersion: pkg.version || "1.0.0",
    };
  }

  getUserVoiceChannelId(guildId: string, userId: string): string | null {
    const guild = this.client.guilds.cache.get(guildId);
    const member = guild?.members.cache.get(userId);
    return member?.voice.channelId ?? null;
  }

  getGuildRoles(guildId: string): { id: string; name: string }[] {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return [];
    return guild.roles.cache
      .filter((role) => role.id !== guild.id && !role.managed)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name }));
  }

  getUserGuildContext(userId: string, oauthGuilds: DiscordOAuthGuild[]): GuildSummaryDTO[] {
    const summaries: GuildSummaryDTO[] = [];

    for (const og of oauthGuilds) {
      const botGuild = this.client.guilds.cache.get(og.id);
      const perms = BigInt(og.permissions || "0");
      const canManage =
        Boolean(og.owner) ||
        (perms & PermissionsBitField.Flags.Administrator) !== 0n ||
        (perms & PermissionsBitField.Flags.ManageGuild) !== 0n;

      const member = botGuild?.members.cache.get(userId);
      const inVoice = Boolean(member?.voice.channelId);
      const player = botGuild ? this.music.getPlayer(og.id) : undefined;
      const hasActivePlayer = Boolean(player && (player.playing || player.paused || player.queue.current));

      summaries.push({
        id: og.id,
        name: botGuild?.name || og.name,
        iconUrl: og.icon
          ? `https://cdn.discordapp.com/icons/${og.id}/${og.icon}.webp?size=128`
          : botGuild?.iconURL({ size: 128 }) ?? null,
        botPresent: Boolean(botGuild),
        canManage,
        inVoice,
        hasActivePlayer,
        memberCount: botGuild?.memberCount,
      });
    }

    // Sort: user currently in VC first -> active player -> bot present -> alphabetical
    summaries.sort((a, b) => {
      if (a.inVoice !== b.inVoice) return a.inVoice ? -1 : 1;
      if (a.hasActivePlayer !== b.hasActivePlayer) return a.hasActivePlayer ? -1 : 1;
      if (a.botPresent !== b.botPresent) return a.botPresent ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return summaries;
  }

  async start(): Promise<void> {
    if (!config.hasBotToken) {
      console.warn(
        "[Bot] DISCORD_TOKEN is not configured yet. Complete setup in the web onboarding wizard."
      );
      return;
    }
    await this.client.login(config.discordToken);
  }

  private syncDefaultSearchPlatform(): void {
    if (this.music.manager.options.playerOptions) {
      this.music.manager.options.playerOptions.defaultSearchPlatform =
        config.defaultSearchSource as SearchPlatform;
    }
  }

  async startAndWaitReady(timeoutMs = 15_000): Promise<void> {
    if (!config.hasBotToken) {
      throw new Error("Discord Bot Token is required.");
    }

    if (this.isReady()) {
      this.syncDefaultSearchPlatform();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const readyPromise = new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.client.off(Events.ClientReady, onReady);
        this.client.off(Events.Error, onError);
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for Discord Gateway connection."));
      }, timeoutMs);

      this.client.once(Events.ClientReady, onReady);
      this.client.once(Events.Error, onError);
    });

    try {
      this.syncDefaultSearchPlatform();
      await Promise.all([this.client.login(config.discordToken), readyPromise]);
    } catch (error) {
      await this.resetClient();
      const rawMsg = error instanceof Error ? error.message : String(error);
      const lower = rawMsg.toLowerCase();
      if (lower.includes("disallowed intents")) {
        throw new Error(
          "Discord rejected login because Privileged Gateway Intents are disabled. In Discord Developer Portal -> Bot, enable both Server Members Intent and Message Content Intent, then try again."
        );
      }
      if (lower.includes("invalid token")) {
        throw new Error(
          "Invalid Discord Bot Token. Double-check the token copied from Discord Developer Portal -> Bot."
        );
      }
      throw new Error(rawMsg || "Failed to connect Discord bot.");
    }
  }

  async stop(): Promise<void> {
    for (const guildId of [...this.controllerMessages.keys()]) {
      await this.deleteControllerMessage(guildId).catch(() => {});
    }
    this.clearControllerState();
    await this.music.destroy();
    this.ready = false;
    this.client.destroy();
  }

  private registerDiscordListeners(): void {
    this.client.on("raw", (data) => {
      this.music.manager.sendRawData(data).catch(() => {});
    });

    this.client.once(Events.ClientReady, async (readyClient) => {
      this.ready = true;
      console.log(`[Bot] Logged in as ${readyClient.user.tag} (${readyClient.user.id})`);

      readyClient.user.setPresence({
        activities: [{ name: "/play | Cadence Dashboard", type: ActivityType.Listening }],
        status: "online",
      });

      try {
        await this.music.init(readyClient.user.id, readyClient.user.username);
      } catch (error) {
        console.error("[Lavalink] Failed to initialize manager:", error);
      }

      try {
        await this.registerSlashCommands();
      } catch (error) {
        console.error("[Bot] Failed to register slash commands:", error);
      }
    });

    this.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      const guildId = newState.guild.id;
      const player = this.music.getPlayer(guildId);

      // Bot itself was disconnected externally
      if (newState.id === this.client.user?.id && oldState.channelId && !newState.channelId) {
        if (player) {
          player.destroy("Disconnected from voice channel").catch(() => {});
        }
      }

      if (player) {
        const botVcId = player.voiceChannelId;
        if (oldState.channelId === botVcId || newState.channelId === botVcId) {
          const vc = botVcId ? newState.guild.channels.cache.get(botVcId) : null;
          const humans =
            vc && vc.isVoiceBased() ? vc.members.filter((m) => !m.user.bot).size : 0;
          if (humans === 0) {
            this.music.scheduleInactivityCheck(guildId);
          } else {
            this.music.clearInactivityTimer(guildId);
          }
        }
      }

      this.onGuildStateChange(guildId);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        await this.handleInteraction(interaction);
      } catch (error) {
        console.error("[Bot] Interaction error:", error);
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      try {
        await this.handlePrefixMessage(message);
      } catch (error) {
        console.error("[Bot] Prefix command error:", error);
      }
    });
  }

  private async registerSlashCommands(): Promise<void> {
    if (!this.client.application) return;

    const builders = [
      new SlashCommandBuilder()
        .setName("play")
        .setDescription("Play a song or playlist from YouTube, Spotify, Deezer, SoundCloud, or URL")
        .addStringOption((opt) =>
          opt
            .setName("query")
            .setDescription("Song name or URL")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("source")
            .setDescription("Search platform")
            .addChoices(...SEARCH_SOURCES)
        ),
      new SlashCommandBuilder()
        .setName("search")
        .setDescription("Search for tracks and pick one to play")
        .addStringOption((opt) =>
          opt
            .setName("query")
            .setDescription("Search keywords")
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt
            .setName("source")
            .setDescription("Search platform")
            .addChoices(...SEARCH_SOURCES.filter((s) => s.value !== "auto"))
        ),
      new SlashCommandBuilder().setName("pause").setDescription("Pause playback"),
      new SlashCommandBuilder().setName("resume").setDescription("Resume playback"),
      new SlashCommandBuilder()
        .setName("skip")
        .setDescription("Skip the current track or jump ahead")
        .addIntegerOption((opt) =>
          opt.setName("amount").setDescription("Number of tracks to skip").setMinValue(1).setMaxValue(50)
        ),
      new SlashCommandBuilder().setName("back").setDescription("Play the previous track"),
      new SlashCommandBuilder()
        .setName("seek")
        .setDescription("Seek to a timestamp in seconds")
        .addIntegerOption((opt) =>
          opt.setName("seconds").setDescription("Position in seconds").setRequired(true).setMinValue(0)
        ),
      new SlashCommandBuilder().setName("stop").setDescription("Stop playback and leave voice channel"),
      new SlashCommandBuilder().setName("queue").setDescription("Show the current music queue"),
      new SlashCommandBuilder().setName("nowplaying").setDescription("Show the currently playing track"),
      new SlashCommandBuilder()
        .setName("volume")
        .setDescription("Set player volume (0 - 100%)")
        .addIntegerOption((opt) =>
          opt.setName("percent").setDescription("Volume percentage").setRequired(true).setMinValue(0).setMaxValue(100)
        ),
      new SlashCommandBuilder()
        .setName("loop")
        .setDescription("Set repeat mode")
        .addStringOption((opt) =>
          opt
            .setName("mode")
            .setDescription("Repeat mode")
            .setRequired(true)
            .addChoices(
              { name: "Off", value: "off" },
              { name: "Track", value: "track" },
              { name: "Queue", value: "queue" }
            )
        ),
      new SlashCommandBuilder().setName("shuffle").setDescription("Shuffle the upcoming queue"),
      new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a track from the queue by position")
        .addIntegerOption((opt) =>
          opt.setName("position").setDescription("1-based queue position").setRequired(true).setMinValue(1)
        ),
      new SlashCommandBuilder().setName("clear").setDescription("Clear all upcoming tracks from the queue"),
      new SlashCommandBuilder().setName("autoplay").setDescription("Toggle automatic recommended playback"),
      new SlashCommandBuilder()
        .setName("filter")
        .setDescription("Apply an audio filter preset")
        .addStringOption((opt) =>
          opt
            .setName("preset")
            .setDescription("Filter preset")
            .setRequired(true)
            .addChoices(...FILTER_CHOICES)
        ),
      new SlashCommandBuilder().setName("lyrics").setDescription("Fetch lyrics for the current track"),
      new SlashCommandBuilder()
        .setName("playlist")
        .setDescription("Manage your personal playlists")
        .addSubcommand((sub) => sub.setName("list").setDescription("List your saved playlists"))
        .addSubcommand((sub) =>
          sub
            .setName("create")
            .setDescription("Create a new playlist")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("Playlist name").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Save the currently playing track to a playlist")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("Playlist name").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("play")
            .setDescription("Queue all tracks from a saved playlist")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("Playlist name").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("delete")
            .setDescription("Delete one of your playlists")
            .addStringOption((opt) =>
              opt.setName("name").setDescription("Playlist name").setRequired(true)
            )
        ),
      new SlashCommandBuilder()
        .setName("settings")
        .setDescription("Configure server settings (Manage Server required)")
        .addSubcommand((sub) => sub.setName("view").setDescription("View current server settings"))
        .addSubcommand((sub) =>
          sub
            .setName("volume")
            .setDescription("Set default volume")
            .addIntegerOption((opt) =>
              opt.setName("percent").setDescription("0 - 100").setRequired(true).setMinValue(0).setMaxValue(100)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("247")
            .setDescription("Toggle 24/7 stay-in-channel mode")
            .addBooleanOption((opt) =>
              opt.setName("enabled").setDescription("Keep bot connected when idle").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("dj")
            .setDescription("Set or clear the DJ role")
            .addRoleOption((opt) => opt.setName("role").setDescription("Leave empty to clear DJ role"))
        )
        .addSubcommand((sub) =>
          sub
            .setName("duplicates")
            .setDescription("Allow or block duplicate tracks in queue")
            .addBooleanOption((opt) =>
              opt.setName("allow").setDescription("Allow duplicates").setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("prefix")
            .setDescription("Change text command prefix")
            .addStringOption((opt) =>
              opt.setName("value").setDescription("New prefix (1-5 chars)").setRequired(true).setMaxLength(5)
            )
        ),
      new SlashCommandBuilder().setName("dashboard").setDescription("Get the link to the Cadence web dashboard"),
      new SlashCommandBuilder().setName("ping").setDescription("Check bot and Lavalink latency"),
    ];

    await this.client.application.commands.set(builders.map((b) => b.toJSON()));
    console.log(`[Bot] Synced ${builders.length} slash commands.`);
  }

  private scheduleControllerUpdate(guildId: string): void {
    if (!this.controllerMessages.has(guildId)) return;
    const existingTimer = this.controllerTimers.get(guildId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      this.controllerTimers.delete(guildId);
      void this.invokeController(guildId, { repostIfStale: false });
    }, 350);
    this.controllerTimers.set(guildId, timer);
  }

  private enqueueControllerTask(guildId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.controllerQueues.get(guildId) ?? Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(fn)
      .finally(() => {
        if (this.controllerQueues.get(guildId) === next) {
          this.controllerQueues.delete(guildId);
        }
      });
    this.controllerQueues.set(guildId, next);
    return next;
  }

  private async deleteControllerMessage(guildId: string): Promise<void> {
    const pendingTimer = this.controllerTimers.get(guildId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      this.controllerTimers.delete(guildId);
    }
    await this.enqueueControllerTask(guildId, async () => {
      const ref = this.controllerMessages.get(guildId);
      this.controllerMessages.delete(guildId);
      if (!ref) return;
      try {
        const ch =
          this.client.channels.cache.get(ref.channelId) ??
          (await this.client.channels.fetch(ref.channelId).catch(() => null));
        if (ch && ch.isTextBased() && "messages" in ch) {
          const msg = await ch.messages.fetch(ref.messageId).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        }
      } catch {
        // Ignore missing permissions or already-deleted messages
      }
    });
  }

  private async invokeController(
    guildId: string,
    opts: { repostIfStale?: boolean; forceChannelId?: string; forcePost?: boolean } = {}
  ): Promise<void> {
    await this.enqueueControllerTask(guildId, async () => {
      const player = this.music.getPlayer(guildId);
      const existing = this.controllerMessages.get(guildId);
      const targetChannelId = opts.forceChannelId || player?.textChannelId || existing?.channelId;
      if (!targetChannelId) return;

      const ch =
        this.client.channels.cache.get(targetChannelId) ??
        (await this.client.channels.fetch(targetChannelId).catch(() => null));
      if (!ch || !ch.isTextBased() || !("send" in ch) || !("messages" in ch)) return;

      const state = this.music.serializePlayer(guildId);
      if (!state.current && !existing && !opts.forcePost) {
        return;
      }

      const payload = this.buildNowPlayingPayload(guildId);

      // Move to new channel cleanly if commanded from another channel
      if (existing && existing.channelId !== targetChannelId) {
        try {
          const oldCh =
            this.client.channels.cache.get(existing.channelId) ??
            (await this.client.channels.fetch(existing.channelId).catch(() => null));
          if (oldCh && oldCh.isTextBased() && "messages" in oldCh) {
            const oldMsg = await oldCh.messages.fetch(existing.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          }
        } catch {
          // Ignore cleanup errors
        }
        this.controllerMessages.delete(guildId);
      }

      const currentRef = this.controllerMessages.get(guildId);
      if (currentRef) {
        let shouldRepost = Boolean(opts.forcePost);
        if (!shouldRepost && opts.repostIfStale) {
          try {
            const recent = await ch.messages.fetch({ limit: 5 });
            shouldRepost = !recent.has(currentRef.messageId);
          } catch {
            shouldRepost = false;
          }
        }

        if (shouldRepost) {
          const oldMsg = await ch.messages.fetch(currentRef.messageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
          this.controllerMessages.delete(guildId);
          const sent = await ch.send(payload).catch(() => null);
          if (sent) {
            this.controllerMessages.set(guildId, { channelId: ch.id, messageId: sent.id });
          }
          return;
        }

        const existingMsg = await ch.messages.fetch(currentRef.messageId).catch(() => null);
        if (existingMsg) {
          await existingMsg.edit(payload).catch(() => {});
          return;
        }
        this.controllerMessages.delete(guildId);
      }

      if (state.current || opts.forcePost) {
        const sent = await ch.send(payload).catch(() => null);
        if (sent) {
          this.controllerMessages.set(guildId, { channelId: ch.id, messageId: sent.id });
        }
      }
    });
  }

  private buildNowPlayingPayload(guildId: string): {
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  } {
    const state = this.music.serializePlayer(guildId);
    const track = state.current;
    const settings = this.db.getGuildSettings(guildId);
    const botAvatarUrl = this.client.user?.displayAvatarURL({ size: 128 }) ?? undefined;

    if (!track) {
      const inactiveEmbed = new EmbedBuilder()
        .setColor(INACTIVE_COLOR)
        .setTitle("There are no songs playing right now")
        .setDescription(
          `Use \`/play\` or open the [Cadence Dashboard](${config.dashboardUrl}) to queue music.`
        );
      if (botAvatarUrl) {
        inactiveEmbed.setAuthor({
          name: `Music Controller | ${state.guildName}`,
          iconURL: botAvatarUrl,
        });
      }

      const linkRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Open Dashboard")
          .setStyle(ButtonStyle.Link)
          .setURL(config.dashboardUrl)
      );
      return { embeds: [inactiveEmbed], components: [linkRow] };
    }

    const djLabel = settings.djRoleId
      ? `<@&${settings.djRoleId}>`
      : track.requester
        ? `<@${track.requester.id}>`
        : "Auto";
    const requesterMention = track.requester ? `<@${track.requester.id}>` : "Autoplay";
    const durationLabel = track.isStream ? "LIVE" : formatDuration(track.duration);
    const loopLabel =
      state.repeatMode === "track" ? "Track" : state.repeatMode === "queue" ? "Queue" : "Off";

    const footerParts = [
      `Queue Length: ${state.queue.length}`,
      `Duration: ${durationLabel}`,
      `Volume: ${state.volume}%`,
    ];
    if (state.paused) footerParts.push("Paused");
    if (loopLabel !== "Off") footerParts.push(`Loop: ${loopLabel}`);

    const safeTitle = track.title.replace(/```/g, "'''").slice(0, 180);
    const embed = new EmbedBuilder()
      .setColor(getSourceColor(track.sourceName))
      .setAuthor({
        name: `Music Controller | 📞 ${state.voiceChannelName || state.guildName}`,
        iconURL: botAvatarUrl,
      })
      .setDescription(
        `**Now Playing:**\n\`\`\`[${safeTitle}]\`\`\`\n**Link:** [Click Me](${track.uri || config.dashboardUrl}) | **Requester:** ${requesterMention} | **DJ:** ${djLabel}`
      )
      .setFooter({ text: footerParts.join(" | ") });

    if (track.artworkUrl) {
      embed.setImage(track.artworkUrl);
    }

    const row1 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cadence:back")
        .setEmoji("⏮️")
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(state.previous.length === 0 && track.isStream),
      new ButtonBuilder()
        .setCustomId("cadence:pause")
        .setEmoji(state.paused ? "▶️" : "⏸️")
        .setLabel(state.paused ? "Resume" : "Pause")
        .setStyle(state.paused ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("cadence:skip")
        .setEmoji("⏭️")
        .setLabel("Skip")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("cadence:loop")
        .setEmoji(state.repeatMode === "track" ? "🔂" : "🔁")
        .setLabel(loopLabel === "Off" ? "Loop" : `Loop: ${loopLabel}`)
        .setStyle(state.repeatMode !== "off" ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("cadence:stop")
        .setEmoji("⏹️")
        .setLabel("Leave")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cadence:fav")
        .setEmoji("❤️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(track.isStream),
      new ButtonBuilder()
        .setCustomId("cadence:shuffle")
        .setEmoji("🔀")
        .setLabel("Shuffle")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(state.queue.length < 2),
      new ButtonBuilder()
        .setCustomId("cadence:queue")
        .setEmoji("📋")
        .setLabel("Queue")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setEmoji("🌐")
        .setLabel("Web")
        .setStyle(ButtonStyle.Link)
        .setURL(config.dashboardUrl)
    );

    return { embeds: [embed], components: [row1, row2] };
  }

  private async replyError(interaction: ChatInputCommandInteraction, message: string): Promise<void> {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }

  private requireSameVoice(guildId: string, member: GuildMember): string {
    const memberVc = member.voice.channel;
    if (!memberVc) {
      throw new Error("Join a voice channel first.");
    }
    if (
      memberVc.type !== ChannelType.GuildVoice &&
      memberVc.type !== ChannelType.GuildStageVoice
    ) {
      throw new Error("Unsupported voice channel type.");
    }
    const player = this.music.getPlayer(guildId);
    if (player?.voiceChannelId && player.voiceChannelId !== memberVc.id) {
      throw new Error(`I am already playing in <#${player.voiceChannelId}>.`);
    }
    return memberVc.id;
  }

  private requirePrivileged(guildId: string, userId: string): void {
    if (!this.music.isPrivileged(guildId, userId)) {
      throw new Error("You need Manage Server, the DJ role, or to be alone in voice to do that.");
    }
  }

  private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    if (interaction.commandName !== "play" && interaction.commandName !== "search") return;
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "query") return;

    const raw = String(focused.value || "").trim();
    const userPrefs = this.db.getUserPreferences(interaction.user.id);
    const resolvedSource = userPrefs.defaultSearchSource;

    const choiceValue = (t: TrackDTO): string => {
      if (t.uri && t.uri.length > 0 && t.uri.length <= 100) {
        return t.uri;
      }
      return `${t.author} - ${t.title}`.trim().slice(0, 100);
    };

    const formatTrackChoice = (prefix: string, t: TrackDTO) => {
      const dur = t.isStream ? "LIVE" : formatDuration(t.duration);
      const label = `${prefix} [${dur}] ${t.author} - ${t.title}`.trim().slice(0, 100);
      const val = choiceValue(t);
      return { name: label, value: val };
    };

    const recentTracks: TrackDTO[] = [];
    const seenRecentIds = new Set<string>();
    for (const entry of this.db.getPlayHistory(interaction.user.id, 30)) {
      if (entry.track.identifier && !seenRecentIds.has(entry.track.identifier)) {
        seenRecentIds.add(entry.track.identifier);
        recentTracks.push(entry.track);
      }
    }
    for (const pinned of this.db.getPinnedTracks(interaction.user.id, 10)) {
      if (pinned.track.identifier && !seenRecentIds.has(pinned.track.identifier)) {
        seenRecentIds.add(pinned.track.identifier);
        recentTracks.push(pinned.track);
      }
    }

    if (raw.length < 2) {
      const choices: { name: string; value: string }[] = [];
      const seenValues = new Set<string>();
      for (const track of recentTracks) {
        const choice = formatTrackChoice("🕒", track);
        if (!choice.value || seenValues.has(choice.value.toLowerCase())) continue;
        seenValues.add(choice.value.toLowerCase());
        choices.push(choice);
        if (choices.length >= 25) break;
      }
      await interaction.respond(choices).catch(() => {});
      return;
    }

    if (/^https?:\/\//i.test(raw)) {
      await interaction
        .respond([
          {
            name: `🔗 Play link: ${raw}`.slice(0, 100),
            value: raw.slice(0, 100),
          },
        ])
        .catch(() => {});
      return;
    }

    const qLower = raw.toLowerCase();
    const matchingRecent = recentTracks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(qLower) || t.author.toLowerCase().includes(qLower)
      )
      .slice(0, 4);

    const [searchRes, ytSuggestRes] = await Promise.allSettled([
      Promise.race([
        this.music.search(raw, resolvedSource).catch(() => ({
          tracks: [] as TrackDTO[],
          playlistName: null,
        })),
        new Promise<{ tracks: TrackDTO[]; playlistName: null }>((resolve) =>
          setTimeout(() => resolve({ tracks: [], playlistName: null }), 1600)
        ),
      ]),
      (async () => {
        const res = await fetch(
          `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(raw)}`,
          {
            signal: AbortSignal.timeout(1200),
            headers: { "User-Agent": "Mozilla/5.0" },
          }
        );
        if (!res.ok) return [] as string[];
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data) || !Array.isArray(data[1])) return [] as string[];
        return data[1]
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(0, 6);
      })(),
    ]);

    const choices: { name: string; value: string }[] = [];
    const seenValues = new Set<string>();
    const pushChoice = (choice: { name: string; value: string }) => {
      const cleanName = choice.name.trim().slice(0, 100);
      const cleanValue = choice.value.trim().slice(0, 100);
      if (!cleanName || !cleanValue) return;
      const key = cleanValue.toLowerCase();
      if (seenValues.has(key)) return;
      seenValues.add(key);
      choices.push({ name: cleanName, value: cleanValue });
    };

    for (const track of matchingRecent) {
      pushChoice(formatTrackChoice("🕒", track));
    }

    if (searchRes.status === "fulfilled") {
      for (const track of searchRes.value.tracks.slice(0, 8)) {
        pushChoice(formatTrackChoice("🎵", track));
      }
    }

    if (ytSuggestRes.status === "fulfilled") {
      for (const s of ytSuggestRes.value) {
        pushChoice({ name: `🔍 ${s}`, value: s });
      }
    }

    await interaction.respond(choices.slice(0, 25)).catch(() => {});
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isAutocomplete()) {
      await this.handleAutocomplete(interaction);
      return;
    }
    if (interaction.isButton()) {
      await this.handleButton(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await this.handleSelectMenu(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: "Commands can only be used inside a server.", flags: MessageFlags.Ephemeral });
      return;
    }

    const guildId = interaction.guild.id;
    const member = interaction.member as GuildMember;

    try {
      const ephemeralCommands = new Set(["search", "nowplaying", "dashboard", "ping"]);
      let isEphemeral = ephemeralCommands.has(interaction.commandName);
      if (interaction.commandName === "playlist") {
        isEphemeral = interaction.options.getSubcommand() !== "play";
      } else if (interaction.commandName === "settings") {
        isEphemeral = interaction.options.getSubcommand() === "view";
      }
      await interaction.deferReply(isEphemeral ? { flags: MessageFlags.Ephemeral } : undefined);

      switch (interaction.commandName) {
        case "play": {
          const vcId = this.requireSameVoice(guildId, member);
          const query = interaction.options.getString("query", true);
          const rawSource = (interaction.options.getString("source") || "auto") as SearchSource;
          const source =
            rawSource === "auto"
              ? this.db.getUserPreferences(member.id).defaultSearchSource
              : rawSource;
          const requester = userToRequester(member);
          const { tracks, playlistName } = await this.music.search(query, source, requester);
          if (tracks.length === 0) {
            await interaction.editReply("No matching tracks were found.");
            return;
          }
          const toQueue = playlistName ? tracks : [tracks[0]];
          const result = await this.music.enqueue(
            guildId,
            vcId,
            toQueue,
            "end",
            requester,
            interaction.channelId,
            playlistName ? { queueName: playlistName } : undefined
          );

          if (playlistName) {
            await interaction.editReply(
              `Queued **${result.added}** tracks from **${playlistName}**.`
            );
          } else {
            const first = toQueue[0];
            await interaction.editReply(
              `Queued **${first.title}** by *${first.author}* (\`${formatDuration(first.duration)}\`).`
            );
          }
          void this.invokeController(guildId, {
            repostIfStale: true,
            forceChannelId: interaction.channelId,
          });
          return;
        }

        case "search": {
          this.requireSameVoice(guildId, member);
          const query = interaction.options.getString("query", true);
          const rawSource = (interaction.options.getString("source") || "auto") as SearchSource;
          const source =
            rawSource === "auto"
              ? this.db.getUserPreferences(member.id).defaultSearchSource
              : rawSource;
          const requester = userToRequester(member);
          const { tracks } = await this.music.search(query, source, requester);
          const top = tracks.slice(0, 10);
          if (top.length === 0) {
            await interaction.editReply("No matching tracks found.");
            return;
          }

          const cacheKey = `${guildId}:${member.id}`;
          this.pendingSearchCache.set(cacheKey, top);

          const menu = new StringSelectMenuBuilder()
            .setCustomId(`cadence:pick:${cacheKey}`)
            .setPlaceholder("Choose a track to queue")
            .addOptions(
              top.map((t, idx) => ({
                label: `${idx + 1}. ${t.title}`.slice(0, 100),
                description: `${t.author} • ${formatDuration(t.duration)}`.slice(0, 100),
                value: String(idx),
              }))
            );

          await interaction.editReply({
            content: `Found ${top.length} results for **${query}**:`,
            components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
          });
          return;
        }

        case "pause": {
          this.requireSameVoice(guildId, member);
          await this.music.setPause(guildId, true);
          await interaction.editReply("Paused playback.");
          return;
        }

        case "resume": {
          this.requireSameVoice(guildId, member);
          await this.music.setPause(guildId, false);
          await interaction.editReply("Resumed playback.");
          return;
        }

        case "skip": {
          this.requireSameVoice(guildId, member);
          const amount = interaction.options.getInteger("amount") ?? 1;
          await this.music.skip(guildId, amount);
          await interaction.editReply(amount > 1 ? `Skipped ${amount} tracks.` : "Skipped current track.");
          return;
        }

        case "back": {
          this.requireSameVoice(guildId, member);
          const outcome = await this.music.previous(guildId);
          await interaction.editReply(
            outcome === "restarted" ? "Restarted current track." : "Playing previous track."
          );
          return;
        }

        case "seek": {
          this.requireSameVoice(guildId, member);
          const seconds = interaction.options.getInteger("seconds", true);
          await this.music.seek(guildId, seconds * 1000);
          await interaction.editReply(`Seeked to **${formatDuration(seconds * 1000)}**.`);
          return;
        }

        case "stop": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          await this.music.stop(guildId);
          await interaction.editReply("Stopped playback and disconnected.");
          return;
        }

        case "queue": {
          const state = this.music.serializePlayer(guildId);
          if (!state.current && state.queue.length === 0) {
            await interaction.editReply("The queue is empty.");
            return;
          }
          const lines = state.queue
            .slice(0, 12)
            .map((t, i) => `**${i + 1}.** [${t.title}](${t.uri || config.dashboardUrl}) — \`${formatDuration(t.duration)}\``);
          const embed = new EmbedBuilder()
            .setColor(BRAND_COLOR)
            .setTitle(`Queue • ${interaction.guild.name}`)
            .setDescription(
              `**Now Playing:** ${state.current ? `${state.current.title} (\`${formatDuration(state.current.duration)}\`)` : "Nothing"}\n\n` +
                (lines.length > 0 ? lines.join("\n") : "*No upcoming tracks*")
            );
          if (state.queue.length > 12) {
            embed.setFooter({ text: `And ${state.queue.length - 12} more in dashboard` });
          }
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        case "nowplaying": {
          await this.invokeController(guildId, {
            repostIfStale: true,
            forceChannelId: interaction.channelId,
            forcePost: true,
          });
          await interaction.editReply("Refreshed the music controller below.");
          return;
        }

        case "volume": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const percent = interaction.options.getInteger("percent", true);
          const updated = await this.music.setVolume(guildId, percent);
          await interaction.editReply(`Volume set to **${updated}%**.`);
          return;
        }

        case "loop": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const mode = interaction.options.getString("mode", true) as RepeatModeType;
          await this.music.setRepeatMode(guildId, mode);
          await interaction.editReply(`Loop mode set to **${mode}**.`);
          return;
        }

        case "shuffle": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const count = await this.music.shuffle(guildId);
          await interaction.editReply(`Shuffled **${count}** tracks.`);
          return;
        }

        case "remove": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const pos = interaction.options.getInteger("position", true);
          const removed = await this.music.removeTrack(guildId, pos - 1);
          await interaction.editReply(`Removed **${removed?.title || "track"}** from position #${pos}.`);
          return;
        }

        case "clear": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          await this.music.clearQueue(guildId);
          await interaction.editReply("Cleared the upcoming queue.");
          return;
        }

        case "autoplay": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const next = !this.music.isAutoplayEnabled(guildId);
          await this.music.toggleAutoplay(guildId, next);
          await interaction.editReply(`Autoplay is now **${next ? "enabled" : "disabled"}**.`);
          return;
        }

        case "filter": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const preset = interaction.options.getString("preset", true) as FilterPreset;
          await this.music.applyFilter(guildId, preset);
          await interaction.editReply(
            preset === "none" ? "Cleared all audio filters." : `Applied **${preset}** filter.`
          );
          return;
        }

        case "lyrics": {
          const state = this.music.serializePlayer(guildId);
          if (!state.current) {
            await interaction.editReply("Nothing is playing right now.");
            return;
          }
          const lyrics = await fetchLyrics(
            state.current.title,
            state.current.author,
            state.current.duration,
            this.music.getPlayer(guildId)
          );
          if (!lyrics || !lyrics.plainLyrics) {
            await interaction.editReply(`No lyrics found for **${state.current.title}**.`);
            return;
          }
          const body = lyrics.plainLyrics.slice(0, 3900);
          const embed = new EmbedBuilder()
            .setColor(BRAND_COLOR)
            .setTitle(`${lyrics.title} — ${lyrics.artist}`)
            .setDescription(body)
            .setFooter({ text: `Source: ${lyrics.source}` });
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        case "playlist": {
          await this.handlePlaylistCommand(interaction, member);
          return;
        }

        case "settings": {
          await this.handleSettingsCommand(interaction, member);
          return;
        }

        case "dashboard": {
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setLabel("Open Cadence Dashboard")
              .setStyle(ButtonStyle.Link)
              .setURL(config.dashboardUrl)
          );
          await interaction.editReply({
            content: `Control playback, queue, filters, and playlists live at ${config.dashboardUrl}`,
            components: [row],
          });
          return;
        }

        case "ping": {
          const player = this.music.getPlayer(guildId);
          const lavalinkStatus = this.music.isLavalinkConnected() ? "Connected" : "Disconnected";
          await interaction.editReply(
            `Pong! Discord WS: **${Math.round(this.client.ws.ping)}ms** • Lavalink: **${lavalinkStatus}**${
              player ? ` (${player.ping.lavalink}ms)` : ""
            }`
          );
          return;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Something went wrong.";
      await this.replyError(interaction, msg);
    }
  }

  private async handlePlaylistCommand(
    interaction: ChatInputCommandInteraction,
    member: GuildMember
  ): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const userId = member.id;

    if (sub === "list") {
      const lists = this.db.getUserPlaylists(userId);
      if (lists.length === 0) {
        await interaction.editReply(
          "You have no playlists yet. Create one with `/playlist create` or in the web dashboard."
        );
        return;
      }
      const desc = lists.map((p) => `• **${p.name}** (${p.tracks.length} tracks)`).join("\n");
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(BRAND_COLOR).setTitle("Your Playlists").setDescription(desc)],
      });
      return;
    }

    const name = interaction.options.getString("name", true);
    if (sub === "create") {
      const created = this.db.createPlaylist(userId, name);
      await interaction.editReply(`Created playlist **${created.name}**.`);
      return;
    }

    const playlist = this.db.findPlaylistByName(userId, name);
    if (!playlist) {
      throw new Error(`Playlist "${name}" was not found.`);
    }

    if (sub === "add") {
      const player = this.music.getPlayer(interaction.guildId!);
      if (!player?.queue.current) {
        throw new Error("Play a song first to save it to a playlist.");
      }
      const dto = trackToDTO(player.queue.current);
      this.db.addTrackToPlaylist(userId, playlist.id, dto);
      await interaction.editReply(`Added **${dto.title}** to **${playlist.name}**.`);
      return;
    }

    if (sub === "play") {
      const vcId = this.requireSameVoice(interaction.guildId!, member);
      if (playlist.tracks.length === 0) {
        throw new Error(`Playlist "${playlist.name}" is empty.`);
      }
      const res = await this.music.enqueue(
        interaction.guildId!,
        vcId,
        playlist.tracks,
        "end",
        userToRequester(member),
        interaction.channelId,
        { queueName: playlist.name }
      );
      await interaction.editReply(`Queued **${res.added}** tracks from **${playlist.name}**.`);
      return;
    }

    if (sub === "delete") {
      this.db.deletePlaylist(userId, playlist.id);
      await interaction.editReply(`Deleted playlist **${playlist.name}**.`);
    }
  }

  private async handleSettingsCommand(
    interaction: ChatInputCommandInteraction,
    member: GuildMember
  ): Promise<void> {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();

    if (sub === "view") {
      const s = this.db.getGuildSettings(guildId);
      const embed = new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle(`Settings • ${interaction.guild!.name}`)
        .addFields(
          { name: "Prefix", value: `\`${s.prefix}\``, inline: true },
          { name: "Default Volume", value: `${s.defaultVolume}%`, inline: true },
          { name: "24/7 Mode", value: s.stay247 ? "Enabled" : "Disabled", inline: true },
          { name: "Default Autoplay", value: s.autoplay ? "Enabled" : "Disabled", inline: true },
          { name: "Allow Duplicates", value: s.allowDuplicates ? "Yes" : "No", inline: true },
          { name: "DJ Role", value: s.djRoleId ? `<@&${s.djRoleId}>` : "None", inline: true }
        );
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (
      !member.permissions.has(PermissionsBitField.Flags.ManageGuild) &&
      !member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      throw new Error("You need the **Manage Server** permission to change settings.");
    }

    if (sub === "volume") {
      const percent = interaction.options.getInteger("percent", true);
      this.db.updateGuildSettings(guildId, { defaultVolume: percent });
      await interaction.editReply(`Default volume updated to **${percent}%**.`);
    } else if (sub === "247") {
      const enabled = interaction.options.getBoolean("enabled", true);
      this.db.updateGuildSettings(guildId, { stay247: enabled });
      if (enabled) this.music.clearInactivityTimer(guildId);
      await interaction.editReply(`24/7 mode is now **${enabled ? "enabled" : "disabled"}**.`);
    } else if (sub === "dj") {
      const role = interaction.options.getRole("role");
      this.db.updateGuildSettings(guildId, { djRoleId: role ? role.id : null });
      await interaction.editReply(role ? `DJ role set to <@&${role.id}>.` : "Cleared DJ role.");
    } else if (sub === "duplicates") {
      const allow = interaction.options.getBoolean("allow", true);
      this.db.updateGuildSettings(guildId, { allowDuplicates: allow });
      await interaction.editReply(`Duplicate tracks are now **${allow ? "allowed" : "blocked"}**.`);
    } else if (sub === "prefix") {
      const value = interaction.options.getString("value", true);
      const updated = this.db.updateGuildSettings(guildId, { prefix: value });
      await interaction.editReply(`Text command prefix set to \`${updated.prefix}\`.`);
    }

    this.onGuildStateChange(guildId);
  }

  private async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.guild || !interaction.member) return;

    if (interaction.customId.startsWith("cadence:pick:")) {
      await this.handleSearchSelect(interaction);
      return;
    }

    const guildId = interaction.guild.id;
    const member = interaction.member as GuildMember;

    if (interaction.customId === "cadence:tracks") {
      try {
        this.requireSameVoice(guildId, member);
        this.requirePrivileged(guildId, member.id);
        const index = Number.parseInt(interaction.values[0] || "", 10);
        if (Number.isNaN(index) || index < 0) {
          throw new Error("Selected track is no longer in the queue.");
        }
        await this.music.playTrack(guildId, index);
        await interaction.update(this.buildNowPlayingPayload(guildId)).catch(() => {});
      } catch (error) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content: error instanceof Error ? error.message : "Failed to jump to track.",
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
      }
      return;
    }

    if (interaction.customId === "cadence:effects") {
      try {
        this.requireSameVoice(guildId, member);
        this.requirePrivileged(guildId, member.id);
        const preset = (interaction.values[0] || "none") as FilterPreset;
        await this.music.applyFilter(guildId, preset);
        await interaction.update(this.buildNowPlayingPayload(guildId)).catch(() => {});
      } catch (error) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content: error instanceof Error ? error.message : "Failed to apply audio effect.",
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
      }
    }
  }

  private async handleSearchSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.customId.startsWith("cadence:pick:") || !interaction.guild || !interaction.member) {
      return;
    }
    const cacheKey = interaction.customId.replace("cadence:pick:", "");
    const tracks = this.pendingSearchCache.get(cacheKey);
    const index = Number.parseInt(interaction.values[0] || "", 10);
    if (!tracks || Number.isNaN(index) || !tracks[index]) {
      await interaction.reply({ content: "Search session expired. Run `/search` again.", flags: MessageFlags.Ephemeral });
      return;
    }

    try {
      const member = interaction.member as GuildMember;
      const vcId = this.requireSameVoice(interaction.guild.id, member);
      const picked = tracks[index];
      await this.music.enqueue(
        interaction.guild.id,
        vcId,
        [picked],
        "end",
        userToRequester(member),
        interaction.channelId
      );
      this.pendingSearchCache.delete(cacheKey);
      await interaction.update({
        content: `Queued **${picked.title}** by *${picked.author}*.`,
        components: [],
      });
      void this.invokeController(interaction.guild.id, {
        repostIfStale: true,
        forceChannelId: interaction.channelId,
      });
    } catch (error) {
      await interaction.reply({
        content: error instanceof Error ? error.message : "Failed to queue track.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  private async handleButton(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith("cadence:") || !interaction.guild || !interaction.member) {
      return;
    }

    const guildId = interaction.guild.id;
    const member = interaction.member as GuildMember;
    const cooldownKey = `${guildId}:${member.id}`;
    const now = Date.now();
    const lastPressed = this.buttonCooldowns.get(cooldownKey) ?? 0;
    if (now - lastPressed < 1000) {
      await interaction
        .reply({
          content: "Slow down a bit — try again in a second.",
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {});
      return;
    }
    this.buttonCooldowns.set(cooldownKey, now);

    // Track message ID so external edits know the controller message
    if (interaction.message?.id) {
      this.controllerMessages.set(guildId, {
        channelId: interaction.channelId,
        messageId: interaction.message.id,
      });
    }

    try {
      if (interaction.customId === "cadence:fav") {
        const state = this.music.serializePlayer(guildId);
        if (!state.current) {
          throw new Error("Nothing is playing right now.");
        }
        const res = this.db.toggleLikedTrack(member.id, state.current);
        this.onUserPlaylistsChange(member.id);
        await interaction.reply({
          content: res.liked
            ? `❤️ Added **${state.current.title}** to your **Liked Music** playlist.`
            : `💔 Removed **${state.current.title}** from your **Liked Music** playlist.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.customId === "cadence:queue") {
        const state = this.music.serializePlayer(guildId);
        if (!state.current && state.queue.length === 0) {
          await interaction.reply({ content: "The queue is empty.", flags: MessageFlags.Ephemeral });
          return;
        }
        const lines = state.queue
          .slice(0, 12)
          .map(
            (t, i) =>
              `**${i + 1}.** [${t.title}](${t.uri || config.dashboardUrl}) — \`${t.isStream ? "LIVE" : formatDuration(t.duration)}\``
          );
        const embed = new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle(`Queue • ${state.guildName}`)
          .setDescription(
            `**Now Playing:** ${state.current ? `${state.current.title} (\`${state.current.isStream ? "LIVE" : formatDuration(state.current.duration)}\`)` : "Nothing"}\n\n` +
              (lines.length > 0 ? lines.join("\n") : "*No upcoming tracks*")
          );
        if (state.queue.length > 12) {
          embed.setFooter({ text: `And ${state.queue.length - 12} more in dashboard` });
        }
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.customId === "cadence:lyrics") {
        const state = this.music.serializePlayer(guildId);
        if (!state.current) {
          throw new Error("Nothing is playing right now.");
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const lyrics = await fetchLyrics(
          state.current.title,
          state.current.author,
          state.current.duration,
          this.music.getPlayer(guildId)
        );
        const cleanPlain = stripEnhancedLrcTags(lyrics?.plainLyrics);
        if (!lyrics || !cleanPlain) {
          await interaction.editReply(`No lyrics found for **${state.current.title}**.`);
          return;
        }
        const embed = new EmbedBuilder()
          .setColor(getSourceColor(state.current.sourceName))
          .setTitle(`${lyrics.title} — ${lyrics.artist}`)
          .setDescription(cleanPlain.slice(0, 3900))
          .setFooter({ text: `Source: ${lyrics.source}` });
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      this.requireSameVoice(guildId, member);

      switch (interaction.customId) {
        case "cadence:back":
        case "cadence:prev":
          await this.music.previous(guildId);
          break;
        case "cadence:pause":
          await this.music.togglePause(guildId);
          break;
        case "cadence:skip":
          await this.music.skip(guildId, 1);
          break;
        case "cadence:loop": {
          this.requirePrivileged(guildId, member.id);
          const current = this.music.getPlayer(guildId)?.repeatMode ?? "off";
          const next: RepeatModeType =
            current === "off" ? "queue" : current === "queue" ? "track" : "off";
          await this.music.setRepeatMode(guildId, next);
          break;
        }
        case "cadence:shuffle": {
          this.requirePrivileged(guildId, member.id);
          await this.music.shuffle(guildId);
          break;
        }
        case "cadence:autoplay": {
          this.requirePrivileged(guildId, member.id);
          const next = !this.music.isAutoplayEnabled(guildId);
          await this.music.toggleAutoplay(guildId, next, member.id);
          break;
        }
        case "cadence:voldown": {
          this.requirePrivileged(guildId, member.id);
          const cur = this.music.getUiVolume(guildId);
          const next = Math.max(0, cur - 10);
          if (next > 0) this.lastNonZeroVolume.set(guildId, next);
          await this.music.setVolume(guildId, next);
          break;
        }
        case "cadence:volup": {
          this.requirePrivileged(guildId, member.id);
          const cur = this.music.getUiVolume(guildId);
          const next = Math.min(100, cur + 10);
          if (next > 0) this.lastNonZeroVolume.set(guildId, next);
          await this.music.setVolume(guildId, next);
          break;
        }
        case "cadence:mute": {
          this.requirePrivileged(guildId, member.id);
          const cur = this.music.getUiVolume(guildId);
          if (cur > 0) {
            this.lastNonZeroVolume.set(guildId, cur);
            await this.music.setVolume(guildId, 0);
          } else {
            const restore = this.lastNonZeroVolume.get(guildId) ?? this.db.getGuildSettings(guildId).defaultVolume;
            await this.music.setVolume(guildId, restore > 0 ? restore : 100);
          }
          break;
        }
        case "cadence:rewind": {
          this.requirePrivileged(guildId, member.id);
          const state = this.music.serializePlayer(guildId);
          await this.music.seek(guildId, Math.max(0, state.position - 10_000));
          break;
        }
        case "cadence:forward": {
          this.requirePrivileged(guildId, member.id);
          const state = this.music.serializePlayer(guildId);
          const dur = state.current?.duration || state.position + 10_000;
          await this.music.seek(guildId, Math.min(dur, state.position + 10_000));
          break;
        }
        case "cadence:stop":
          this.requirePrivileged(guildId, member.id);
          await interaction
            .update({
              content: "Stopped playback and disconnected.",
              embeds: [],
              components: [],
            })
            .catch(() => {});
          this.controllerMessages.delete(guildId);
          await this.music.stop(guildId);
          return;
      }

      await interaction.update(this.buildNowPlayingPayload(guildId)).catch(() => {});
    } catch (error) {
      if (interaction.deferred) {
        await interaction
          .editReply({ content: error instanceof Error ? error.message : "Action failed." })
          .catch(() => {});
      } else if (!interaction.replied) {
        await interaction
          .reply({
            content: error instanceof Error ? error.message : "Action failed.",
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
    }
  }

  private async handlePrefixMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.guild || !message.member) return;

    const settings = this.db.getGuildSettings(message.guild.id);
    const prefix = settings.prefix || config.botPrefix;
    if (!message.content.startsWith(prefix)) return;

    const raw = message.content.slice(prefix.length).trim();
    if (!raw) return;

    const [cmdRaw, ...rest] = raw.split(/\s+/);
    const cmd = cmdRaw.toLowerCase();
    const arg = rest.join(" ").trim();
    const guildId = message.guild.id;
    const member = message.member;

    try {
      if (cmd === "play" || cmd === "p") {
        if (!arg) {
          await message.reply(`Usage: \`${prefix}play <song name or URL>\``);
          return;
        }
        const vcId = this.requireSameVoice(guildId, member);
        const requester = userToRequester(member);
        const userSource = this.db.getUserPreferences(member.id).defaultSearchSource;
        const { tracks, playlistName } = await this.music.search(arg, userSource, requester);
        if (tracks.length === 0) {
          await message.reply("No matching tracks found.");
          return;
        }
        const toQueue = playlistName ? tracks : [tracks[0]];
        const res = await this.music.enqueue(
          guildId,
          vcId,
          toQueue,
          "end",
          requester,
          message.channelId,
          playlistName ? { queueName: playlistName } : undefined
        );
        await message.reply(
          playlistName
            ? `Queued **${res.added}** tracks from **${playlistName}**.`
            : `Queued **${toQueue[0].title}** by *${toQueue[0].author}*.`
        );
        void this.invokeController(guildId, {
          repostIfStale: true,
          forceChannelId: message.channelId,
        });
      } else if (cmd === "skip" || cmd === "s") {
        this.requireSameVoice(guildId, member);
        await this.music.skip(guildId, 1);
        await message.reply("Skipped current track.");
      } else if (cmd === "pause") {
        this.requireSameVoice(guildId, member);
        await this.music.setPause(guildId, true);
        await message.reply("Paused playback.");
      } else if (cmd === "resume") {
        this.requireSameVoice(guildId, member);
        await this.music.setPause(guildId, false);
        await message.reply("Resumed playback.");
      } else if (cmd === "stop" || cmd === "leave") {
        this.requireSameVoice(guildId, member);
        this.requirePrivileged(guildId, member.id);
        await this.music.stop(guildId);
        await message.reply("Stopped playback and disconnected.");
      } else if (cmd === "queue" || cmd === "q") {
        const state = this.music.serializePlayer(guildId);
        if (!state.current && state.queue.length === 0) {
          await message.reply("The queue is empty.");
          return;
        }
        const upcoming = state.queue
          .slice(0, 8)
          .map((t, i) => `${i + 1}. ${t.title} (${formatDuration(t.duration)})`)
          .join("\n");
        await message.reply(
          `**Now Playing:** ${state.current?.title || "Nothing"}\n${upcoming || "*No upcoming tracks*"}`
        );
      } else if (cmd === "np" || cmd === "nowplaying") {
        await this.invokeController(guildId, {
          repostIfStale: true,
          forceChannelId: message.channelId,
          forcePost: true,
        });
      }
    } catch (error) {
      await message.reply(error instanceof Error ? error.message : "Command failed.").catch(() => {});
    }
  }
}
