import {
  ActionRowBuilder,
  ActivityType,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Interaction,
  type Message,
  type StringSelectMenuInteraction,
  StringSelectMenuBuilder,
} from "discord.js";
import type {
  FilterPreset,
  GuildSummaryDTO,
  RepeatModeType,
  SearchSource,
  TrackDTO,
} from "@shared/types";
import { config } from "./config";
import type { CadenceDatabase } from "./db";
import { fetchLyrics } from "./lyrics";
import { MusicService, trackToDTO, userToRequester } from "./music";

export interface DiscordOAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  owner?: boolean;
  permissions: string;
}

const BRAND_COLOR = 0x7c5cff;

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
  readonly client: Client;
  readonly music: MusicService;
  private ready = false;
  private pendingSearchCache = new Map<string, TrackDTO[]>();
  private onGuildStateChange: (guildId: string) => void;

  constructor(
    private db: CadenceDatabase,
    onGuildStateChange?: (guildId: string) => void
  ) {
    this.onGuildStateChange = onGuildStateChange ?? (() => {});

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.music = new MusicService(this.client, this.db, (guildId) => {
      this.onGuildStateChange(guildId);
    });

    this.registerDiscordListeners();
  }

  setStateChangeHandler(handler: (guildId: string) => void): void {
    this.onGuildStateChange = handler;
    this.music.setStateChangeHandler(handler);
  }

  isReady(): boolean {
    return this.ready && Boolean(this.client.user);
  }

  getBotMeta() {
    const user = this.client.user;
    const clientId = user?.id || config.discordClientId || null;
    const inviteUrl = clientId
      ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=36700160&scope=bot%20applications.commands`
      : null;

    return {
      botReady: this.isReady(),
      botId: clientId,
      botName: user?.username || "Cadence",
      botAvatarUrl: user ? user.displayAvatarURL({ size: 256 }) : null,
      inviteUrl,
      lavalinkConnected: this.music.isLavalinkConnected(),
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
        "[Bot] DISCORD_TOKEN is not configured. Running web server only until credentials are set in .env."
      );
      return;
    }
    await this.client.login(config.discordToken);
  }

  async stop(): Promise<void> {
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
          opt.setName("query").setDescription("Song name or URL").setRequired(true)
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
          opt.setName("query").setDescription("Search keywords").setRequired(true)
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
        .setDescription("Set player volume (0 - 150%)")
        .addIntegerOption((opt) =>
          opt.setName("percent").setDescription("Volume percentage").setRequired(true).setMinValue(0).setMaxValue(150)
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
              opt.setName("percent").setDescription("0 - 150").setRequired(true).setMinValue(0).setMaxValue(150)
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

  private buildNowPlayingPayload(guildId: string) {
    const state = this.music.serializePlayer(guildId);
    const track = state.current;

    const embed = new EmbedBuilder().setColor(BRAND_COLOR);
    if (!track) {
      embed.setTitle("Cadence Player").setDescription("Nothing is playing right now.");
      return { embeds: [embed], components: [] };
    }

    embed
      .setAuthor({ name: state.paused ? "Paused" : "Now Playing" })
      .setTitle(track.title)
      .setURL(track.uri || config.dashboardUrl)
      .setDescription(
        `**Artist:** ${track.author}\n**Duration:** ${
          track.isStream ? "LIVE" : `${formatDuration(state.position)} / ${formatDuration(track.duration)}`
        }\n**Source:** ${track.sourceName} • **Volume:** ${state.volume}% • **Loop:** ${state.repeatMode}`
      );

    if (track.artworkUrl) {
      embed.setThumbnail(track.artworkUrl);
    }
    if (track.requester) {
      embed.setFooter({
        text: `Requested by ${track.requester.username} • ${state.queue.length} in queue`,
        iconURL: track.requester.avatarUrl ?? undefined,
      });
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("cadence:prev").setLabel("Prev").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("cadence:pause")
        .setLabel(state.paused ? "Resume" : "Pause")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cadence:skip").setLabel("Skip").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("cadence:loop")
        .setLabel(`Loop: ${state.repeatMode}`)
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("cadence:stop").setLabel("Stop").setStyle(ButtonStyle.Danger)
    );

    const linkRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel("Open Dashboard")
        .setStyle(ButtonStyle.Link)
        .setURL(config.dashboardUrl)
    );

    return { embeds: [embed], components: [row, linkRow] };
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

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isButton()) {
      await this.handleButton(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await this.handleSearchSelect(interaction);
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
      switch (interaction.commandName) {
        case "play": {
          const vcId = this.requireSameVoice(guildId, member);
          await interaction.deferReply();
          const query = interaction.options.getString("query", true);
          const source = (interaction.options.getString("source") || "auto") as SearchSource;
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
            interaction.channelId
          );

          if (playlistName) {
            await interaction.editReply(
              `Queued **${result.added}** tracks from **${playlistName}**.`
            );
          } else {
            const first = toQueue[0];
            await interaction.editReply({
              content: `Queued **${first.title}** by *${first.author}* (\`${formatDuration(first.duration)}\`).`,
              ...this.buildNowPlayingPayload(guildId),
            });
          }
          return;
        }

        case "search": {
          this.requireSameVoice(guildId, member);
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const query = interaction.options.getString("query", true);
          const source = (interaction.options.getString("source") || config.defaultSearchSource) as SearchSource;
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
          await interaction.reply("Paused playback.");
          return;
        }

        case "resume": {
          this.requireSameVoice(guildId, member);
          await this.music.setPause(guildId, false);
          await interaction.reply("Resumed playback.");
          return;
        }

        case "skip": {
          this.requireSameVoice(guildId, member);
          const amount = interaction.options.getInteger("amount") ?? 1;
          await this.music.skip(guildId, amount);
          await interaction.reply(amount > 1 ? `Skipped ${amount} tracks.` : "Skipped current track.");
          return;
        }

        case "back": {
          this.requireSameVoice(guildId, member);
          await this.music.previous(guildId);
          await interaction.reply("Playing previous track.");
          return;
        }

        case "seek": {
          this.requireSameVoice(guildId, member);
          const seconds = interaction.options.getInteger("seconds", true);
          await this.music.seek(guildId, seconds * 1000);
          await interaction.reply(`Seeked to **${formatDuration(seconds * 1000)}**.`);
          return;
        }

        case "stop": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          await this.music.stop(guildId);
          await interaction.reply("Stopped playback and disconnected.");
          return;
        }

        case "queue": {
          const state = this.music.serializePlayer(guildId);
          if (!state.current && state.queue.length === 0) {
            await interaction.reply({ content: "The queue is empty.", flags: MessageFlags.Ephemeral });
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
          await interaction.reply({ embeds: [embed] });
          return;
        }

        case "nowplaying": {
          await interaction.reply(this.buildNowPlayingPayload(guildId));
          return;
        }

        case "volume": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const percent = interaction.options.getInteger("percent", true);
          const updated = await this.music.setVolume(guildId, percent);
          await interaction.reply(`Volume set to **${updated}%**.`);
          return;
        }

        case "loop": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const mode = interaction.options.getString("mode", true) as RepeatModeType;
          await this.music.setRepeatMode(guildId, mode);
          await interaction.reply(`Loop mode set to **${mode}**.`);
          return;
        }

        case "shuffle": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const count = await this.music.shuffle(guildId);
          await interaction.reply(`Shuffled **${count}** tracks.`);
          return;
        }

        case "remove": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const pos = interaction.options.getInteger("position", true);
          const removed = await this.music.removeTrack(guildId, pos - 1);
          await interaction.reply(`Removed **${removed?.title || "track"}** from position #${pos}.`);
          return;
        }

        case "clear": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          await this.music.clearQueue(guildId);
          await interaction.reply("Cleared the upcoming queue.");
          return;
        }

        case "autoplay": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const next = !this.music.isAutoplayEnabled(guildId);
          this.music.toggleAutoplay(guildId, next);
          await interaction.reply(`Autoplay is now **${next ? "enabled" : "disabled"}**.`);
          return;
        }

        case "filter": {
          this.requireSameVoice(guildId, member);
          this.requirePrivileged(guildId, member.id);
          const preset = interaction.options.getString("preset", true) as FilterPreset;
          await this.music.applyFilter(guildId, preset);
          await interaction.reply(
            preset === "none" ? "Cleared all audio filters." : `Applied **${preset}** filter.`
          );
          return;
        }

        case "lyrics": {
          const state = this.music.serializePlayer(guildId);
          if (!state.current) {
            await interaction.reply({ content: "Nothing is playing right now.", flags: MessageFlags.Ephemeral });
            return;
          }
          await interaction.deferReply();
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
          await interaction.reply({
            content: `Control playback, queue, filters, and playlists live at ${config.dashboardUrl}`,
            components: [row],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        case "ping": {
          const player = this.music.getPlayer(guildId);
          const lavalinkStatus = this.music.isLavalinkConnected() ? "Connected" : "Disconnected";
          await interaction.reply({
            content: `Pong! Discord WS: **${Math.round(this.client.ws.ping)}ms** • Lavalink: **${lavalinkStatus}**${
              player ? ` (${player.ping.lavalink}ms)` : ""
            }`,
            flags: MessageFlags.Ephemeral,
          });
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
        await interaction.reply({
          content: "You have no playlists yet. Create one with `/playlist create` or in the web dashboard.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const desc = lists.map((p) => `• **${p.name}** (${p.tracks.length} tracks)`).join("\n");
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor(BRAND_COLOR).setTitle("Your Playlists").setDescription(desc)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const name = interaction.options.getString("name", true);
    if (sub === "create") {
      const created = this.db.createPlaylist(userId, name);
      await interaction.reply({ content: `Created playlist **${created.name}**.`, flags: MessageFlags.Ephemeral });
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
      await interaction.reply({
        content: `Added **${dto.title}** to **${playlist.name}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "play") {
      const vcId = this.requireSameVoice(interaction.guildId!, member);
      if (playlist.tracks.length === 0) {
        throw new Error(`Playlist "${playlist.name}" is empty.`);
      }
      await interaction.deferReply();
      const res = await this.music.enqueue(
        interaction.guildId!,
        vcId,
        playlist.tracks,
        "end",
        userToRequester(member),
        interaction.channelId
      );
      await interaction.editReply(`Queued **${res.added}** tracks from **${playlist.name}**.`);
      return;
    }

    if (sub === "delete") {
      this.db.deletePlaylist(userId, playlist.id);
      await interaction.reply({ content: `Deleted playlist **${playlist.name}**.`, flags: MessageFlags.Ephemeral });
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
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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
      await interaction.reply(`Default volume updated to **${percent}%**.`);
    } else if (sub === "247") {
      const enabled = interaction.options.getBoolean("enabled", true);
      this.db.updateGuildSettings(guildId, { stay247: enabled });
      if (enabled) this.music.clearInactivityTimer(guildId);
      await interaction.reply(`24/7 mode is now **${enabled ? "enabled" : "disabled"}**.`);
    } else if (sub === "dj") {
      const role = interaction.options.getRole("role");
      this.db.updateGuildSettings(guildId, { djRoleId: role ? role.id : null });
      await interaction.reply(role ? `DJ role set to <@&${role.id}>.` : "Cleared DJ role.");
    } else if (sub === "duplicates") {
      const allow = interaction.options.getBoolean("allow", true);
      this.db.updateGuildSettings(guildId, { allowDuplicates: allow });
      await interaction.reply(`Duplicate tracks are now **${allow ? "allowed" : "blocked"}**.`);
    } else if (sub === "prefix") {
      const value = interaction.options.getString("value", true);
      const updated = this.db.updateGuildSettings(guildId, { prefix: value });
      await interaction.reply(`Text command prefix set to \`${updated.prefix}\`.`);
    }

    this.onGuildStateChange(guildId);
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

    try {
      this.requireSameVoice(guildId, member);

      switch (interaction.customId) {
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
        case "cadence:stop":
          this.requirePrivileged(guildId, member.id);
          await this.music.stop(guildId);
          await interaction.update({
            content: "Stopped playback and disconnected.",
            embeds: [],
            components: [],
          });
          return;
      }

      await interaction.update(this.buildNowPlayingPayload(guildId));
    } catch (error) {
      await interaction.reply({
        content: error instanceof Error ? error.message : "Action failed.",
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
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
        const { tracks, playlistName } = await this.music.search(arg, "auto", requester);
        if (tracks.length === 0) {
          await message.reply("No matching tracks found.");
          return;
        }
        const toQueue = playlistName ? tracks : [tracks[0]];
        const res = await this.music.enqueue(guildId, vcId, toQueue, "end", requester, message.channelId);
        await message.reply(
          playlistName
            ? `Queued **${res.added}** tracks from **${playlistName}**.`
            : `Queued **${toQueue[0].title}** by *${toQueue[0].author}*.`
        );
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
        await message.reply(this.buildNowPlayingPayload(guildId));
      }
    } catch (error) {
      await message.reply(error instanceof Error ? error.message : "Command failed.").catch(() => {});
    }
  }
}
