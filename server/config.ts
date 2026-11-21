import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SearchSource } from "@shared/types";

const VALID_SEARCH_SOURCES = new Set<SearchSource>([
  "auto",
  "ytsearch",
  "ytmsearch",
  "spsearch",
  "dzsearch",
  "scsearch",
]);

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return fallback;
}

function resolveSessionSecret(dataDir: string): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret && envSecret !== "change-me" && envSecret !== "change-me-to-a-random-string") {
    return envSecret;
  }

  mkdirSync(dataDir, { recursive: true });
  const secretPath = join(dataDir, ".session-secret");
  if (existsSync(secretPath)) {
    const stored = readFileSync(secretPath, "utf8").trim();
    if (stored.length >= 32) {
      return stored;
    }
  }

  const generated = randomBytes(32).toString("hex");
  writeFileSync(secretPath, generated, { encoding: "utf8", mode: 0o600 });
  return generated;
}

function isConfiguredValue(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  return (
    !upper.startsWith("YOUR_") &&
    !upper.includes("REPLACE_WITH") &&
    trimmed !== "changeme"
  );
}

const dataDir = resolve(process.env.DATA_DIR?.trim() || "./data");
const port = parsePositiveInt(process.env.PORT, 8000);
const host = process.env.HOST?.trim() || "0.0.0.0";
const dashboardUrl = (process.env.DASHBOARD_URL?.trim() || `http://localhost:${port}`).replace(/\/+$/, "");
const discordRedirectUri =
  process.env.DISCORD_REDIRECT_URI?.trim() || `${dashboardUrl}/api/auth/callback`;

const rawSearchSource = process.env.DEFAULT_SEARCH_SOURCE?.trim() as SearchSource | undefined;
const defaultSearchSource: SearchSource =
  rawSearchSource && VALID_SEARCH_SOURCES.has(rawSearchSource) ? rawSearchSource : "ytmsearch";

const discordToken = process.env.DISCORD_TOKEN?.trim() || "";
const discordClientId = process.env.DISCORD_CLIENT_ID?.trim() || "";
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET?.trim() || "";

export const config = {
  host,
  port,
  dashboardUrl,
  dataDir,
  sessionSecret: resolveSessionSecret(dataDir),
  discordToken,
  discordClientId,
  discordClientSecret,
  discordRedirectUri,
  hasBotToken: isConfiguredValue(discordToken),
  hasOAuthConfig: isConfiguredValue(discordClientId) && isConfiguredValue(discordClientSecret),
  botPrefix: process.env.BOT_PREFIX?.trim() || "?",
  defaultSearchSource,
  lavalink: {
    host: process.env.LAVALINK_HOST?.trim() || "localhost",
    port: parsePositiveInt(process.env.LAVALINK_PORT, 2333),
    password: process.env.LAVALINK_PASSWORD?.trim() || "youshallnotpass",
    secure: parseBoolean(process.env.LAVALINK_SECURE, false),
  },
  isSecureCookie: dashboardUrl.startsWith("https://"),
} as const;
