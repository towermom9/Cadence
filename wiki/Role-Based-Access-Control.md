# Role-Based Access Control (RBAC)

Cadence uses a **4-tier cascading permission model** derived directly from your authenticated Discord session and server roles. Permissions flow upward automatically: higher tiers inherit every capability of lower tiers.

## Permission Matrix

| Tier | Who Qualifies | Capabilities |
|------|---------------|--------------|
| **Tier 1 · User** | Everyone in the server when **Basic Access Roles** is empty, OR members with at least one selected role | Search, `/play`, `/playnext`, `/playnow`, view queue/lyrics/related, manage personal playlists/likes/pins/history, remove own queued tracks |
| **Tier 2 · DJ** | Members with the configured **DJ Role**, OR anyone currently alone in the voice channel with the bot | All Tier 1 capabilities + skip, back, seek, volume, loop, shuffle, autoplay toggle & mood, DSP audio filters, drag-reorder queue, clear/dismiss queue, stop/disconnect |
| **Tier 3 · Admin** | Members with configured **Admin Roles** OR Discord `Manage Server` / `Administrator` permission | All Tier 2 capabilities + **Settings -> Server** tab (auto-saves live) and `/settings` Discord command |
| **Tier 4 · Owner** | Discord **Server Owner** or **Bot Owner** (`OWNER_USER_ID` or Discord Developer Team member) | All Tier 3 capabilities + **Settings -> System** diagnostics, runtime & Lavalink plugin inspection, and redacted debug log downloads |

## Tips

- To open **DJ** permissions to everyone when a single listener is jamming solo, leave the DJ role configured for groups while still allowing solo listeners automatic DJ control when alone in VC.
- To lock down the bot so only specific Discord roles can even queue songs, select one or more roles under **Tier 1 · User (Basic Access)** in **Settings -> Server**.
