import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import pkg from "../package.json";
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
import type {
  DailyRecommendationsDTO,
  SearchSuggestResponseDTO,
  SearchSource,
  SystemInfoDTO,
  TrackDTO,
  UserPreferencesDTO,
} from "@shared/types";
import { cleanArtistTag } from "@shared/artists";
import { config, VALID_SEARCH_SOURCES } from "./config";
import type { CadenceDatabase } from "./db";
import { formatLogsText, getLogCount, getRecentLogs } from "./logger";
import { registerSetupRoutes } from "./setup";
import type { CadenceWsHub } from "./ws";

const DISCORD_OAUTH_AUTHORIZE = "https://discord.com/oauth2/authorize";
const DISCORD_OAUTH_TOKEN = "https://discord.com/api/v10/oauth2/token";
const PREFS_COOKIE_NAME = "cadence_prefs";
const PREFS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const DAILY_REC_TTL_MS = 20 * 60 * 1000;

function writePrefsCookie(c: import("hono").Context, prefs: UserPreferencesDTO): void {
  setCookie(c, PREFS_COOKIE_NAME, JSON.stringify(prefs), {
    httpOnly: false,
    sameSite: "Lax",
    path: "/",
    maxAge: PREFS_COOKIE_MAX_AGE,
    secure: config.isSecureCookie,
  });
}

