# Installation and Deployment

Cadence runs as two primary services alongside lightweight audio helpers:

- **`cadence`** - Unified single-process container serving the Discord bot, Hono HTTP/OAuth2 + WebSocket backend, React 19 dashboard, and `bun:sqlite` database.
- **`lavalink`** - Self-contained Lavalink v4 container (`ghcr.io/towermom9/cadence-lavalink:latest`) with pre-bundled `youtube-plugin`, `lavasrc-plugin`, and `lavalyrics-plugin`.
- **`yt-cipher`** - YouTube signature cipher helper for Lavalink.
- **`spotify-tokener`** - Anonymous Spotify metadata token helper for `LavaSrc`.

---

## Option 1: Docker Compose (Recommended)

No repository clone or manual `application.yml` mount is required when using the pre-built GHCR images:

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
      - ./data:/app/data
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

Start the stack:

```bash
docker compose up -d
```

Then open your dashboard URL (for example `http://localhost:8686`) to complete the onboarding wizard.

---

## Option 2: Local Development with Bun

Requirements: **Bun v1.2+** and **Docker Compose v2+** (for Lavalink & audio helpers).

```bash
git clone https://github.com/towermom9/Cadence.git
cd Cadence
bun install
docker compose up -d lavalink yt-cipher spotify-tokener

# Terminal 1: Backend & Discord bot (:8000)
bun run dev

# Terminal 2: Vite HMR frontend (:5173)
bun run dev:web
```

---

## Reverse Proxy Notes

- Forward both standard HTTP requests (`/api/*`, `/`) and **WebSocket upgrades** (`/ws`) to port `8000` (or the mapped host port).
- If hosting behind HTTPS (`https://music.example.com`), set `DASHBOARD_URL=https://music.example.com` (either in `.env` or during the Web Onboarding Wizard) so OAuth2 redirect URLs, secure session cookies, and Discord controller links match automatically.
