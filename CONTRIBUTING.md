# Contributing to Cadence

Thank you for your interest in contributing to **Cadence**! This document covers the project architecture, development setup, coding standards, and release workflow.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Local Development Setup](#local-development-setup)
4. [Architecture & Core Subsystems](#architecture--core-subsystems)
5. [Versioning & Commit Convention](#versioning--commit-convention)
6. [Testing & Verification](#testing--verification)
7. [Submitting Changes](#submitting-changes)

---

## Prerequisites

- **[Bun](https://bun.sh/)** `v1.2+` (runtime, package manager, and built-in `bun:sqlite` engine)
- **[Docker](https://docs.docker.com/get-docker/)** & **Docker Compose v2+** (for running `lavalink`, `yt-cipher`, and `spotify-tokener`)
- A **Discord Application** with a Bot Token, OAuth2 Client ID & Secret, and **Server Members Intent** + **Message Content Intent** enabled in the [Discord Developer Portal](https://discord.com/developers/applications)

---

## Project Structure

```text
Cadence/
├── .github/workflows/
│   └── docker-publish.yml      # Builds & publishes cadence and cadence-lavalink to GHCR
├── lavalink/
│   ├── Dockerfile              # Self-contained Lavalink v4 image with pre-bundled plugins
│   ├── application.yml         # Lavalink v4, youtube-plugin, LavaSrc, and LavaLyrics config
│   └── entrypoint.sh           # Auto-resolves latest plugin versions from maven.lavalink.dev
├── server/
│   ├── index.ts                # Unified process entrypoint (HTTP, WS, Discord Bot, SQLite)
│   ├── auth.ts                 # Discord OAuth2 session & guild cache helpers
│   ├── bot.ts                  # Discord.js client, 24 slash commands, prefix commands, VC controller
│   ├── config.ts               # Runtime environment & dynamic setup configuration
│   ├── db.ts                   # bun:sqlite schema, migrations, playlists, history, guild settings
│   ├── logger.ts               # Ring-buffer server logger with automatic secret/PII redaction
│   ├── lyrics.ts               # LavaLyrics & LRCLIB synced/ELRC lyrics fetcher
│   ├── music.ts                # LavalinkManager wrapper, timeline queue, autoplay moods, filters
│   ├── setup.ts                # 4-step web onboarding wizard API routes
│   ├── web.ts                  # Hono REST endpoints (/api/me, /api/artwork, /api/explore, etc.)
│   └── ws.ts                   # Real-time WebSocket hub (/ws)
├── shared/
│   ├── artists.ts              # Multi-artist collaboration parser & tag cleaner
│   ├── types.ts                # Shared DTOs and WebSocket client/server message contracts
│   └── volume.ts               # Perceptual volume curve (x^1.6) conversion
└── web/
    ├── index.html              # SPA shell & PWA manifest links
    ├── vite.config.ts          # Vite bundler config (injects __CADENCE_VERSION__)
    └── src/
        ├── App.tsx             # Root application layout, routing, and keyboard shortcuts
        ├── components/         # YouTube Music–inspired React 19 UI components
        ├── hooks/              # useCadenceSocket real-time state & 60fps progress interpolation
        └── utils/              # Theme accents, AMOLED mode, LRC parser, formatters
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
   # Terminal 1 — Backend & Discord bot on http://localhost:8000
   bun run dev

   # Terminal 2 — Vite HMR frontend on http://localhost:5173 (proxies /api and /ws to :8000)
   bun run dev:web
   ```

4. **First-time setup:**
   Open `http://localhost:8000` (or `http://localhost:5173`) to complete the interactive **4-Step Web Onboarding Wizard**, or copy `.env.example` to `.env` and fill in your Discord credentials.

---

## Architecture & Core Subsystems

### 1. Timeline Queue & Autoplay Engine (`server/music.ts`, `NowPlayingView.tsx`)
- Cadence models the queue as a continuous timeline:
  - **`previous`**: Unlimited played tracks above `current` (`maxPreviousTracks: Number.MAX_SAFE_INTEGER`).
  - **`current`**: The active track (`player.queue.current`).
  - **`manualQueue`**: User-queued tracks in `player.queue.tracks` (`!isAutoplayTrack(t)`).
  - **`autoplayQueue`**: Auto-generated recommendations at the tail of `player.queue.tracks` (`t.userData.isAutoplay === 1`).
- **Drag-and-Drop Rules:**
  - Manual/past/current tracks and Autoplay tracks cannot be dragged across the Autoplay boundary.
  - Dragging `current` (`moveCurrentToQueue` / `moveCurrentToPrevious`) shifts the surrounding tracks between `tracks` and `previous` in chronological order **without stopping or restarting audio playback**.
- **Queue Loop (`repeatMode === "queue"`):**
  - Managed via `MusicService.repeatModes` while keeping `lavalink-client`'s internal repeat mode `"off"` so `lavalink-client` does not duplicate `current` at the tail of `player.queue.tracks`.
  - Wrapping past the last manual track loops back to the oldest track in `previous` and ignores Autoplay tracks.

### 2. 4-Tier Discord Role-Based Access (`server/bot.ts`, `server/ws.ts`, `SettingsView.tsx`)
Permissions cascade upward automatically based on the user's Discord account and guild roles:
- **Tier 1 · User** (`accessRoleIds`, or all members when empty): Search, play/enqueue, view queue/lyrics/related, manage personal playlists/likes/pins/history, remove own queued tracks.
- **Tier 2 · DJ** (`djRoleId`, or alone in voice channel): Skip, previous, seek, volume, loop, shuffle, autoplay, DSP filters, queue reordering/clearing/dismissing, disconnect.
- **Tier 3 · Admin** (`adminRoleIds`, or Discord `Manage Server` / `Administrator`): **Server Settings** tab and `/settings` command.
- **Tier 4 · Server Owner & Bot Owner**: **System Settings** tab (`/api/system/info`, `/api/system/logs` with automatic redaction).

### 3. Artwork Proxy & Auto-Retry (`TrackArtwork.tsx`, `server/web.ts`)
- `TrackArtwork` builds a prioritized fallback chain from `track.artworkUrl`, `track.uri` (extracting YouTube video IDs from `watch?v=`, `youtu.be/`, `shorts/`, `embed/`), and `track.identifier`, including `maxresdefault`, `sddefault`, `hqdefault`, `mqdefault`, `0.jpg`, and `default.jpg` both directly and via `/api/artwork`.
- If all candidates fail due to a transient network or rate-limit error, `TrackArtwork` automatically retries up to 4 rounds with backoff and a cache-busting `?retry=N` parameter.

### 4. Self-Contained Lavalink Image (`lavalink/`)
- `lavalink/Dockerfile` resolves the latest `youtube-plugin` (beta/snapshot), `lavasrc-plugin`, and `lavalyrics-plugin` from `https://maven.lavalink.dev` at build time and pre-bundles the `.jar` files into `/opt/Lavalink/bundled-plugins/` and `/opt/Lavalink/plugins/` for ~7-second cold starts.
- At container startup, `lavalink/entrypoint.sh` checks `maven.lavalink.dev` for any newer versions published after the image was built.

---

## Versioning & Commit Convention

1. **Every commit must bump `"version"` in `package.json`**:
   - Increment the patch version (e.g., `0.1.2` → `0.1.3`) before committing.
   - Pushing a changed `package.json` or `lavalink/**` to `main` automatically triggers `.github/workflows/docker-publish.yml` to build and push `ghcr.io/towermom9/cadence` and `ghcr.io/towermom9/cadence-lavalink`.
2. **Commit message format**:
   ```text
   v0.1.3: short imperative summary of changes
   ```

---

## Testing & Verification

1. **Typecheck & Production Build (Mandatory)**:
   ```bash
   bun run typecheck
   bun run build:web
   ```
2. **Database Isolation in Tests**:
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
3. Bump `"version"` in `package.json`.
4. Verify `bun run typecheck` and `bun run build:web` both pass with exit code `0`.
5. Open a Pull Request with a clear description and screenshots for any UI changes.