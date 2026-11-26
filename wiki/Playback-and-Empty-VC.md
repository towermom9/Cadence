# Playback, Queue Timeline & Empty VC Automation

## Timeline Queue

Cadence models your active playback session as a single continuous timeline with four distinct segments:

1. **Previous (`previous`)** - Unlimited played history shown above the active track.
2. **Current (`current`)** - The active song currently playing.
3. **Manual Queue (`manual`)** - Tracks queued explicitly by users (`/play`, `/playnext`, `/playnow`, playlists, search).
4. **Autoplay (`autoplay`)** - Recommended songs automatically added when **Autoplay** is enabled.

### Drag-and-Drop Rules
- Dragging the **currently playing** song updates surrounding queue/history positions cleanly **without interrupting or restarting** audio playback.
- Manual/current/past songs and Autoplay suggestions cannot cross the Autoplay boundary, keeping curated queues clean.

### Queue Loop (`repeatMode = "queue"`)
- Queue Loop cycles across your **manual queue and played history** while completely ignoring Autoplay recommendations.
- Wrapped playback automatically skips duplicate play-history recording so looping a playlist will not flood your **Library -> History** tab.

---

## Empty Voice Channel Auto-Pause, Auto-Resume & Auto-Disconnect

Configure these per-server options in **Settings -> Server** (or `/settings emptyvc`):

- **Pause When Voice Channel is Empty**: Pauses playback when no active listeners remain in the bot's voice channel.
- **Continue Playing When Voice Channel is Empty (`0s - 5m`)**: Lets the current song keep playing briefly (or pause immediately at `0s`) before pausing and posting an announcement embed in Discord.
- **Auto-Disconnect After Extended Auto-Pause (`Never`, `5m - 2h`)**: Leaves the voice channel if nobody rejoins after extended auto-pause (automatically disabled when **24/7 Mode** is active).
- **Ignore Deafened Listeners**: Treats self-deafened and server-deafened members as not listening when checking if voice chat is empty.

When someone joins back into the voice channel (and un-deafens if **Ignore Deafened Listeners** is on), Cadence cancels any countdown/disconnect timers and **automatically resumes** playback if it was auto-paused due to an empty VC. Manual pauses made while listeners were present are never overridden.
