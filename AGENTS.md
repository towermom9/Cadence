# Agent Guidelines

Before writing or modifying any backend, Discord bot, frontend, or Lavalink configuration code, read [CONTRIBUTING.md](CONTRIBUTING.md) in full. Project architecture and conventions evolve rapidly; do not assume legacy patterns or skip verification steps.

## Scope & Directory Ownership

- **Where to make changes:**
  - `server/` - Bun + Hono HTTP/OAuth2/WebSocket backend, `discord.js` v14 bot, `lavalink-client` audio service, and `bun:sqlite` database layer:
    - `server/index.ts` - Single-process entrypoint wiring `CadenceDatabase`, `CadenceBot`, `CadenceWsHub`, and `createWebApp`.
    - `server/config.ts` - Environment variables + SQLite `app_config` overlay (`config.needsSetup`, `config.dataDir`, `config.dashboardUrl`).
    - `server/db.ts` - `CadenceDatabase` schema, idempotent column migrations, sessions, playlists, pins, paginated history, preferences, and guild settings.
    - `server/bot.ts` - Discord gateway client, 23 global slash commands, prefix commands, autocomplete, Music Controller embeds, voice status embeds, and cleanup timers.
    - `server/music.ts` - `MusicService` (`LavalinkManager`), timeline queue operations, Queue Loop wrapping, 7-mood Autoplay, DSP presets, perceptual volume loop, and empty-VC state machine.
    - `server/ws.ts` - `CadenceWsHub` real-time `/ws` router, RBAC enforcement, toast/playerState broadcasts, and playlist/history/settings handlers.
    - `server/web.ts` - Hono REST endpoints (`/api/*`), Discord OAuth2 flow, `/api/artwork` proxy, `/api/recommendations`, `/api/system/*`, and static SPA serving.
    - `server/setup.ts` - 4-step web onboarding wizard routes (`/api/setup/*`).
    - `server/lyrics.ts` - LavaLyrics + LRCLIB synced/ELRC lyrics fetcher.
    - `server/logger.ts` - In-memory ring buffer logger with secret/token/webhook/email/IP redaction.
    - `server/auth.ts` - Discord OAuth2 user/guild fetchers and signed cookie session helpers.
  - `shared/` - Shared TypeScript DTOs & WebSocket message contracts (`types.ts`), artist parser (`artists.ts`), and perceptual volume curve (`volume.ts`).
  - `web/` - React 19 + Tailwind CSS v4 frontend (`App.tsx`, `components/`, `hooks/useCadenceSocket.ts`, `utils/`).
  - `lavalink/` - Self-contained Lavalink v4 Docker image (`Dockerfile`), `entrypoint.sh` plugin version resolver, and `application.yml`.
  - `tests/` - Isolated `bun test` unit tests (`artists.test.ts`, `volume.test.ts`, `lrc.test.ts`, `db.test.ts`).
  - `docs/` - GitHub Pages documentation site (`docs/index.html`, `docs/assets/`, `docs/docs/guides/*`, `docs/docs/reference/*`), deployed by `.github/workflows/pages.yml`.
- **What NEVER to touch:**
  - **NEVER** delete, overwrite, or modify `data/` (`data/cadence.sqlite` stores live Discord credentials, OAuth2 sessions, user playlists, and guild settings).
  - Any unit or scratch test that instantiates `CadenceDatabase` **must** point `process.env.DATA_DIR` to an isolated temporary directory (`mkdtempSync(join(tmpdir(), "cadence-test-"))`) before importing `server/db.ts`, and clean it up on exit.

## Mandatory Versioning, Build & Git Rules

1. **Bump `package.json` version on EVERY commit:**
   - Every committed change **must** increment the semantic `"version"` field in `package.json` (e.g., `0.1.5` -> `0.1.6`).
   - `/api/health`, `/api/system/info`, `/help`, the web footer (`__CADENCE_VERSION__`), and `.github/workflows/docker-publish.yml` all read `"version"` directly from `package.json`.
   - Enable the pre-commit verification hook locally with `git config core.hooksPath .githooks`.
2. **Verify before committing:**
   - Always run typechecking, unit tests, and a production frontend build before creating a commit:
     ```bash
     bun run verify
     ```
     (Runs `bun run typecheck && bun test && bun run build:web`; all must exit with code `0`.)
   - *(Windows PowerShell note)*: If `bun` or `docker` are not on the default shell `PATH`, prepend them first:
     ```powershell
     $env:PATH = "$env:USERPROFILE\.bun\bin;C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
     ```
