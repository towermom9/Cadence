<div align="center">

<a href="https://github.com/towermom9/Cadence">
  <img width="160" height="160" src="./web/public/brand/icon-accent-mask.png" alt="Cadence Logo" />
</a>

<h1 align="center">Cadence</h1>

<p align="center">
  <strong>All-in-one Discord music bot &amp; real-time YouTube Music style web dashboard built with TypeScript, Bun &amp; Lavalink v4.</strong><br />
  <a href="https://towermom9.github.io/Cadence/">Website</a> &middot;
  <a href="https://towermom9.github.io/Cadence/docs/guides/getting-started/">Guides</a> &middot;
  <a href="https://towermom9.github.io/Cadence/docs/reference/commands/">Commands</a> &middot;
  <a href="https://towermom9.github.io/Cadence/docs/reference/changelog/">Changelog</a>
</p>

| Docker Packages (GHCR) | Build & Release Status |
|------------------------|------------------------|
| <div align="center"> [![Cadence Image](https://img.shields.io/badge/ghcr.io-towermom9%2Fcadence-0D1117?labelColor=27303D&logo=docker&logoColor=FFFFFF&style=flat)](https://github.com/towermom9/Cadence/pkgs/container/cadence) [![Lavalink Image](https://img.shields.io/badge/ghcr.io-towermom9%2Fcadence--lavalink-0D1117?labelColor=27303D&logo=docker&logoColor=FFFFFF&style=flat)](https://github.com/towermom9/Cadence/pkgs/container/cadence-lavalink) </div> | <div align="center"> [![Publish Docker Image](https://img.shields.io/github/actions/workflow/status/towermom9/Cadence/docker-publish.yml?label=Docker%20CI&labelColor=06599d&color=043b69&logo=githubactions&logoColor=FFFFFF)](https://github.com/towermom9/Cadence/actions/workflows/docker-publish.yml) [![Version](https://img.shields.io/github/package-json/v/towermom9/Cadence?label=Version&labelColor=27303D&color=0D1117)](./package.json) [![Last Commit](https://img.shields.io/github/last-commit/towermom9/Cadence?label=Updated&labelColor=27303D&color=0D1117)](https://github.com/towermom9/Cadence/commits/main) </div> |

*Requires Docker & Docker Compose v2+ (or Bun 1.2+ & Java 17+ for bare-metal development).*

[![Bun](https://img.shields.io/badge/Runtime-Bun%201.4-0D1117?labelColor=27303D&logo=bun&logoColor=fbf0df)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%207-0D1117?labelColor=27303D&logo=typescript&logoColor=3178C6)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Tailwind%20v4-0D1117?labelColor=27303D&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14.28-0D1117?labelColor=27303D&logo=discord&logoColor=5865F2)](https://discord.js.org/)
[![Lavalink](https://img.shields.io/badge/Audio-Lavalink%20v4-0D1117?labelColor=27303D&logo=springboot&logoColor=6DB33F)](https://lavalink.dev/)
[![License: MIT](https://img.shields.io/github/license/towermom9/Cadence?labelColor=27303D&color=0877d2)](./LICENSE)

</div>

<div align="left">

A free and open-source Discord music bot and real-time web dashboard inspired by [Vocard](https://github.com/ChocoMeow/Vocard) & [Vocard-Dashboard](https://github.com/ChocoMeow/Vocard-Dashboard). Cadence unifies the Discord bot, OAuth2 + WebSocket API server, YouTube Music inspired web app, and embedded `bun:sqlite` database into a **single process**, paired with a self-contained **Lavalink v4** audio stack.

---

## Features

### Cadence's core highlights:
- `Unified Single-Process Architecture` running the Discord bot (`discord.js`), HTTP/OAuth2 + WebSocket server (`Hono` on `Bun`), React 19 web dashboard, and `bun:sqlite` storage in one lightweight container - no MongoDB or IPC bridge required.
- `Pre-Bundled Self-Contained Lavalink Image` that automatically resolves and bundles the latest `youtube-plugin` (beta/snapshot), `LavaSrc`, and `LavaLyrics` JARs from `maven.lavalink.dev` for ~7-second cold starts and zero host config file mounts.
- `YouTube Music Inspired Web Dashboard` with real-time 60fps progress interpolation, instant logarithmic volume curve (`x^1.6`), live Up Next / Lyrics / Related tabs, right-click context menus, and mobile PWA bottom-bar navigation.
- `True Timeline Queue with Full Drag & Drop` supporting past history, the active track, and upcoming queue items - drag the currently playing song anywhere in the timeline without interrupting playback, and keep manual queue tracks strictly separated from Autoplay suggestions.
- `Smart Autoplay with 7 Moods` (`All`, `Familiar`, `Discover`, `Popular`, `Deep Cuts`, `Chill`, `Upbeat`) powered by listener history, liked tracks, and YouTube Music radio mixes, with customizable click behavior (`Play now`, `Play next`, or `Add to end`).
- `Synced ELRC & LRC Lyrics` via LavaLyrics and LRCLIB with word-tag stripping, click-any-line-to-seek, and smooth auto-scroll that automatically pauses when you scroll manually.
- `Dynamic Theme Accents & AMOLED Mode` with 10 live brand color accents (dynamically recoloring the Cadence logo, favicon, switches, and progress bar), true `#000000` AMOLED surfaces, and artwork Ambience glow.
- `4-Tier Discord Role-Based Access Control` cascading cleanly from **Tier 1 (User)** -> **Tier 2 (DJ)** -> **Tier 3 (Admin / Server Settings)** -> **Tier 4 (Server Owner & Bot Owner / System Diagnostics)** using your logged-in Discord identity.
- `Guided 4-Step Web Onboarding Wizard` that validates your Discord Bot Token and Gateway Intents live, generates your OAuth2 Redirect URI, and launches the bot without touching config files.
- `Vocard-Style Discord VC Chat Controller` that automatically posts interactive Now Playing controls (`Back`, `Pause/Resume`, `Skip`, `Leave`, `❤️`, `Queue`, `Web`) into your voice channel's text chat - even when playback is started from the web dashboard.

<details>
  <summary><strong>Web Dashboard &amp; Library Features</strong></summary>

- **Home & Discovery**:
  - **Listen Again** shelf with drag-to-reorder pinned tracks.
  - **Recommendations for Today** personalized from your recent play history, liked songs, and pinned tracks.
  - **Search Autofill & Instant Track Previews** with per-user default search provider (`YouTube Music`, `YouTube`, `Spotify`, `SoundCloud`, `Deezer`, or `Server Default`).
  - **Artist Profiles** with full catalog search, Top Songs, Albums & Singles, and clickable multi-artist collaboration links (e.g. `Lime & LilyPichu`).
- **Personal Library & Playlists**:
  - Built-in **Liked Music** auto-pinned playlist synced with the `❤️` button across the web player, queue hover actions, and Discord controller.
  - **Online Playlist Import & One-Click Sync** for YouTube, YouTube Music, Spotify, SoundCloud, and Deezer playlist URLs.
  - **Drag-and-Drop Track Reordering** inside playlists and **6 Library Sort Modes** (`Recent activity`, `Recently saved`, `Recently played`, `Recent sync`, `Manual drag order`, `A-Z`) shared between the sidebar and Library view.
- **Power-User Controls**:
  - Click artwork to Play/Pause with optional ±5s-30s floating seek buttons.
  - Auto-pause when voice channel becomes empty with a configurable `0s-5m` continuation delay slider, auto-resume on listener join, optional extended auto-disconnect (`Off` / `5m-2h`), and deafened listener filtering.
  - Paginated play history with grouped playlist entries and automatic queue-loop deduplication.
  - Direct numeric volume percentage input (`0%-100%`) alongside the smooth slider.
  - Keyboard shortcuts modal (`?` or `Shift + /`) with Vim-style navigation (`g h`, `g e`, `g l`, `g ,`) and media keys.
  - Persistent UI preferences saved across both SQLite and browser cookies.

</details>

<details>
  <summary><strong>Discord Slash &amp; Prefix Commands (35 Commands)</strong></summary>

- **Playback & Search**:
  - `/play <query> [source]` - Queue a song or playlist with live autocomplete from recent history & YouTube suggestions.
  - `/playnext <query> [source]` - Queue a track or playlist right after the current song (or set as default via `/settings playnext`).
  - `/playnow <query> [source]` - Insert track at the front of the queue and play immediately.
  - `/search <query> [source]` - Search and pick from an interactive dropdown menu.
  - `/connect`, `/pause`, `/resume`, `/skip [amount]`, `/skipto <position>`, `/back`, `/replay`, `/seek <seconds>`, `/forward [seconds]`, `/rewind [seconds]`, `/stop`
- **Audio, Queue & History**:
  - `/volume <0-100>`, `/loop <off|track|queue>`, `/autoplay`, `/filter <preset>` (9 DSP presets: `bassboost`, `nightcore`, `vaporwave`, `8d`, `karaoke`, `lowpass`, `tremolo`, `vibrato`, `none`), `/speed <0.5-2.0>`, `/pitch <0.5-2.0>`, `/cleareffect`
  - `/queue`, `/history`, `/nowplaying`, `/grab`, `/shuffle`, `/move <from> <to>`, `/swap <first> <second>`, `/remove <position>`, `/clear`, `/lyrics`
- **Playlists, Settings & Utility**:
  - `/playlist <list|view|create|add|savequeue|remove|rename|play|delete>` - Manage and play your personal playlists from Discord.
  - `/settings <view|volume|247|autoplay|dj|duplicates|prefix|emptyvc|playnext|reset>` - Configure server settings (Tier 3 Admin / Owner).
  - `/dashboard`, `/ping`, `/help`
  - Plus customizable prefix commands (`?play`, `?playnext`, `?connect`, `?skip`, `?skipto`, `?back`, `?replay`, `?forward`, `?rewind`, `?pause`, `?resume`, `?stop`, `?volume`, `?loop`, `?shuffle`, `?move`, `?swap`, `?clear`, `?autoplay`, `?cleareffect`, `?queue`, `?history`, `?grab`, `?np`).

</details>

<details>
  <summary><strong>4-Tier Role-Based Access &amp; System Diagnostics</strong></summary>

| Tier | Who Qualifies | Permissions |
|------|---------------|-------------|
| **Tier 1 · User** | Everyone in the server by default, or members with configured **Basic Access Roles** | Search, play/enqueue tracks, view queue/lyrics/related, manage personal playlists/likes/pins, remove own queued tracks |
| **Tier 2 · DJ** | Members with the configured **DJ Role** (or alone in voice channel) | All Tier 1 permissions + skip, back, seek, volume, loop, shuffle, autoplay, filters, drag/reorder/clear/dismiss queue, remove any track, disconnect |
| **Tier 3 · Admin** | Members with configured **Admin Roles** or Discord `Manage Server` / `Administrator` | All Tier 2 permissions + **Server Settings** tab & `/settings` command |
| **Tier 4 · Owner** | Discord **Server Owner** or **Bot Owner** | All Tier 3 permissions + **System Settings** tab (live domain/Redirect URI configuration, runtime & Lavalink plugin versions, one-click redacted debug log export) |

</details>

---

## Quick Start & Deployment

### Option 1: Deploy Pre-Built GHCR Images (Recommended for VPS / Portainer / Dokploy / Coolify)
No repo clone or extra config files are required on the host [lavalink/application.yml](./lavalink/application.yml) and all Lavalink plugins are pre-bundled inside `ghcr.io/towermom9/cadence-lavalink:latest`.

Create a `docker-compose.yml` and run `docker compose up -d`:

```yaml
name: cadence

services:
  cadence:
    container_name: cadence
    image: ghcr.io/towermom9/cadence:latest
    restart: unless-stopped
    env_file:
      - path: .env
        required: false
    environment:
      - LAVALINK_HOST=lavalink
      - LAVALINK_PORT=2333
      - LAVALINK_PASSWORD=${LAVALINK_PASSWORD:-youshallnotpass}
      - DATA_DIR=/app/data
    ports:
      - "8686:8000"
    volumes:
      - /DATA/AppData/cadence/data:/app/data
    networks:
      - cadence
    depends_on:
      lavalink:
        condition: service_started

  lavalink:
    container_name: cadence-lavalink
    image: ghcr.io/towermom9/cadence-lavalink:latest
    restart: unless-stopped
    environment:
      - _JAVA_OPTIONS=-Xmx1G
      - SERVER_PORT=2333
      - LAVALINK_SERVER_PASSWORD=${LAVALINK_PASSWORD:-youshallnotpass}
      - SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID:-}
      - SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET:-}
      - DEEZER_ENABLED=${DEEZER_ENABLED:-false}
      - DEEZER_ARL=${DEEZER_ARL:-}
      - DEEZER_MASTER_KEY=${DEEZER_MASTER_KEY:-}
      - APPLE_MUSIC_ENABLED=${APPLE_MUSIC_ENABLED:-false}
      - APPLE_MUSIC_TOKEN=${APPLE_MUSIC_TOKEN:-}
      - YT_OAUTH_ENABLED=${YT_OAUTH_ENABLED:-false}
      - YT_OAUTH_REFRESH_TOKEN=${YT_OAUTH_REFRESH_TOKEN:-}
      - YT_CIPHER_URL=http://yt-cipher:8001
      - SPOTIFY_TOKEN_ENDPOINT=http://spotify-tokener:49152/api/token
    expose:
      - "2333"
    networks:
      - cadence
    depends_on:
      - yt-cipher
      - spotify-tokener

  yt-cipher:
    container_name: cadence-yt-cipher
    image: ghcr.io/kikkia/yt-cipher:master
    restart: unless-stopped
    expose:
      - "8001"
    networks:
      - cadence

  spotify-tokener:
    container_name: cadence-spotify-tokener
    image: ghcr.io/topi314/spotify-tokener:master
    restart: unless-stopped
    environment:
      - SPOTIFY_TOKENER_ADDR=0.0.0.0:49152
    expose:
      - "49152"
    networks:
      - cadence

networks:
  cadence:
    name: cadence
```

### Option 2: Clone & Build from Source
```bash
git clone https://github.com/towermom9/Cadence.git
cd Cadence
docker compose up -d --build
```

Then open **[http://localhost:8686](http://localhost:8686)** (or your configured `DASHBOARD_URL`) to complete the 4-step **Web Onboarding Wizard**.

<details>
  <summary><strong>Discord Developer Portal Setup Checklist</strong></summary>

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create or select your application.
2. Under **Bot**:
   - Click **Reset Token** / copy your **Bot Token**.
   - Enable **Server Members Intent** *(required)*.
   - Enable **Message Content Intent** *(recommended for `?play` prefix commands)*.
3. Under **OAuth2 → General**:
   - Copy your **Client ID** and **Client Secret**.
   - Under **Redirects**, add `<YOUR_DASHBOARD_URL>/api/auth/callback` (e.g. `http://localhost:8000/api/auth/callback` or `https://cadence.example.com/api/auth/callback`).

</details>

<details>
  <summary><strong>Optional Headless / Advanced <code>.env</code> Variables</strong></summary>

Copy [.env.example](./.env.example) to `.env` if you want to pre-configure credentials without using the web wizard:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | *(empty)* | HTTP & WebSocket server port |
| `DASHBOARD_URL` | *(empty)* | Public URL used for Discord OAuth2 callbacks & embeds |
| `SETUP_TOKEN` | *(empty)* | Optional passcode required by the onboarding wizard on public hosts |
| `DISCORD_TOKEN` | *(empty)* | Discord Bot Token |
| `DISCORD_CLIENT_ID` | *(empty)* | Discord OAuth2 Application Client ID |
| `DISCORD_CLIENT_SECRET` | *(empty)* | Discord OAuth2 Application Client Secret |
| `OWNER_USER_ID` | *(empty)* | Optional Discord User ID override for Bot Owner tier |
| `YT_OAUTH_ENABLED` | `false` | Enable YouTube OAuth2 refresh token in Lavalink |
| `YT_OAUTH_REFRESH_TOKEN` | *(empty)* | YouTube OAuth2 refresh token |
| `SPOTIFY_CLIENT_ID` / `SECRET` | *(empty)* | Optional Spotify API credentials (uses `spotify-tokener` by default) |

</details>

<details>
  <summary><strong>Local Bare-Metal Development (Bun + Vite)</strong></summary>

```bash
# 1. Install dependencies
bun install

# 2. Start Lavalink & audio helpers in Docker
docker compose up -d lavalink yt-cipher spotify-tokener

# 3. Start backend + Discord bot (port 8000) and Vite dev server (port 5173)
bun run dev
bun run dev:web

# 4. Typecheck & build production frontend
bun run typecheck
bun run build:web
```

</details>

---

## Issues, Feature Requests and Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

<details>
  <summary><strong>Bugs &amp; Troubleshooting</strong></summary>

- Include the **Cadence version** shown in the page footer (or **Settings → System**).
- If you are a Server Owner or Bot Owner, open **Settings → System** and click **Copy Debug Report** or **Download .txt** (all tokens, secrets, webhooks, and external IPs are redacted automatically).
- Include steps to reproduce and screenshots if applicable.
- Open a bug report at [GitHub Issues](https://github.com/towermom9/Cadence/issues).

</details>

<details>
  <summary><strong>Feature Requests</strong></summary>

- Open an issue describing the feature, expected workflow, and any UI mockups or references.

</details>

<details>
  <summary><strong>Contributing</strong></summary>

1. Fork the repository and create your feature branch (`git checkout -b feat/amazing-feature`).
2. Run `bun run typecheck` and `bun run build:web` to verify zero TypeScript or build errors.
3. Commit your changes and open a Pull Request.

</details>

---

<div align="center">

### Credits & Inspiration

Inspired by [Vocard](https://github.com/ChocoMeow/Vocard) & [Vocard-Dashboard](https://github.com/ChocoMeow/Vocard-Dashboard) by [ChocoMeow](https://github.com/ChocoMeow), re-architected from the ground up with TypeScript, Bun, React 19, and Lavalink v4.

<a href="https://github.com/towermom9/Cadence/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=towermom9/Cadence" alt="Cadence contributors" title="Cadence contributors" />
</a>

### Disclaimer

The developer(s) of this application have no affiliation with Discord, YouTube, Spotify, SoundCloud, or Deezer. Cadence hosts zero copyrighted audio content and streams solely through user-configured Lavalink sources.

</div>

## License

```text
MIT License - Copyright (c) 2026 Charlie (towermom9)
See LICENSE for full details.
```

</div>
