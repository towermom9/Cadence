# Cadence

All-in-one Discord music bot and real-time web dashboard built with TypeScript & Bun, with one-command Docker Compose setup and a built-in web onboarding wizard. Inspired by [ChocoMeow/Vocard](https://github.com/ChocoMeow/Vocard).

## Features

- **Unified Single App** — Discord bot (`discord.js`), HTTP/OAuth2 + WebSocket server (`Hono` on `Bun`), React + Tailwind web dashboard, and built-in `bun:sqlite` storage all run inside one process with zero IPC WebSocket hops and no MongoDB container.
- **Guided Web Onboarding Wizard** — Start Docker right away and open `http://localhost:8000` to verify your Discord Bot Token, check Gateway Intents live, copy your OAuth2 Redirect URL, and launch the bot without editing config files or restarting containers.
- **Multi-Source Playback via Lavalink v4** — Supports **YouTube**, **YouTube Music**, **Spotify**, **Deezer**, **SoundCloud**, **Bandcamp**, **Twitch**, **Vimeo**, direct HTTP audio streams, and optional **Apple Music** out of the box.
- **Real-Time Web Dashboard** — Search across platforms, inspect and reorder the queue, play/pause/seek/volume/loop/shuffle, toggle Autoplay, apply 9 DSP audio filters (Bass Boost, Nightcore, Vaporwave, 8D, Karaoke, Low Pass, Tremolo, Vibrato), read live lyrics via LRCLIB/LavaLyrics, manage personal playlists, and edit per-server settings.
- **Slash & Prefix Commands** — Full slash command suite (`/play`, `/search`, `/queue`, `/filter`, `/playlist`, `/settings`, `/lyrics`, etc.) with interactive Now Playing buttons, plus customizable text prefix shortcuts (`?play`, `?skip`, `?np`, etc.).

## Quick Start with Docker (1 Command + Web Wizard)

1. **Start the stack** (no `.env` file needed beforehand):

   ```bash
   docker compose up -d --build
   ```

2. **Open [http://localhost:8000](http://localhost:8000)** in your browser and follow the 4-step **Cadence Setup** wizard:
   - Check SQLite + Lavalink status
   - Paste your Discord **Bot Token**, click **Verify Token** (auto-fills Client ID & checks Intents), enter **Client Secret**, and copy the shown OAuth2 Redirect URL into Discord Developer Portal
   - Pick your prefix & default search platform
   - Click **Save & Launch Cadence** — your bot goes online immediately!

Docker Compose starts:
- `cadence` — Unified TypeScript/Bun bot + web dashboard + SQLite (`./data`)
- `lavalink` — Lavalink v4 audio server with `youtube-plugin`, `LavaSrc`, and `LavaLyrics`
- `yt-cipher` — Remote cipher helper for YouTube playback
- `spotify-tokener` — Anonymous token helper for Spotify links & search

## Discord Developer Portal Checklist

1. Open [Discord Developer Portal](https://discord.com/developers/applications) and create/select your application.
2. Under **Bot**:
   - Copy the **Bot Token**
   - Enable **Server Members Intent** (required)
   - Enable **Message Content Intent** (recommended for `?play`-style prefix commands)
3. Under **OAuth2 → General**:
   - Copy **Client ID** and **Client Secret**
   - Under **Redirects**, add `${DASHBOARD_URL}/api/auth/callback` (default: `http://localhost:8000/api/auth/callback`)

## Optional Headless / Advanced `.env` Configuration

If you prefer headless configuration (or want custom Lavalink keys or a setup passcode on a public server), copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

- `SETUP_TOKEN` — Optional passcode required by the web onboarding wizard before saving credentials on public hosts.
- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` — Skip web onboarding and boot directly into Discord.
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `DEEZER_ARL`, `DEEZER_MASTER_KEY`, `APPLE_MUSIC_ENABLED`, `APPLE_MUSIC_TOKEN` — Optional Lavalink source credentials.

## Local Development (Without Building the App Container)

Requires [Bun](https://bun.sh):

```bash
bun install
```

Optionally start Lavalink + audio helpers in Docker while developing Cadence locally:

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
