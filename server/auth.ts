import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { DiscordOAuthGuild } from "./bot";
import { config } from "./config";
import type { CadenceDatabase, SessionRecord } from "./db";

export const SESSION_COOKIE_NAME = "cadence_session";
export const OAUTH_STATE_COOKIE_NAME = "cadence_oauth_state";
const DISCORD_API_BASE = "https://discord.com/api/v10";
const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

interface CachedGuilds {
  guilds: DiscordOAuthGuild[];
  expiresAt: number;
}

const guildCache = new Map<string, CachedGuilds>();

function signValue(value: string): string {
  return createHmac("sha256", config.sessionSecret).update(value).digest("hex");
}

export function createSignedSessionCookie(sessionId: string): string {
  return `${sessionId}.${signValue(sessionId)}`;
}

export function verifySignedSessionCookie(raw: string | undefined): string | null {
  if (!raw) return null;
  const dotIdx = raw.indexOf(".");
  if (dotIdx <= 0) return null;

  const sessionId = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expected = signValue(sessionId);

  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

  return sessionId;
}

export function getSessionFromContext(c: Context, db: CadenceDatabase): SessionRecord | null {
  const rawCookie = getCookie(c, SESSION_COOKIE_NAME);
  const sessionId = verifySignedSessionCookie(rawCookie);
  if (!sessionId) return null;
  return db.getSession(sessionId);
}

export function setSessionCookie(c: Context, sessionId: string): void {
  setCookie(c, SESSION_COOKIE_NAME, createSignedSessionCookie(sessionId), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
    secure: config.isSecureCookie,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}

export async function fetchDiscordUser(accessToken: string) {
  const res = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Discord user lookup failed (${res.status}).`);
  }
  const data = (await res.json()) as {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };

  return {
    id: data.id,
    username: data.username,
    globalName: data.global_name ?? null,
    avatarUrl: data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.webp?size=128`
      : null,
  };
}

export async function fetchDiscordUserGuilds(
  userId: string,
  accessToken: string
): Promise<DiscordOAuthGuild[]> {
  const cached = guildCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.guilds;
  }

  const res = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    if (cached) return cached.guilds;
    return [];
  }

  const guilds = (await res.json()) as DiscordOAuthGuild[];
  guildCache.set(userId, {
    guilds,
    expiresAt: Date.now() + 30_000,
  });
  return guilds;
}

export function clearGuildCacheForUser(userId: string): void {
  guildCache.delete(userId);
}
