import { timingSafeEqual } from "node:crypto";
import type { Context, Hono } from "hono";
import type {
  SearchSource,
  SetupCompletePayload,
  SetupStatusDTO,
  TokenTestResultDTO,
} from "@shared/types";
import type { CadenceBot } from "./bot";
import { VALID_SEARCH_SOURCES, applyStoredConfig, config, isConfiguredValue } from "./config";
import type { CadenceDatabase } from "./db";

const DISCORD_API_BASE = "https://discord.com/api/v10";

interface DiscordBotUserResponse {
  id: string;
  username: string;
  avatar: string | null;
  bot?: boolean;
}

interface DiscordAppInfoResponse {
  id: string;
  name: string;
  flags?: number;
  owner?: { id?: string };
  team?: { owner_user_id?: string };
}

function safeTokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function verifyDiscordBotToken(rawToken: string): Promise<TokenTestResultDTO> {
  const token = rawToken.trim();
  if (!isConfiguredValue(token)) {
    throw new Error("Please enter a valid Discord Bot Token.");
  }

  const userRes = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bot ${token}` },
    signal: AbortSignal.timeout(8000),
  });

  if (userRes.status === 401) {
    throw new Error(
      "Discord rejected this Bot Token (401 Unauthorized). Make sure you copied the Bot Token, not the OAuth2 Client Secret."
    );
  }
  if (!userRes.ok) {
    throw new Error(`Discord API returned HTTP ${userRes.status} while checking the bot token.`);
  }

  const botUser = (await userRes.json()) as DiscordBotUserResponse;
  if (!botUser.id) {
    throw new Error("Discord returned an unexpected user payload.");
  }

  let appInfo: DiscordAppInfoResponse | null = null;
  try {
    const appRes = await fetch(`${DISCORD_API_BASE}/oauth2/applications/@me`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (appRes.ok) {
      appInfo = (await appRes.json()) as DiscordAppInfoResponse;
    }
  } catch {
    // Fallback cleanly to botUser details below
  }

  const flags = typeof appInfo?.flags === "number" ? appInfo.flags : 0;
  // Discord ApplicationFlags bits:
  // 14 = GATEWAY_GUILD_MEMBERS, 15 = GATEWAY_GUILD_MEMBERS_LIMITED
  // 18 = GATEWAY_MESSAGE_CONTENT, 19 = GATEWAY_MESSAGE_CONTENT_LIMITED
  const membersIntentEnabled = Boolean((flags & (1 << 14)) || (flags & (1 << 15)));
  const messageContentIntentEnabled = Boolean((flags & (1 << 18)) || (flags & (1 << 19)));

  return {
    valid: true,
    botId: botUser.id,
    botUsername: botUser.username,
    botAvatarUrl: botUser.avatar
      ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.webp?size=128`
      : null,
    clientId: appInfo?.id || botUser.id,
    appName: appInfo?.name || botUser.username,
    ownerUserId: appInfo?.owner?.id || appInfo?.team?.owner_user_id || null,
    membersIntentEnabled,
    messageContentIntentEnabled,
  };
}

function verifySetupGuard(c: Context, bodySetupToken?: string): Response | null {
  if (!config.needsSetup) {
    return c.json({ error: "Cadence is already configured." }, 403);
  }
  if (config.setupToken) {
    const supplied = (c.req.header("x-setup-token") || bodySetupToken || "").trim();
    if (!supplied || !safeTokenEquals(supplied, config.setupToken)) {
      return c.json({ error: "Invalid setup passcode." }, 403);
    }
  }
  return null;
}

