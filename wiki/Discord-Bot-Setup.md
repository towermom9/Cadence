# Discord Bot Setup

Follow these steps to create a Discord application and connect it to Cadence.

## 1. Create a Discord Application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**.
2. Go to **Bot** in the left sidebar:
   - Click **Reset Token** and copy your **Bot Token** (keep this private).
   - Enable **Server Members Intent** (required for role lookups and tier checks).
   - Enable **Message Content Intent** (required for text prefix commands such as `?play` and `?playnext`).

## 2. Configure OAuth2 Redirects

1. Go to **OAuth2 -> General**.
2. Copy your **Client ID** and **Client Secret**.
3. Under **Redirects**, add your exact callback URL:
   - Local development: `http://localhost:8000/api/auth/callback` (or `http://localhost:5173/api/auth/callback` when using Vite dev server)
   - Docker / custom domain: `https://your-domain.example/api/auth/callback`

## 3. Complete the Web Onboarding Wizard

When starting Cadence for the first time without `.env` credentials:

1. Open your Cadence dashboard URL.
2. Step through the **4-Step Web Onboarding Wizard**:
   - **Step 1**: Verify Lavalink connectivity and enter optional `SETUP_TOKEN` (if set on public hosts).
   - **Step 2**: Paste and test your **Discord Bot Token** (verifies token and privileged Gateway intents live).
   - **Step 3**: Enter your **Client ID**, **Client Secret**, and **Dashboard URL**.
   - **Step 4**: Choose default prefix (`?`) and default search provider (`ytmsearch`), then launch Cadence.
3. Click the generated invite URL to invite the bot to your Discord server with voice, embed, and slash command permissions.

## 4. Refresh Discord Slash Commands

Global slash commands (`23` total) are synced automatically on bot ready. If a newly added command does not appear right away in Discord, press `Ctrl + R` (`Cmd + R` on macOS) in your Discord desktop client after restarting the bot container.