function readPrefsCookie(c: import("hono").Context): Partial<UserPreferencesDTO> | null {
  try {
    const raw = getCookie(c, PREFS_COOKIE_NAME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Partial<UserPreferencesDTO>;
  } catch {
    return null;
  }
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function normTitleKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALLOWED_ARTWORK_HOSTS = new Set([
  "yt3.googleusercontent.com",
  "yt3.ggpht.com",
  "lh3.googleusercontent.com",
  "lh3.ggpht.com",
  "lh4.googleusercontent.com",
  "lh5.googleusercontent.com",
  "lh6.googleusercontent.com",
  "i.ytimg.com",
  "i9.ytimg.com",
  "img.youtube.com",
  "i.scdn.co",
  "mosaic.scdn.co",
  "image-cdn-ak.spotifycdn.com",
  "image-cdn-fa.spotifycdn.com",
  "i1.sndcdn.com",
  "cdn.discordapp.com",
  "e-cdns-images.dzcdn.net",
  "cdns-images.dzcdn.net",
  "is1-ssl.mzstatic.com",
  "f4.bcbits.com",
]);

const ALLOWED_ARTWORK_HOST_SUFFIXES = [
  ".googleusercontent.com",
  ".ggpht.com",
  ".ytimg.com",
  ".scdn.co",
  ".spotifycdn.com",
  ".sndcdn.com",
  ".discordapp.com",
  ".dzcdn.net",
  ".mzstatic.com",
  ".bcbits.com",
];

function parseAllowedArtworkUrl(raw: string, base?: URL): URL | null {
  try {
    const parsed = base ? new URL(raw, base) : new URL(raw);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (
      ALLOWED_ARTWORK_HOSTS.has(host) ||
      ALLOWED_ARTWORK_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function createWebApp(
  bot: CadenceBot,
  db: CadenceDatabase,
  wsHub: CadenceWsHub
): Hono {
  const app = new Hono();
  const startedAt = Date.now();
  const webDistDir = resolve(process.cwd(), "web/dist");
  const indexHtmlPath = join(webDistDir, "index.html");
  const dailyRecCache = new Map<string, { at: number; data: DailyRecommendationsDTO }>();

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      version: pkg.version || "1.0.0",
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
    const probe = bot.music.isLavalinkConnected() ? undefined : await bot.probeLavalink();
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ authenticated: false, meta: bot.getBotMeta(probe) }, 401);
    }

    if (!db.hasStoredUserPreferences(session.user.id)) {
      const cookiePrefs = readPrefsCookie(c);
      if (cookiePrefs) {
        db.updateUserPreferences(session.user.id, cookiePrefs);
      }
    }
    const preferences = db.getUserPreferences(session.user.id);
    writePrefsCookie(c, preferences);

    const oauthGuilds = await fetchDiscordUserGuilds(session.user.id, session.accessToken);
    const guilds = bot.getUserGuildContext(session.user.id, oauthGuilds);
    const isBotOwner = bot.isBotOwner(session.user.id);
    const canAccessSystem =
      isBotOwner || bot.isAnyGuildOwner(session.user.id) || guilds.some((g) => g.isOwner);

    return c.json({
      authenticated: true,
      user: session.user,
      isBotOwner,
      canAccessSystem,
      meta: bot.getBotMeta(probe),
      guilds,
      preferences,
    });
  });

  app.post("/api/preferences", async (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    let body: Partial<UserPreferencesDTO> = {};
    try {
      const raw = await c.req.json();
      if (raw && typeof raw === "object") {
        body = raw as Partial<UserPreferencesDTO>;
      }
    } catch {
      return c.json({ error: "Invalid JSON payload" }, 400);
    }

    const preferences = db.updateUserPreferences(session.user.id, body);
    if (body.pauseOnEmpty !== undefined || body.pauseOnEmptySeconds !== undefined) {
      for (const guild of bot.client.guilds.cache.values()) {
        if (
          bot.isGuildAdmin(guild.id, session.user.id) ||
          bot.music.isPrivileged(guild.id, session.user.id)
        ) {
          db.updateGuildSettings(guild.id, {
            pauseOnEmpty: preferences.pauseOnEmpty,
            pauseOnEmptySeconds: preferences.pauseOnEmptySeconds,
          });
          bot.music.onGuildSettingsUpdated(guild.id);
        }
      }
    }
    writePrefsCookie(c, preferences);
    return c.json({ preferences });
  });

  app.get("/api/recommendations", async (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userId = session.user.id;
    const todayKey = new Date().toISOString().slice(0, 10);
    const forceRefresh = c.req.query("refresh") === "1";
    const cacheKey = `${userId}:${todayKey}`;

    if (!forceRefresh) {
      const cached = dailyRecCache.get(cacheKey);
      if (cached && Date.now() - cached.at < DAILY_REC_TTL_MS && cached.data.tracks.length > 0) {
        return c.json(cached.data);
      }
    }

    const history = db.getPlayHistory(userId, 50);
    const liked = db.ensureLikedPlaylist(userId).tracks;
    const pinned = db.getPinnedTracks(userId, 20).map((p) => p.track);

    const pool: TrackDTO[] = [];
    const seenPoolIds = new Set<string>();
    for (const candidate of [...history.map((h) => h.track), ...pinned, ...liked]) {
      if (candidate.isStream || !candidate.identifier || seenPoolIds.has(candidate.identifier)) {
        continue;
      }
      seenPoolIds.add(candidate.identifier);
      pool.push(candidate);
    }

    if (pool.length === 0) {
      return c.json({
        tracks: [],
        basedOn: [],
        date: todayKey,
      } satisfies DailyRecommendationsDTO);
    }

    const requester = {
      id: userId,
      username: session.user.globalName || session.user.username,
      avatarUrl: session.user.avatarUrl,
    };

    const seedOffset = forceRefresh
      ? Math.floor(Math.random() * pool.length)
      : hashSeed(`${userId}:${todayKey}`) % pool.length;

    const chosenSeeds: TrackDTO[] = [];
    const seenArtists = new Set<string>();
    for (let i = 0; i < pool.length && chosenSeeds.length < 3; i++) {
      const item = pool[(seedOffset + i) % pool.length];
      const artistKey = cleanArtistTag(item.author).toLowerCase();
      if (chosenSeeds.length === 0 || !artistKey || !seenArtists.has(artistKey)) {
        chosenSeeds.push(item);
        if (artistKey) seenArtists.add(artistKey);
      }
    }
    if (chosenSeeds.length < Math.min(3, pool.length)) {
      for (const item of pool) {
        if (chosenSeeds.length >= 3) break;
        if (!chosenSeeds.some((s) => s.identifier === item.identifier)) {
          chosenSeeds.push(item);
        }
      }
    }

    const excludedIds = new Set<string>(history.slice(0, 8).map((h) => h.track.identifier));
    for (const s of chosenSeeds) {
      excludedIds.add(s.identifier);
    }

    const lists = await Promise.allSettled(
      chosenSeeds.map((seed) => bot.music.getRelatedTracks(seed, requester, 12))
    );

    const fulfilledLists: TrackDTO[][] = [];
    for (const outcome of lists) {
      if (outcome.status === "fulfilled" && outcome.value.length > 0) {
        fulfilledLists.push(outcome.value);
      }
    }

    const picked: TrackDTO[] = [];
    const seenIds = new Set<string>(excludedIds);
    const seenTitles = new Set<string>(chosenSeeds.map((s) => normTitleKey(s.title)).filter(Boolean));
    const maxLen = fulfilledLists.reduce((m, l) => Math.max(m, l.length), 0);

    for (let i = 0; i < maxLen && picked.length < 10; i++) {
      for (const list of fulfilledLists) {
        const track = list[i];
        if (!track || track.isStream || !track.identifier) continue;
        if (seenIds.has(track.identifier)) continue;
        const tKey = normTitleKey(track.title);
        if (tKey && seenTitles.has(tKey)) continue;
        seenIds.add(track.identifier);
        if (tKey) seenTitles.add(tKey);
        picked.push(track);
        if (picked.length >= 10) break;
      }
    }

    const basedOn = chosenSeeds.map((s) => s.title).slice(0, 3);
    const payload: DailyRecommendationsDTO = {
      tracks: picked,
      basedOn,
      date: todayKey,
    };

    if (picked.length > 0) {
      dailyRecCache.set(cacheKey, { at: Date.now(), data: payload });
    }
    return c.json(payload);
  });

  app.get("/api/artwork", async (c) => {
    const rawUrl = c.req.query("url");
    if (!rawUrl) {
      return c.json({ error: "Missing url query parameter" }, 400);
    }

    let currentUrl = parseAllowedArtworkUrl(rawUrl);
    if (!currentUrl) {
      return c.json({ error: "Artwork host is not allowed" }, 400);
    }

    try {
      let res: globalThis.Response | null = null;
      for (let hops = 0; hops <= 2; hops++) {
        res = await fetch(currentUrl.toString(), {
          signal: AbortSignal.timeout(8000),
          redirect: "manual",
          headers: {
            Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0",
          },
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) {
            return c.json({ error: "Invalid upstream redirect" }, 502);
          }
          const nextUrl = parseAllowedArtworkUrl(location, currentUrl);
          if (!nextUrl) {
            return c.json({ error: "Redirected artwork host is not allowed" }, 400);
          }
          currentUrl = nextUrl;
          continue;
        }
        break;
      }

      if (!res || !res.ok) {
        return c.json({ error: "Failed to fetch artwork" }, res ? 502 : 504);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) {
        return c.json({ error: "Upstream response is not an image" }, 400);
      }

      // Reject YouTube's known 120x90 grey placeholder on maxresdefault/sddefault so client falls back cleanly
      if (
        currentUrl.hostname.toLowerCase().endsWith("ytimg.com") &&
        /\/(?:maxresdefault|sddefault)\.(?:jpg|webp)$/i.test(currentUrl.pathname) &&
        res.headers.get("content-length") === "1097"
      ) {
        return c.json({ error: "YouTube placeholder thumbnail" }, 404);
      }

      return new Response(res.body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return c.json({ error: "Artwork fetch failed" }, 502);
    }
  });

  app.get("/api/search/suggest", async (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const q = (c.req.query("q") || "").trim();
    if (q.length < 2) {
      return c.json({ query: q, suggestions: [], tracks: [] } satisfies SearchSuggestResponseDTO);
    }

    const rawSource = (c.req.query("source") || "auto") as SearchSource;
    const requestedSource: SearchSource = VALID_SEARCH_SOURCES.has(rawSource) ? rawSource : "auto";
    const source: SearchSource =
      requestedSource === "auto"
        ? db.getUserPreferences(session.user.id).defaultSearchSource
        : requestedSource;
    const requester = {
      id: session.user.id,
      username: session.user.globalName || session.user.username,
      avatarUrl: session.user.avatarUrl,
    };

    const [suggestRes, trackRes] = await Promise.allSettled([
      (async () => {
        const res = await fetch(
          `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`,
          {
            signal: AbortSignal.timeout(3000),
            headers: { "User-Agent": "Mozilla/5.0" },
          }
        );
        if (!res.ok) return [] as string[];
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data) || !Array.isArray(data[1])) return [] as string[];
        return data[1]
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .slice(0, 6);
      })(),
      bot.music.search(q, source, requester),
    ]);

    const suggestions = suggestRes.status === "fulfilled" ? suggestRes.value : [];
    const tracks =
      trackRes.status === "fulfilled" ? trackRes.value.tracks.slice(0, 4) : ([] as TrackDTO[]);

    return c.json({ query: q, suggestions, tracks } satisfies SearchSuggestResponseDTO);
  });

  const exploreCache = new Map<string, { at: number; tracks: TrackDTO[] }>();
  const EXPLORE_DEFAULT_QUERIES: Record<string, string> = {
    ytmsearch: "top global hits",
    ytsearch: "trending music video",
    spsearch: "today top hits",
    scsearch: "electronic chill remix",
    dzsearch: "top hits",
  };

  app.get("/api/explore", async (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const rawSource = (c.req.query("source") || "ytmsearch") as SearchSource;
    const source: SearchSource =
      VALID_SEARCH_SOURCES.has(rawSource) && rawSource !== "auto" ? rawSource : "ytmsearch";
    const customQuery = (c.req.query("q") || "").trim();
    const query = customQuery || EXPLORE_DEFAULT_QUERIES[source] || "top hits";
    const cacheKey = `${source}:${query.toLowerCase()}`;
    const forceRefresh = c.req.query("refresh") === "1";

    if (!forceRefresh) {
      const cached = exploreCache.get(cacheKey);
      if (cached && Date.now() - cached.at < 10 * 60 * 1000 && cached.tracks.length > 0) {
        return c.json({ source, query, tracks: cached.tracks });
      }
    }

    const requester = {
      id: session.user.id,
      username: session.user.globalName || session.user.username,
      avatarUrl: session.user.avatarUrl,
    };

    try {
      const { tracks } = await bot.music.search(query, source, requester);
      const sliced = tracks.slice(0, 12);
      if (sliced.length > 0) {
        exploreCache.set(cacheKey, { at: Date.now(), tracks: sliced });
      }
      return c.json({ source, query, tracks: sliced });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load explore tracks.";
      return c.json({ error: msg, source, query, tracks: [] }, 502);
    }
  });

  app.get("/api/artist", async (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const name = (c.req.query("name") || "").trim();
    if (!name) {
      return c.json({ error: "Missing artist name" }, 400);
    }

    const requester = {
      id: session.user.id,
      username: session.user.globalName || session.user.username,
      avatarUrl: session.user.avatarUrl,
    };

    try {
      const profile = await bot.music.getArtistProfile(name, requester);
      return c.json(profile);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load artist profile.";
      const status = msg.includes("not connected") ? 503 : 502;
      return c.json({ error: msg }, status);
    }
  });

  app.get("/api/related", async (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = (c.req.query("id") || "").trim();
    const title = (c.req.query("title") || "").trim();
    const author = (c.req.query("author") || "").trim();
    const sourceName = (c.req.query("source") || "youtube").trim();
    const uri = (c.req.query("uri") || "").trim() || null;

    if (!id && !title) {
      return c.json({ tracks: [] });
    }

    const requester = {
      id: session.user.id,
      username: session.user.globalName || session.user.username,
      avatarUrl: session.user.avatarUrl,
    };

    try {
      const tracks = await bot.music.getRelatedTracks(
        { identifier: id, title, author, sourceName, uri },
        requester,
        20
      );
      return c.json({ tracks });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load related tracks.";
      const status = msg.includes("not connected") ? 503 : 502;
      return c.json({ error: msg, tracks: [] }, status);
    }
  });

  const buildSystemInfo = (): SystemInfoDTO => {
    let lavalinkConnected = false;
    let lavalinkVersion: string | null = null;
    let lavaplayer: string | null = null;
    let jvm: string | null = null;
    let plugins: { name: string; version: string }[] = [];

    for (const node of bot.music.manager.nodeManager.nodes.values()) {
      if (node.connected) {
        lavalinkConnected = true;
        lavalinkVersion = node.info?.version?.semver ?? "4.x";
        lavaplayer = node.info?.lavaplayer ?? null;
        jvm = node.info?.jvm ?? null;
        plugins = Array.isArray(node.info?.plugins)
          ? node.info.plugins.map((p) => ({ name: p.name, version: p.version }))
          : [];
        break;
      }
    }

    return {
      appVersion: pkg.version || "1.0.0",
      runtime: {
        name: "Bun",
        version: typeof Bun !== "undefined" ? Bun.version : process.versions.node,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      },
      lavalink: {
        connected: lavalinkConnected,
        version: lavalinkVersion,
        lavaplayer,
        jvm,
        plugins,
      },
      dependencies: { ...pkg.dependencies },
      devDependencies: { ...pkg.devDependencies },
      logCount: getLogCount(),
    };
  };

  app.get("/api/system/info", (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!bot.isBotOwner(session.user.id) && !bot.isAnyGuildOwner(session.user.id)) {
      return c.json({ error: "Server owner or bot owner access required." }, 403);
    }
    return c.json(buildSystemInfo());
  });

  app.get("/api/system/logs", (c) => {
    const session = getSessionFromContext(c, db);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!bot.isBotOwner(session.user.id) && !bot.isAnyGuildOwner(session.user.id)) {
      return c.json({ error: "Server owner or bot owner access required." }, 403);
    }
    const info = buildSystemInfo();
    if (c.req.query("download") === "1") {
      const dateStamp = new Date().toISOString().slice(0, 10);
      const header = [
        `# Cadence Debug Report`,
        `# Generated: ${new Date().toISOString()}`,
        ``,
        `## System Info`,
        JSON.stringify(info, null, 2),
        ``,
        `## Recent Server Logs (${getLogCount()} captured)`,
        formatLogsText(500) || "(no logs captured yet)",
        ``,
      ].join("\n");
      return new Response(header, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="cadence-debug-${dateStamp}.txt"`,
        },
      });
    }

    return c.json({
      info,
      logs: getRecentLogs(300),
      text: formatLogsText(300),
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