3. **Local commits only - do NOT push:**
   - Stage only the modified/created files relevant to your change (never `data/` or unrelated unstaged files) and create a local commit on `main` formatted as `v<version>: <concise summary>`.
   - **NEVER** run `git push` unless the user explicitly asks you to push.

## Technical Guardrails (Avoiding Regressions)

- **SQLite Schema & Idempotent Migrations (`server/db.ts`):**
  - Core tables are `guild_settings`, `playlists`, `play_history`, `sessions`, `app_config`, `user_preferences`, and `pinned_tracks`.
  - Never issue breaking `DROP TABLE` migrations on existing tables. Add new columns using `PRAGMA table_info(<table>)` checks + conditional `ALTER TABLE ... ADD COLUMN ...` statements with safe defaults.
  - Normalize and clamp numeric settings (`defaultVolume`, `pauseOnEmptySeconds`, `emptyVcDisconnectMinutes`, `artworkSeekSeconds`) in `server/db.ts` so invalid values cannot persist or crash timers.
- **Queue Timeline & Autoplay Separation (`server/music.ts`, `NowPlayingView.tsx`):**
  - The queue timeline consists of four logical sections: `previous` (unlimited played history above `current`), `current` (active track), `manual` (non-autoplay tracks in `player.queue.tracks`), and `autoplay` (`track.userData.isAutoplay === 1`).
  - Never allow dragging manual/current/past tracks into the Autoplay section, and never allow dragging Autoplay tracks into the main/current/past queue (`NowPlayingView.tsx` and `MusicService.moveTrack` / `moveQueueToPrevious`).
  - Always clear `isAutoplay` (`clearAutoplayFlag`) on `trackStart` and on all tracks requeued by `playPrevious` so played Autoplay songs never bounce back into the Autoplay section.
- **Non-Interrupting Current Track Drag:**
  - Dragging the currently playing track (`moveCurrentToQueue` / `moveCurrentToPrevious`) must **never** stop or replace `player.queue.current`. Shift the passed-over tracks between `player.queue.tracks` and `player.queue.previous` in chronological order while `current` continues playing uninterrupted.
- **Queue Loop (`repeatMode === "queue"`) Ignores Autoplay:**
  - Logical repeat mode is tracked in `MusicService.repeatModes` while `lavalink-client`'s internal `player.repeatMode` is kept at `"off"` when looping the queue (and `"track"` only for single-track repeat).
  - Do not set `player.setRepeatMode("queue")` directly on `lavalink-client`, because `lavalink-client` pushes duplicate copies of `current` onto the end of `player.queue.tracks` (after Autoplay).
  - When `getRepeatMode(guildId) === "queue"` and playback reaches or skips past the last manual track, wrap around to the oldest track in `player.queue.previous` and ignore Autoplay tracks completely.
- **Dismiss Queue Ghost-Track Suppression:**
  - Lavalink emits an asynchronous `TrackEndEvent` after `stopPlaying(true, false)`. Keep the `dismissedGuilds` timestamp guard in `trackEnd` and `queueEnd` so stopped tracks are not pushed back into `player.queue.previous`.
- **Queue Loop History Deduplication & Playlist Grouping:**
  - When `repeatMode === "queue"` wraps around (`queueLoopWrapped`), skip calling `db.recordPlayHistory` so looped tracks/playlists do not flood `play_history`. Store `playlistName` on initial playlist playback so history groups consecutive playlist tracks cleanly.
- **4-Tier Discord Role-Based Access (No OTP):**
  - Do **not** reintroduce DM OTP verification. Access is determined directly from the authenticated Discord user's identity and guild roles across 4 cascading tiers (`getAccessTier` in `server/bot.ts`, enforced in `server/ws.ts` & `server/web.ts`):
    1. **Tier 1 · User** (`accessRoleIds`, or everyone if empty) - Search, enqueue (`/play`, `/playnext`, `/playnow`), personal playlists/likes/pins/history, remove own queued tracks.
    2. **Tier 2 · DJ** (`djRoleId`, or alone in voice channel) - Playback controls, seek, volume, loop, shuffle, autoplay, DSP filters, queue reordering/clearing/dismissing.
    3. **Tier 3 · Admin** (`adminRoleIds`, or Discord `ManageGuild` / `Administrator`) - Server Settings tab and `/settings` command.
    4. **Tier 4 · Server Owner & Bot Owner** - System Settings tab (`/api/system/info`, `/api/system/logs` with automatic secret/webhook/email/IP redaction in `server/logger.ts`).
