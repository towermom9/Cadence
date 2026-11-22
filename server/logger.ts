import { format } from "node:util";
import type { DebugLogEntryDTO } from "@shared/types";

const MAX_LOGS = 1000;
const logBuffer: DebugLogEntryDTO[] = [];
let installed = false;

export function redactSecrets(input: string): string {
  return input
    // Discord bot/user tokens (three dot-separated base64url segments)
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]")
    // Authorization / Bearer headers
    .replace(/(Authorization\s*[:=]\s*Bearer\s+)[^\s"',;]+/gi, "$1[REDACTED]")
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[REDACTED]")
    .replace(/(Authorization\s*[:=]\s*)[^\s"',;\n]+/gi, "$1[REDACTED]")
    // Key/value secrets, OTP codes, and session cookies
    .replace(
      /\b(DISCORD_CLIENT_SECRET|DISCORD_TOKEN|SESSION_SECRET|LAVALINK_PASSWORD|client_secret|access_token|refresh_token|refreshToken|password|cadence_session|otp|code)(\s*[:=]\s*)(["']?)[^\s"',;&\n]+\3/gi,
      "$1$2[REDACTED]"
    )
    .replace(/(\bCookie\s*[:=]\s*)[^\n]+/gi, "$1[REDACTED]")
    // Discord webhook URLs
    .replace(/https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi, "[REDACTED_WEBHOOK]")
    // Email addresses
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]")
    // External IPv4 addresses (preserve 0.0.0.0 and 127.0.0.1)
    .replace(/\b(?!127\.0\.0\.1\b|0\.0\.0\.0\b)(?:\d{1,3}\.){3}\d{1,3}\b/g, "[REDACTED_IP]");
}

function formatArgs(args: unknown[]): string {
  const formatted = args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack || `${arg.name}: ${arg.message}`;
      }
      if (typeof arg === "string") return arg;
      return format("%o", arg);
    })
    .join(" ");
  const clean = redactSecrets(formatted);
  return clean.length > 4000 ? `${clean.slice(0, 4000)}…` : clean;
}

function pushEntry(level: DebugLogEntryDTO["level"], args: unknown[]): void {
  const entry: DebugLogEntryDTO = {
    ts: Date.now(),
    level,
    message: formatArgs(args),
  };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.splice(0, logBuffer.length - MAX_LOGS);
  }
}

export function installDebugLogger(): void {
  if (installed) return;
  installed = true;

  const origLog = console.log.bind(console);
  const origInfo = console.info.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    pushEntry("log", args);
    origLog(...args);
  };
  console.info = (...args: unknown[]) => {
    pushEntry("info", args);
    origInfo(...args);
  };
  console.warn = (...args: unknown[]) => {
    pushEntry("warn", args);
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    pushEntry("error", args);
    origError(...args);
  };
}

export function getRecentLogs(limit = 500): DebugLogEntryDTO[] {
  const safeLimit = Math.max(1, Math.min(MAX_LOGS, Math.floor(limit)));
  return logBuffer.slice(-safeLimit);
}

export function getLogCount(): number {
  return logBuffer.length;
}

export function formatLogsText(limit = 500): string {
  return getRecentLogs(limit)
    .map((entry) => {
      const iso = new Date(entry.ts).toISOString();
      return `[${iso}] [${entry.level.toUpperCase()}] ${entry.message}`;
    })
    .join("\n");
}
