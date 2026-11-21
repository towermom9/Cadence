import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  OAUTH_STATE_COOKIE_NAME,
  clearGuildCacheForUser,
  clearSessionCookie,
  fetchDiscordUser,
  fetchDiscordUserGuilds,
  getSessionFromContext,
  setSessionCookie,
} from "./auth";
import type { CadenceBot } from "./bot";
import { config } from "./config";
import type { CadenceDatabase } from "./db";
import { registerSetupRoutes } from "./setup";
import type { CadenceWsHub } from "./ws";

const DISCORD_OAUTH_AUTHORIZE = "https://discord.com/oauth2/authorize";
const DISCORD_OAUTH_TOKEN = "https://discord.com/api/v10/oauth2/token";

export function createWebApp(
  bot: CadenceBot,
  db: CadenceDatabase,
  wsHub: CadenceWsHub
): Hono {
  const app = new Hono();
  const startedAt = Date.now();
  const webDistDir = resolve(process.cwd(), "web/dist");
  const indexHtmlPath = join(webDistDir, "index.html");

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      needsSetup: config.needsSetup,
      botReady: bot.isReady(),
      lavalinkConnected: bot.music.isLavalinkConnected(),
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
  });

  app.get("/api/meta", async (c) => {
    const probe = bot.music.isLavalinkConnected() ? undefined : await bot.probeLavalink();
    return c.json(bot.getBotMeta(probe));
  });

  registerSetupRoutes(app, bot, db);

  app.get("/api/auth/login", (c) => {
    if (!config.hasOAuthConfig) {
      return c.text(
        "Discord OAuth2 is not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET in .env.",
        503
      );
    }

    const state = randomBytes(16).toString("hex");
    setCookie(c, OAUTH_STATE_COOKIE_NAME, state, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
      secure: config.isSecureCookie,
    });

    const params = new URLSearchParams({
      client_id: config.discordClientId,
      response_type: "code",
      redirect_uri: config.discordRedirectUri,
      scope: "identify guilds",
      state,
    });

    return c.redirect(`${DISCORD_OAUTH_AUTHORIZE}?${params.toString()}`);
  });

  app.get("/api/auth/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const expectedState = getCookie(c, OAUTH_STATE_COOKIE_NAME);
    deleteCookie(c, OAUTH_STATE_COOKIE_NAME, { path: "/" });

    if (!code || !state || !expectedState || state !== expectedState) {
      return c.redirect("/?error=oauth_state");
    }

    if (!config.hasOAuthConfig) {
      return c.redirect("/?error=oauth_unconfigured");
    }

    try {
      const body = new URLSearchParams({
        client_id: config.discordClientId,
        client_secret: config.discordClientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: config.discordRedirectUri,
      });

      const tokenRes = await fetch(DISCORD_OAUTH_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!tokenRes.ok) {
        return c.redirect("/?error=oauth_token");
      }

      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenJson.access_token) {
        return c.redirect("/?error=oauth_token");
      }

      const user = await fetchDiscordUser(tokenJson.access_token);
      clearGuildCacheForUser(user.id);
      const session = db.createSession(user, tokenJson.access_token);
      setSessionCookie(c, session.id);

      return c.redirect("/");
    } catch (error) {
      console.error("[Auth] OAuth callback failed:", error);
      return c.redirect("/?error=oauth_failed");
    }
  });

  app.post("/api/auth/logout", (c) => {
    const session = getSessionFromContext(c, db);
    if (session) {
      db.deleteSession(session.id);
      clearGuildCacheForUser(session.user.id);
    }
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.get("/api/me", async (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ authenticated: false, meta: bot.getBotMeta() }, 401);
    }

    const oauthGuilds = await fetchDiscordUserGuilds(session.user.id, session.accessToken);
    const guilds = bot.getUserGuildContext(session.user.id, oauthGuilds);

    return c.json({
      authenticated: true,
      user: session.user,
      meta: bot.getBotMeta(),
      guilds,
    });
  });

  app.get("/ws", wsHub.handleUpgrade());

  // Serve built frontend static assets
  if (existsSync(webDistDir)) {
    app.use("/*", serveStatic({ root: "./web/dist" }));
  }

  // SPA fallback for client routes
  app.get("*", async (c) => {
    if (c.req.path.startsWith("/api/") || c.req.path === "/ws") {
      return c.json({ error: "Not found" }, 404);
    }
    if (existsSync(indexHtmlPath)) {
      const html = await Bun.file(indexHtmlPath).text();
      return c.html(html);
    }
    return c.text(
      "Cadence frontend has not been built yet. Run `bun run build:web` or `bun run dev:web`.",
      200
    );
  });

  return app;
}
