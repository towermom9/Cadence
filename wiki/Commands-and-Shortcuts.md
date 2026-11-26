# Commands and Shortcuts

## Discord Slash Commands (23 Commands)

| Command | Options | Access Tier | Description |
|---------|---------|-------------|-------------|
| `/play` | `query`, `source` | Tier 1 (User) | Queue a song or playlist (supports autocomplete; plays next automatically if **Default to Play Next** is enabled) |
| `/playnext` | `query`, `source` | Tier 1 (User) | Queue a song or playlist directly after the currently playing track |
| `/playnow` | `query`, `source` | Tier 1 (User) | Insert a track at the front of the queue and start playing immediately |
| `/search` | `query`, `source` | Tier 1 (User) | Pick from top 10 interactive search results |
| `/pause` | - | Tier 1 (User) | Pause playback |
| `/resume` | - | Tier 1 (User) | Resume playback |
| `/skip` | `amount` | Tier 1 (User) | Skip current track or jump ahead |
| `/back` | - | Tier 1 (User) | Return to previous track (or restart if > 5s in) |
| `/seek` | `seconds` | Tier 1 (User) | Seek to a specific timestamp |
| `/stop` | - | Tier 2 (DJ) | Stop playback, clear queue, and leave voice channel |
| `/volume` | `percent` (`0-100`) | Tier 2 (DJ) | Adjust player volume using perceptual curve |
| `/loop` | `off \| track \| queue` | Tier 2 (DJ) | Set loop mode (`queue` wraps manual tracks and ignores Autoplay) |
| `/shuffle` | - | Tier 2 (DJ) | Shuffle manual upcoming queue |
| `/remove` | `position` | Tier 1/2 | Remove a queued track (own track or DJ for any) |
| `/clear` | - | Tier 2 (DJ) | Clear all upcoming manual tracks |
| `/autoplay` | - | Tier 2 (DJ) | Toggle Smart Autoplay recommendations |
| `/filter` | `preset` | Tier 2 (DJ) | Apply one of 9 audio presets (`none`, `bassboost`, `nightcore`, `vaporwave`, `8d`, `karaoke`, `lowpass`, `tremolo`, `vibrato`) |
| `/queue` | - | Tier 1 (User) | View current track and upcoming queue |
| `/nowplaying` | - | Tier 1 (User) | Post/refresh the interactive Discord Music Controller |
| `/lyrics` | - | Tier 1 (User) | Fetch lyrics for the currently playing song |
| `/playlist` | `list \| create \| add \| play \| delete` | Tier 1 (User) | Manage and play your personal playlists from Discord |
| `/settings` | `view \| volume \| 247 \| dj \| duplicates \| prefix \| emptyvc \| playnext` | Tier 3 (Admin) | View or edit per-server Cadence settings |
| `/dashboard`, `/help`, `/ping` | - | Public | Open dashboard URL, view command list, or check latency |

## Text Prefix Commands (Default: `?`)

You can customize the prefix per server in **Settings -> Server** or `/settings prefix`.

- `?play <query>` / `?p <query>`
- `?playnext <query>` / `?pn <query>`
- `?skip` / `?s`
- `?pause`, `?resume`
- `?stop` / `?leave`
- `?queue` / `?q`
- `?np` / `?nowplaying`

## Web Dashboard Keyboard Shortcuts

Press `?` (`Shift + /`) anywhere in the dashboard (outside inputs) to view the interactive shortcut overlay:

- `Space`: Play / Pause
- `n` or `Shift + N`: Skip to next track
- `k` or `Shift + P`: Previous / restart track
- `Left` / `Right` (`j` / `l`): Seek backward / forward
- `=` / `-`: Volume up / down (5%)
- `m`: Mute / Unmute
- `s`: Shuffle queue
- `r`: Cycle Repeat (`Off -> Queue -> Track`)
- `+`: Toggle Like (`❤️`) on current track
- `g h`, `g e`, `g l`, `g ,`: Navigate to Home, Explore, Library, or Settings
