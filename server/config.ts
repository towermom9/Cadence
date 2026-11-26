import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SearchSource } from "@shared/types";
import type { StoredAppConfig } from "./db";

export const VALID_SEARCH_SOURCES = new Set<SearchSource>([
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

export function isConfiguredValue(value: string | undefined | null): value is string {
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

const envDashboardUrl = (process.env.DASHBOARD_URL?.trim() || `http://localhost:${port}`).replace(
  /\/+$/,
  ""
);
const envRedirectUri = process.env.DISCORD_REDIRECT_URI?.trim() || "";
const rawSearchSource = process.env.DEFAULT_SEARCH_SOURCE?.trim() as SearchSource | undefined;
const envSearchSource: SearchSource =
  rawSearchSource && VALID_SEARCH_SOURCES.has(rawSearchSource) ? rawSearchSource : "ytmsearch";

const envToken = process.env.DISCORD_TOKEN?.trim() || "";
const envClientId = process.env.DISCORD_CLIENT_ID?.trim() || "";
const envClientSecret = process.env.DISCORD_CLIENT_SECRET?.trim() || "";
const envPrefix = process.env.BOT_PREFIX?.trim() || "?";
const envSetupToken = process.env.SETUP_TOKEN?.trim() || "";

export interface RuntimeConfig {
  host: string;
  port: number;
  dashboardUrl: string;
  dataDir: string;
  sessionSecret: string;
  setupToken: string;
  discordToken: string;
  discordClientId: string;
  discordClientSecret: string;
  discordRedirectUri: string;
  hasBotToken: boolean;
  hasOAuthConfig: boolean;
  setupCompleted: boolean;
  needsSetup: boolean;
  ownerUserId: string | null;
  botPrefix: string;
  defaultSearchSource: SearchSource;
  trackStuckTimeoutMs: number;
  lavalink: {
    host: string;
    port: number;
    password: string;
    secure: boolean;
  };
  isSecureCookie: boolean;
}

function buildConfigState(stored: StoredAppConfig | null): Omit<RuntimeConfig, "host" | "port" | "dataDir" | "sessionSecret" | "setupToken" | "lavalink"> {
  const useStored = Boolean(stored?.setupCompleted);

  const discordToken =
    useStored && isConfiguredValue(stored?.discordToken)
      ? stored!.discordToken.trim()
      : envToken;
  const discordClientId =
    useStored && isConfiguredValue(stored?.discordClientId)
      ? stored!.discordClientId.trim()
      : envClientId;
  const discordClientSecret =
    useStored && isConfiguredValue(stored?.discordClientSecret)
      ? stored!.discordClientSecret.trim()
      : envClientSecret;

  const dashboardUrl = (
    (useStored && stored?.dashboardUrl.trim()) ||
    envDashboardUrl
  ).replace(/\/+$/, "");

  const botPrefix = (useStored && stored?.botPrefix.trim()) || envPrefix;
  const candidateSource = useStored ? stored?.defaultSearchSource : envSearchSource;
  const defaultSearchSource: SearchSource =
    candidateSource && VALID_SEARCH_SOURCES.has(candidateSource) ? candidateSource : envSearchSource;

  const envStuckTimeout = parsePositiveInt(process.env.TRACK_STUCK_THRESHOLD_MS, 20000);
  const rawStuckTimeout = stored?.trackStuckTimeoutMs;
  const trackStuckTimeoutMs =
    typeof rawStuckTimeout === "number" && Number.isFinite(rawStuckTimeout)
      ? Math.max(5000, Math.min(60000, Math.round(rawStuckTimeout)))
      : Math.max(5000, Math.min(60000, envStuckTimeout));

  const hasBotToken = isConfiguredValue(discordToken);
  const hasOAuthConfig =
    isConfiguredValue(discordClientId) && isConfiguredValue(discordClientSecret);
  const setupCompleted = Boolean(stored?.setupCompleted) || (hasBotToken && hasOAuthConfig);
  const needsSetup = !(hasBotToken && hasOAuthConfig);

  return {
    dashboardUrl,
    discordToken,
    discordClientId,
    discordClientSecret,
    discordRedirectUri: envRedirectUri || `${dashboardUrl}/api/auth/callback`,
    hasBotToken,
    hasOAuthConfig,
    setupCompleted,
    needsSetup,
    ownerUserId: useStored ? stored?.ownerUserId ?? null : null,
    botPrefix,
    defaultSearchSource,
    trackStuckTimeoutMs,
    isSecureCookie: dashboardUrl.startsWith("https://"),
  };
}

export const config: RuntimeConfig = {
  host,
  port,
  dataDir,
  sessionSecret: resolveSessionSecret(dataDir),
  setupToken: envSetupToken,
  lavalink: {
    host: process.env.LAVALINK_HOST?.trim() || "localhost",
    port: parsePositiveInt(process.env.LAVALINK_PORT, 2333),
    password: process.env.LAVALINK_PASSWORD?.trim() || "youshallnotpass",
    secure: parseBoolean(process.env.LAVALINK_SECURE, false),
  },
  ...buildConfigState(null),
};

export function applyStoredConfig(stored: StoredAppConfig | null): void {
  Object.assign(config, buildConfigState(stored));
}
