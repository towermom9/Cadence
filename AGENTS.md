# Agent Guidelines

Before writing or modifying any backend, Discord bot, frontend, or Lavalink configuration code, read [CONTRIBUTING.md](CONTRIBUTING.md) in full. Project architecture and conventions evolve rapidly; do not assume legacy patterns or skip verification steps.

## Scope & Safety Constraints

- **Where to make changes:**
  - `server/` — Bun + Hono HTTP/OAuth2/WebSocket backend, `discord.js` v14 bot, `lavalink-client` audio service, and `bun:sqlite` database layer.
  - `web/` — React 19 + Tailwind CSS v4 frontend dashboard.
  - `shared/` — Shared TypeScript DTOs, WebSocket message contracts, artist parsers, and audio volume curves.
  - `lavalink/` — Self-contained Lavalink v4 Docker image, `entrypoint.sh` plugin version resolver, and `application.yml`.
- **What NEVER to touch:**
  - **NEVER** delete, overwrite, or modify `data/` (`data/cadence.sqlite` stores live Discord credentials, OAuth2 sessions, user playlists, and guild settings).
  - Any unit or scratch test that instantiates `CadenceDatabase` **must** point `process.env.DATA_DIR` to an isolated temporary directory (`mkdtempSync(join(tmpdir(), "cadence-test-"))`) before importing `server/db.ts`, and clean it up on exit.

## Mandatory Versioning, Build & Git Rules

1. **Bump `package.json` version on EVERY commit:**
   - Every committed change **must** increment the semantic `"version"` field in `package.json` (e.g., `0.1.2` → `0.1.3`).
   - `/api/health`, `/api/meta`, `/help`, the web footer (`__CADENCE_VERSION__`), and `.github/workflows/docker-publish.yml` all read `"version"` directly from `package.json`.
2. **Verify before committing:**
   - Always run typechecking and a production frontend build before creating a commit:
     ```bash
     bun run typecheck
     bun run build:web
     ```
   - Both commands must exit with code `0`.
   - *(Windows PowerShell note)*: If `bun` or `docker` are not on the default shell `PATH`, prepend them first:
     ```powershell
     $env:PATH = "$env:USERPROFILE\.bun\bin;C:\Program Files\Docker\Docker\resources\bin;$env:PATH"
     ```
3. **Local commits only — do NOT push:**
   - Stage only the modified source files and create a local commit on `main` formatted as `v<version>: <concise summary>`.
   - **NEVER** run `git push` unless the user explicitly asks you to push.

## Technical Guardrails (Avoiding Regressions)

- **Queue Timeline & Autoplay Separation:**
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
- **4-Tier Discord Role-Based Access (No OTP):**
  - Do **not** reintroduce DM OTP verification. Access is determined directly from the authenticated Discord user's identity and guild roles across 4 cascading tiers:
    1. **Tier 1 · User** (`accessRoleIds`, or everyone if empty) — Search, enqueue, personal playlists/likes/pins/history, remove own queued tracks.
    2. **Tier 2 · DJ** (`djRoleId`, or alone in voice channel) — Playback controls, seek, volume, loop, shuffle, autoplay, DSP filters, queue reordering/clearing/dismissing.
    3. **Tier 3 · Admin** (`adminRoleIds`, or Discord `ManageGuild` / `Administrator`) — Server Settings tab and `/settings` command.
    4. **Tier 4 · Server Owner & Bot Owner** — System Settings tab (`/api/system/info`, `/api/system/logs` with automatic secret/webhook/email/IP redaction in `server/logger.ts`).
- **Perceptual Volume Curve & Smooth Updates:**
  - Always convert UI volume (`0–100%`) to Lavalink volume using `uiVolumeToLavalink` in `shared/volume.ts` (`((clamped / 100) ** 1.6) * 100`).
  - Do not trigger full-app React state updates on every slider pixel drag in `useCadenceSocket.setVolume`; rely on the coalesced volume loop in `MusicService.setVolume`.
- **Discord VC Chat Controller:**
  - `MusicService.ensurePlayer` must default `textChannelId` to `voiceChannelId` (and `CadenceBot.invokeController` must fall back to `player.voiceChannelId`) so starting playback from the web dashboard posts the Now Playing controller into the voice channel's text chat.
  - Keep the Discord Now Playing controller buttons clean: Row 1 = `Back`, `Pause`/`Resume`, `Skip`; Row 2 = `Leave`, `❤️`, `Queue`, `Web` (no Loop or Shuffle buttons on the embed).
- **Lavalink YouTube Client Order & Pre-Bundled Plugins:**
  - In `lavalink/application.yml`, keep `WEB` and `ANDROID_VR` ahead of `IOS` in `plugins.youtube.clients` (`MUSIC`, `WEB`, `ANDROID_VR`, `MWEB`, `IOS`, `TV`, `WEBEMBEDDED`, `TVHTML5_SIMPLY`) so `ytsearch:` queries are handled by `WEB` instead of returning empty results on `IOS`.
  - Keep `lavalink/Dockerfile` and `lavalink/entrypoint.sh` self-contained (pre-bundling the latest `youtube-plugin` beta/snapshot, `lavasrc-plugin`, and `lavalyrics-plugin` from `maven.lavalink.dev` without requiring host volume mounts).

## Code Quality & Style

- Reuse shared helpers in `shared/` (`shared/types.ts`, `shared/volume.ts`, `shared/artists.ts`) and `web/src/utils/` (`format.ts`, `theme.ts`, `playlists.ts`, `lrc.ts`) before writing new utilities.
- Avoid obvious comments; only comment non-obvious "whys" (e.g., Lavalink async event races, Innertube client quirks, or timeline index math).
- Do not over-engineer: keep changes focused on what was requested without adding speculative abstractions.