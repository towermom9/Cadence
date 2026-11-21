# Cadence

All-in-one Discord music bot and real-time web dashboard built with TypeScript & Bun, with one-command Docker Compose setup. Inspired by [ChocoMeow/Vocard](https://github.com/ChocoMeow/Vocard).

## Features

- **Unified Single App** — Discord bot (`discord.js`), HTTP/OAuth2 + WebSocket server (`Hono` on `Bun`), React + Tailwind web dashboard, and built-in `bun:sqlite` storage all run inside one process with zero IPC WebSocket hops and no MongoDB container.
- **Multi-Source Playback via Lavalink v4** — Supports **YouTube**, **YouTube Music**, **Spotify**, **Deezer**, **SoundCloud**, **Bandcamp**, **Twitch**, **Vimeo**, direct HTTP audio streams, and optional **Apple Music** out of the box.
- **Real-Time Web Dashboard** — Search across platforms, inspect and reorder the queue, play/pause/seek/volume/loop/shuffle, toggle Autoplay, apply 9 DSP audio filters (Bass Boost, Nightcore, Vaporwave, 8D, Karaoke, Low Pass, Tremolo, Vibrato), read live lyrics via LRCLIB/LavaLyrics, manage personal playlists, and edit per-server settings.
- **Slash & Prefix Commands** — Full slash command suite (`/play`, `/search`, `/queue`, `/filter`, `/playlist`, `/settings`, `/lyrics`, etc.) with interactive Now Playing buttons, plus customizable text prefix shortcuts (`?play`, `?skip`, `?np`, etc.).

## Quick Start with Docker (2 Steps)

### 1. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in your 3 Discord Developer Portal credentials:

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_CLIENT_SECRET=your_oauth2_client_secret
```

### 2. Start the stack

```bash
docker compose up -d --build
```

Then open **http://localhost:8000** (or your `DASHBOARD_URL`).

Docker Compose starts:
- `cadence` — Unified TypeScript/Bun bot + web dashboard + SQLite (`./data`)
- `lavalink` — Lavalink v4 audio server with `youtube-plugin`, `LavaSrc`, and `LavaLyrics`
- `yt-cipher` — Remote cipher helper for YouTube playback
- `spotify-tokener` — Anonymous token helper for Spotify links & search

## Discord Developer Portal Setup

1. Open [Discord Developer Portal](https://discord.com/developers/applications) and select your application.
2. Go to **Bot**:
   - Copy the **Bot Token** -> `DISCORD_TOKEN`
   - Enable **Server Members Intent** (needed for guild/voice member lookups)
   - Enable **Message Content Intent** (if you want `?play`-style text commands)
3. Go to **General Information**:
   - Copy **Application ID** -> `DISCORD_CLIENT_ID`
4. Go to **OAuth2 -> General**:
   - Copy **Client Secret** -> `DISCORD_CLIENT_SECRET`
   - Under **Redirects**, add: `http://localhost:8000/api/auth/callback` (replace `http://localhost:8000` with your `DASHBOARD_URL` if hosted remotely).

## Local Development (Without Building the App Container)

Requires [Bun](https://bun.sh):

```bash
bun install
cp .env.example .env
```

If you want Lavalink + helpers running in Docker while developing Cadence locally:

```bash
docker compose up -d lavalink yt-cipher spotify-tokener
```

Run backend + bot (port `8000`) and Vite frontend dev server (port `5173`, proxying `/api` and `/ws` to `8000`):

```bash
bun run dev
# in another terminal:
bun run dev:web
```

Build production frontend & typecheck:

```bash
bun run typecheck
bun run build:web
bun run start
```

## Credits & Inspiration

Cadence is inspired by [Vocard](https://github.com/ChocoMeow/Vocard) and [Vocard-Dashboard](https://github.com/ChocoMeow/Vocard-Dashboard) by [ChocoMeow](https://github.com/ChocoMeow), reimagined as a unified TypeScript + Bun application with simplified Docker deployment.

## License

[MIT](LICENSE)
