# Troubleshooting

## `/playnext` or New Slash Commands Not Showing in Discord

1. **Restart the Cadence bot process/container** after updating so `registerSlashCommands()` pushes the latest global command list (`23` commands) to Discord.
2. **Refresh your Discord client** with `Ctrl + R` (`Cmd + R` on macOS) to clear Discord's local slash command cache.
3. Wait up to a few minutes if Discord global command propagation is delayed across shards. In the meantime, prefix commands (`?playnext` / `?pn`) work immediately without client caching.

---

## Lavalink YouTube Search Returns Empty or Fails

- Ensure your Lavalink container is running `ghcr.io/towermom9/cadence-lavalink:latest` (which keeps `WEB` and `ANDROID_VR` ahead of `IOS` in `lavalink/application.yml` and pairs with `yt-cipher`).
- Check **Settings -> System** (Tier 4 Owner) to confirm **Lavalink Connected** is green and `youtube-plugin`, `lavasrc-plugin`, and `lavalyrics-plugin` are loaded.

---

## Discord OAuth2 Login Fails (`oauth_state` or `redirect_uri` Mismatch)

- Make sure the Redirect URL registered in **Discord Developer Portal -> OAuth2 -> General -> Redirects** matches `<YOUR_DASHBOARD_URL>/api/auth/callback` **character-for-character** (same protocol `http` vs `https`, host, and port).
- Clear browser cookies if you switched from HTTP (`localhost`) to HTTPS behind a reverse proxy.

---

## Backing Up Cadence Data

All configuration, OAuth sessions, user playlists, liked tracks, pinned tracks, play history, and server settings are stored inside a single SQLite database at `DATA_DIR/cadence.sqlite` (typically `./data/cadence.sqlite` or `/app/data/cadence.sqlite`). Back up the entire `data/` directory before major upgrades.