export function registerSetupRoutes(
  app: Hono,
  bot: CadenceBot,
  db: CadenceDatabase
): void {
  app.get("/api/setup/status", async (c) => {
    if (!config.needsSetup) {
      const payload: SetupStatusDTO = {
        needsSetup: false,
        setupTokenRequired: Boolean(config.setupToken),
        lavalinkReachable: bot.music.isLavalinkConnected(),
        lavalinkVersion: null,
        lavalinkHost: config.lavalink.host,
        lavalinkPort: config.lavalink.port,
        defaults: {
          dashboardUrl: config.dashboardUrl,
          botPrefix: config.botPrefix,
          defaultSearchSource: config.defaultSearchSource,
        },
      };
      return c.json(payload);
    }

    const probe = await bot.probeLavalink();
    const payload: SetupStatusDTO = {
      needsSetup: true,
      setupTokenRequired: Boolean(config.setupToken),
      lavalinkReachable: probe.reachable,
      lavalinkVersion: probe.version,
      lavalinkHost: config.lavalink.host,
      lavalinkPort: config.lavalink.port,
      defaults: {
        dashboardUrl: config.dashboardUrl,
        botPrefix: config.botPrefix,
        defaultSearchSource: config.defaultSearchSource,
      },
    };
    return c.json(payload);
  });

  app.post("/api/setup/test-token", async (c) => {
    let body: { discordToken?: string; setupToken?: string };
    try {
      body = (await c.req.json()) as { discordToken?: string; setupToken?: string };
    } catch {
      return c.json({ error: "Invalid JSON request body." }, 400);
    }

    const blocked = verifySetupGuard(c, body.setupToken);
    if (blocked) return blocked;

    try {
      const result = await verifyDiscordBotToken(body.discordToken || "");
      return c.json(result);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to verify bot token." },
        400
      );
    }
  });

  app.post("/api/setup/complete", async (c) => {
    let payload: Partial<SetupCompletePayload>;
    try {
      payload = (await c.req.json()) as Partial<SetupCompletePayload>;
    } catch {
      return c.json({ error: "Invalid JSON request body." }, 400);
    }

    const blocked = verifySetupGuard(c, payload.setupToken);
    if (blocked) return blocked;

    const discordToken = payload.discordToken?.trim() || "";
    const discordClientId = payload.discordClientId?.trim() || "";
    const discordClientSecret = payload.discordClientSecret?.trim() || "";
    const dashboardUrl = (payload.dashboardUrl?.trim() || config.dashboardUrl).replace(/\/+$/, "");
    const botPrefix = (payload.botPrefix?.trim() || "?").slice(0, 5);
    const defaultSearchSource: SearchSource =
      payload.defaultSearchSource && VALID_SEARCH_SOURCES.has(payload.defaultSearchSource)
        ? payload.defaultSearchSource
        : "ytmsearch";

    if (!isConfiguredValue(discordToken)) {
      return c.json({ error: "Discord Bot Token is required." }, 400);
    }
    if (!isConfiguredValue(discordClientId) || !/^\d{15,22}$/.test(discordClientId)) {
      return c.json({ error: "Please enter a valid numeric Discord Client ID." }, 400);
    }
    if (!isConfiguredValue(discordClientSecret)) {
      return c.json({ error: "Discord OAuth2 Client Secret is required." }, 400);
    }
    if (!/^https?:\/\/\S+$/i.test(dashboardUrl)) {
      return c.json({ error: "Dashboard URL must start with http:// or https://." }, 400);
    }

    let tokenCheck;
    try {
      tokenCheck = await verifyDiscordBotToken(discordToken);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to verify bot token." },
        400
      );
    }

    if (tokenCheck.clientId !== discordClientId) {
      return c.json(
        {
          error: `Client ID (${discordClientId}) does not match the Bot Token's application ID (${tokenCheck.clientId}).`,
        },
        400
      );
    }

    const candidateConfig = {
      discordToken,
      discordClientId,
      discordClientSecret,
      dashboardUrl,
      botPrefix,
      defaultSearchSource,
      ownerUserId: tokenCheck.ownerUserId,
      setupCompleted: true,
      updatedAt: Date.now(),
    };

    const previousStored = db.getAppConfig();
    applyStoredConfig(candidateConfig);

    try {
      await bot.startAndWaitReady(15_000);
    } catch (error) {
      applyStoredConfig(previousStored);
      return c.json(
        { error: error instanceof Error ? error.message : "Failed to start Discord bot." },
        400
      );
    }

    const saved = db.saveAppConfig({
      discordToken,
      discordClientId,
      discordClientSecret,
      dashboardUrl,
      botPrefix,
      defaultSearchSource,
      ownerUserId: tokenCheck.ownerUserId,
      setupCompleted: true,
    });
    applyStoredConfig(saved);

    const probe = await bot.probeLavalink();
    return c.json({
      ok: true,
      meta: bot.getBotMeta(probe),
    });
  });
}
