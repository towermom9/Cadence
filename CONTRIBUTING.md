# Contributing to Cadence

Thank you for your interest in contributing to **Cadence**! This guide covers the repository structure, local development workflow, backend & frontend architecture, database schema, WebSocket/REST contracts, documentation workflows, and verification standards.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Local Development Setup](#local-development-setup)
4. [Architecture & Core Subsystems](#architecture--core-subsystems)
5. [Database Schema & Migrations](#database-schema--migrations)
6. [HTTP & WebSocket Contracts](#http--websocket-contracts)
7. [Frontend Conventions](#frontend-conventions)
8. [GitHub Pages & GitHub Wiki](#github-pages--github-wiki)
9. [Versioning & Commit Convention](#versioning--commit-convention)
10. [Testing & Verification](#testing--verification)
11. [Submitting Changes](#submitting-changes)

---

## Prerequisites

- **[Bun](https://bun.sh/)** `v1.2+` (runtime, package manager, test runner, and built-in `bun:sqlite`)
- **[Docker](https://docs.docker.com/get-docker/)** & **Docker Compose v2+** (for running `lavalink`, `yt-cipher`, and `spotify-tokener`)
- A **Discord Application** with a Bot Token, OAuth2 Client ID & Secret, and **Server Members Intent** + **Message Content Intent** enabled in the [Discord Developer Portal](https://discord.com/developers/applications)

---

## Project Structure

```text
Cadence/
├── .githooks/
│   └── pre-commit              # Enforces package.json version bump & runs typecheck
├── .github/workflows/
│   ├── docker-publish.yml      # Builds & publishes cadence and cadence-lavalink to GHCR
│   ├── pages.yml               # Deploys docs/ to GitHub Pages
│   └── wiki-sync.yml           # Syncs wiki/*.md to the GitHub Wiki repository
├── docs/
│   └── index.html              # GitHub Pages landing & quick-reference site
├── wiki/                       # Markdown documentation synced to GitHub Wiki
├── lavalink/
│   ├── Dockerfile              # Self-contained Lavalink v4 image with pre-bundled plugins
│   ├── application.yml         # Lavalink v4, youtube-plugin, LavaSrc, and LavaLyrics config
│   └── entrypoint.sh           # Auto-resolves latest plugin versions from maven.lavalink.dev
├── server/
│   ├── index.ts                # Unified process entrypoint (HTTP, WS, Discord Bot, SQLite)
│   ├── auth.ts                 # Discord OAuth2 session & guild cache helpers
│   ├── bot.ts                  # Discord.js client, 23 slash commands, prefix commands, VC controller
│   ├── config.ts               # Runtime environment & SQLite app_config overlay
│   ├── db.ts                   # bun:sqlite schema, migrations, playlists, paginated history, settings
│   ├── logger.ts               # Ring-buffer server logger with automatic secret/PII redaction
│   ├── lyrics.ts               # LavaLyrics & LRCLIB synced/ELRC lyrics fetcher
│   ├── music.ts                # LavalinkManager wrapper, timeline queue, autoplay moods, filters
│   ├── setup.ts                # 4-step web onboarding wizard API routes (/api/setup/*)
│   ├── web.ts                  # Hono REST endpoints & static asset / SPA fallback server
│   └── ws.ts                   # Real-time WebSocket hub (/ws)
├── shared/
│   ├── artists.ts              # Multi-artist collaboration parser & "- Topic" cleaner
│   ├── types.ts                # Shared DTOs and WebSocket client/server message contracts
│   └── volume.ts               # Perceptual volume curve (x^1.6) conversion
├── tests/
│   ├── artists.test.ts         # Artist parser & cleaner unit tests
│   ├── db.test.ts              # Isolated SQLite persistence tests (temp DATA_DIR)
│   ├── lrc.test.ts             # Synced LRC / ELRC parser unit tests
│   └── volume.test.ts          # Perceptual volume curve rounding & clamping tests
└── web/
    ├── index.html              # SPA shell & PWA manifest links
    ├── vite.config.ts          # Vite bundler config (injects __CADENCE_VERSION__)
    └── src/
        ├── App.tsx             # Root application layout, navigation, context menus & hotkeys
        ├── components/         # React 19 UI views, PlayerBar, NowPlayingView, SettingsView, AppFooter
        ├── hooks/              # useCadenceSocket real-time state & 60fps progress interpolation
        └── utils/              # Theme accents, AMOLED surfaces, LRC parser, playlist/format helpers
```

---

## Local Development Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Start the Lavalink audio stack in Docker:**
   ```bash
   docker compose up -d lavalink yt-cipher spotify-tokener
   ```

3. **Run the backend + Discord bot and the Vite frontend dev server:**
   ```bash
   # Terminal 1 - Backend & Discord bot on http://localhost:8000
   bun run dev

   # Terminal 2 - Vite HMR frontend on http://localhost:5173 (proxies /api and /ws to :8000)
   bun run dev:web
   ```

4. **First-time setup:**
   Open `http://localhost:8000` (or `http://localhost:5173`) to complete the interactive **4-Step Web Onboarding Wizard**, or copy `.env.example` to `.env` and fill in your Discord credentials. Note that `.env` values are overlaid cleanly by `server/config.ts` and persisted config lives in `data/cadence.sqlite` (`app_config`).

---

## Architecture & Core Subsystems

### 1. Timeline Queue & Autoplay Engine (`server/music.ts`, `NowPlayingView.tsx`)
- Cadence models the queue as a continuous timeline:
  - **`previous`**: Unlimited played tracks above `current` (`maxPreviousTracks: Number.MAX_SAFE_INTEGER`).
  - **`current`**: The active track (`player.queue.current`).
  - **`manualQueue`**: User-queued tracks in `player.queue.tracks` (`!isAutoplayTrack(t)`).
  - **`autoplayQueue`**: Auto-generated recommendations at the tail of `player.queue.tracks` (`t.userData.isAutoplay === 1`).
- **Enqueue Modes:**
  - `"end"` - Appends before Autoplay suggestions (default `/play`).
  - `"next"` - Inserts directly at index `0` of `player.queue.tracks` (`/playnext`, or `/play` when `defaultPlayNext` is enabled).
  - `"now"` - Inserts at the front and starts playing immediately (`/playnow`).
  - `"replace"` - Replaces the active queue (used by playlist playback).
- **Drag-and-Drop Rules:**
  - Manual/past/current tracks and Autoplay tracks cannot be dragged across the Autoplay boundary.
  - Dragging `current` (`moveCurrentToQueue` / `moveCurrentToPrevious`) shifts surrounding tracks between `tracks` and `previous` in chronological order **without stopping or restarting audio playback**.
- **Queue Loop (`repeatMode === "queue"`):**
  - Managed via `MusicService.repeatModes` while keeping `lavalink-client`'s internal repeat mode `"off"` so `lavalink-client` does not duplicate `current` at the tail of `player.queue.tracks`.
  - Wrapping past the last manual track loops back to the oldest track in `previous`, ignores Autoplay tracks, and sets `queueLoopWrapped` so looped tracks do not flood `play_history`.
- **Empty Voice Channel Auto-Pause, Auto-Resume & Auto-Disconnect:**
  - When all active human listeners leave the voice channel (optionally excluding self/server-deafened members when `ignoreDeafenedListeners` is enabled) and `pauseOnEmpty` is enabled, playback continues for `pauseOnEmptySeconds` (`0s` immediate up to `300s` / `5m`) before pausing and posting a styled status embed in Discord.
  - If `stay247` is disabled and `emptyVcDisconnectMinutes > 0` (`5m-120m`), `scheduleEmptyVcDisconnect` leaves the voice channel after extended auto-pause.
  - When an active listener joins, any pending countdown/disconnect timers are cancelled and playback resumes automatically only if `autoPausedByEmptyVc` was set.

### 2. 4-Tier Discord Role-Based Access (`server/bot.ts`, `server/ws.ts`, `SettingsView.tsx`)
Permissions cascade upward automatically based on the user's Discord account and guild roles:
- **Tier 1 · User** (`accessRoleIds`, or all members when empty): Search, `/play`, `/playnext`, `/playnow`, view queue/lyrics/related, manage personal playlists/likes/pins/history, remove own queued tracks.
- **Tier 2 · DJ** (`djRoleId`, or alone in voice channel): Skip, previous, seek, volume, loop, shuffle, autoplay, DSP filters, queue reordering/clearing/dismissing, disconnect.
- **Tier 3 · Admin** (`adminRoleIds`, or Discord `Manage Server` / `Administrator`): **Server Settings** tab and `/settings` command.
- **Tier 4 · Server Owner & Bot Owner**: **System Settings** tab (`/api/system/info`, `/api/system/logs` with automatic redaction).

### 3. Artwork Proxy & Auto-Retry (`TrackArtwork.tsx`, `server/web.ts`)
- `TrackArtwork` builds a prioritized fallback chain from `track.artworkUrl`, `track.uri` (extracting YouTube video IDs from `watch?v=`, `youtu.be/`, `shorts/`, `embed/`), and `track.identifier`, including `maxresdefault`, `sddefault`, `hqdefault`, `mqdefault`, `0.jpg`, and `default.jpg` both directly and via `/api/artwork`.
- `/api/artwork` enforces an HTTPS allowlist (`ytimg.com`, `googleusercontent.com`, `scdn.co`, `spotifycdn.com`, `sndcdn.com`, `discordapp.com`, `dzcdn.net`, `mzstatic.com`, `bcbits.com`), rejects YouTube's `1097`-byte placeholder image so the client falls back cleanly, and sets a 24-hour cache header.
- If all candidates fail due to a transient error, `TrackArtwork` retries up to 4 rounds with backoff and a `?retry=N` query parameter.

### 4. Self-Contained Lavalink Image (`lavalink/`)
- `lavalink/Dockerfile` resolves the latest `youtube-plugin` (beta/snapshot), `lavasrc-plugin`, and `lavalyrics-plugin` from `https://maven.lavalink.dev` at build time and pre-bundles the `.jar` files into `/opt/Lavalink/bundled-plugins/` and `/opt/Lavalink/plugins/` for ~7-second cold starts.
- Keep `WEB` and `ANDROID_VR` ahead of `IOS` in `lavalink/application.yml` so YouTube searches resolve reliably.

---

## Database Schema & Migrations

Cadence uses `bun:sqlite` in WAL mode (`server/db.ts`) stored at `$DATA_DIR/cadence.sqlite`:

| Table | Purpose |
|-------|---------|
| `app_config` | Singleton row (`id = 1`) for onboarding credentials, `dashboard_url`, `bot_prefix`, `owner_user_id` |
| `guild_settings` | Per-server prefix, default volume, RBAC role IDs, `stay_247`, `autoplay`, `allow_duplicates`, `default_play_next`, empty-VC timers & `ignore_deafened_listeners` |
| `user_preferences` | Per-user JSON & sort preferences (`themeAccent`, `backgroundMode`, `ambienceMode`, `artworkSeekSeconds`, etc.) |
| `playlists` | User-owned playlists (`tracks_json`, `is_liked`, `is_pinned`, `source_url`, `last_synced_at`, `last_played_at`, `sort_order`) |
| `pinned_tracks` | Ordered "Listen again" home shelf pins (`(user_id, track_id)`) |
| `play_history` | User playback log (`track_json`, `played_at`, `playlist_name`) queried with `LIMIT`/`OFFSET` pagination |
| `sessions` | Discord OAuth2 web sessions (`expires_at`) |

**Migration Rule:** Add new columns lazily inside `CadenceDatabase.initSchema()` using `PRAGMA table_info(<table>)` + `ALTER TABLE ... ADD COLUMN ...` with safe defaults.

---

## HTTP & WebSocket Contracts

### Key REST Endpoints (`server/web.ts`, `server/setup.ts`)
- `GET /api/health` - Process health, version, setup status, and Lavalink readiness
- `GET /api/meta` - Public `AppMetaDTO` (bot status, OAuth status, Lavalink version)
- `GET /api/setup/status`, `POST /api/setup/test-token`, `POST /api/setup/complete` - Web onboarding wizard
- `GET /api/auth/login`, `GET /api/auth/callback`, `POST /api/auth/logout`, `GET /api/me` - Discord OAuth2 & session bootstrap
- `POST /api/preferences` - Persist user UI preferences in SQLite + `cadence_prefs` cookie
- `GET /api/history?limit=&offset=` - Paginated play history
- `GET /api/recommendations`, `GET /api/explore`, `GET /api/search/suggest`, `GET /api/artist`, `GET /api/related`, `GET /api/artwork`
- `GET /api/system/info`, `GET /api/system/logs` - Tier 4 Owner diagnostics & redacted log report

### Real-Time WebSocket Hub (`server/ws.ts`, `shared/types.ts`)
- Upgrade endpoint at `/ws` authenticates via session cookie and pushes `ready`, `meta`, `preferences`, `playerState`, `playlists`, `pinnedTracks`, `historyPage`, `settings`, `lyrics`, `searchResults`, and `toast`.
- `updateSettings` accepts `{ type: "updateSettings", guildId, settings, silent?: boolean }`: Server Settings auto-save passes `silent: true` so changes persist immediately without toast spam, while syncing `pauseOnEmpty` / `pauseOnEmptySeconds` back to user preferences when changed.

---

## Frontend Conventions

- **Theme Accent Variables (`web/src/utils/theme.ts`)**: Interactive brand colors use `--cadence-accent` and `--cadence-accent-fg` alongside `backgroundMode` (`dark`, `amoled`, `elevated`).
- **Auto-Saving Server Settings (`SettingsView.tsx`)**: Switches and role pills save immediately; the `Text Command Prefix` input and sliders (`defaultVolume`, `pauseOnEmptySeconds`, `emptyVcDisconnectMinutes`) debounce for `350ms` via `commitServerPatch(..., { debounce: true })` and display an inline auto-save status badge in the Server header.
- **No Em-Dashes:** Keep all UI copy, Discord embeds, and documentation free of literal em-dashes (`\u2014`); use hyphens (`-`).

---

## GitHub Pages & GitHub Wiki

- **GitHub Pages (`docs/index.html`):** Static dark landing page deployed by `.github/workflows/pages.yml` on pushes to `main` touching `docs/**`. To enable in a fork/repo, open **Settings -> Pages** and set **Source** to **GitHub Actions**.
- **GitHub Wiki (`wiki/*.md`):** Markdown documentation synced to the `<repo>.wiki.git` repository by `.github/workflows/wiki-sync.yml` on pushes to `main` touching `wiki/**`. GitHub requires creating one initial placeholder page in the repository's **Wiki** tab before the workflow can push commits to `<repo>.wiki.git`.

---

## Versioning & Commit Convention

1. **Every commit must bump `"version"` in `package.json`**:
   - Increment the patch version (e.g., `0.1.5` -> `0.1.6`) before committing.
   - Pushing a changed `package.json` or `lavalink/**` to `main` automatically triggers `.github/workflows/docker-publish.yml` to build and push `ghcr.io/towermom9/cadence` and `ghcr.io/towermom9/cadence-lavalink`.
2. **Commit message format**:
   ```text
   v0.1.6: short imperative summary of changes
   ```

---

## Testing & Verification

1. **Typecheck, Unit Tests & Production Build (Mandatory)**:
   ```bash
   bun run verify
   ```
   Or run each step individually:
   ```bash
   bun run typecheck
   bun test
   bun run build:web
   ```
2. **Pre-Commit Hook**:
   Enable the repository hook once after cloning:
   ```bash
   git config core.hooksPath .githooks
   ```
3. **Database Isolation in Tests**:
   - **Never** run tests against `data/cadence.sqlite`.
   - Always create a temporary directory and set `process.env.DATA_DIR` before importing `server/db.ts`:
     ```ts
     import { mkdtempSync, rmSync } from "node:fs";
     import { tmpdir } from "node:os";
     import { join } from "node:path";

     const tempDir = mkdtempSync(join(tmpdir(), "cadence-test-"));
     process.env.DATA_DIR = tempDir;
     const { CadenceDatabase } = await import("./server/db");
     ```

---

## Submitting Changes

1. Fork the repository and create a feature branch from `main`.
2. Implement your changes following the guardrails in [AGENTS.md](AGENTS.md).
3. Update `README.md`, `docs/`, or `wiki/` if user-facing behavior or configuration changed.
4. Bump `"version"` in `package.json`.
5. Verify `bun run verify` passes cleanly with exit code `0`.
6. Open a Pull Request with a clear summary and screenshots for any UI changes.