- **Perceptual Volume Curve & Smooth Updates:**
  - Always convert UI volume (`0-100%`) to Lavalink volume using `uiVolumeToLavalink` in `shared/volume.ts` (`((clamped / 100) ** 1.6) * 100`).
  - Do not trigger full-app React state updates on every slider pixel drag in `useCadenceSocket.setVolume`; rely on the coalesced volume loop in `MusicService.setVolume`.
- **Discord Slash Commands, Controller & Status Embed Hygiene (`server/bot.ts`):**
  - Keep `registerSlashCommands()` synced globally (`23` commands including `/play`, `/playnext`, `/playnow`, `/settings playnext`) and never register duplicate guild-scoped copies alongside global commands. Respect Discord's 100-char limit on command/option descriptions and choice names/values.
  - `MusicService.ensurePlayer` must default `textChannelId` to `voiceChannelId` (and `CadenceBot.invokeController` must fall back to `player.voiceChannelId`) so starting playback from the web dashboard posts the Now Playing controller into the voice channel's text chat.
  - Keep the Discord Now Playing controller buttons clean: Row 1 = `Back`, `Pause`/`Resume`, `Skip`; Row 2 = `Leave`, `❤️`, `Queue`, `Web` (no Loop or Shuffle buttons on the embed, and no phone emoji in the author header).
  - Style voice-status notices (`postVoiceStatusMessage`) as `EmbedBuilder` cards (`Music Controller | <Guild>` author header with `BRAND_COLOR` for resume and `INACTIVE_COLOR` for pause/countdown/disconnect) rather than plain text messages.
  - Track transient command replies (`trackBotReply`) and voice status messages (`statusMessages`) per guild so previous notices are deleted automatically instead of cluttering Discord chat.
- **Empty Voice Channel Auto-Pause, Auto-Resume & Auto-Disconnect:**
  - When all non-bot (and optionally non-deafened when `ignoreDeafenedListeners` is enabled) members leave the bot's voice channel and `pauseOnEmpty` is enabled, `MusicService.handleVoiceChannelEmpty` waits `pauseOnEmptySeconds` (`0-300s`) before pausing playback, announcing the pause in Discord chat, and recording `autoPausedByEmptyVc`, rather than destroying the player via `scheduleInactivityCheck`.
  - When `stay247` is disabled and `emptyVcDisconnectMinutes > 0` (`0-120m`), `scheduleEmptyVcDisconnect` disconnects the bot if nobody returns after extended auto-pause.
  - When an active listener joins (`handleVoiceChannelOccupied`), cancel any active countdown/disconnect timers and automatically resume playback only if `autoPausedByEmptyVc` was set (never override a manual pause made while listeners were present).
- **Frontend Theme Tokens & Auto-Save Server Settings (`web/`):**
  - Style interactive accents via CSS custom properties (`--cadence-accent`, `--cadence-accent-fg`) from `web/src/utils/theme.ts` so all 10 theme accents and `BackgroundMode` (`amoled`, `dark`, `elevated`) stay consistent.
  - Server Settings in `SettingsView.tsx` auto-save automatically (`commitServerPatch` sends `updateSettings` with `silent: true` immediately for switches/role pills and debounced at `350ms` for sliders and the prefix input). Do not reintroduce a manual "Save Changes" button unless explicitly requested.
- **Lavalink YouTube Client Order & Pre-Bundled Plugins:**
  - In `lavalink/application.yml`, keep `WEB` and `ANDROID_VR` ahead of `IOS` in `plugins.youtube.clients` (`MUSIC`, `WEB`, `ANDROID_VR`, `MWEB`, `IOS`, `TV`, `WEBEMBEDDED`, `TVHTML5_SIMPLY`) so `ytsearch:` queries are handled by `WEB` instead of returning empty results on `IOS`.
  - Keep `lavalink/Dockerfile` and `lavalink/entrypoint.sh` self-contained (pre-bundling the latest `youtube-plugin` beta/snapshot, `lavasrc-plugin`, and `lavalyrics-plugin` from `maven.lavalink.dev` without requiring host volume mounts).

## Code Quality & Documentation Style

- Reuse shared helpers in `shared/` (`types.ts`, `volume.ts`, `artists.ts`) and `web/src/utils/` (`format.ts`, `theme.ts`, `playlists.ts`, `lrc.ts`) before writing new utilities.
- Avoid literal em-dashes (`\u2014`) in UI copy, bot messages, and documentation; use standard hyphens (`-`) instead.
- When adding/changing Discord commands, RBAC rules, settings, or deployment config, keep [README.md](README.md) and `docs/` in sync.
- Avoid obvious comments; only comment non-obvious "whys" (e.g., Lavalink async event races, Innertube client quirks, or timeline index math).
- Do not over-engineer: keep changes focused on what was requested without adding speculative abstractions.
