import { randomInt, timingSafeEqual } from "node:crypto";

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 15 * 1000;
const UNLOCK_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

interface PendingOtp {
  code: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  attempts: number;
}

interface UnlockGrant {
  userId: string;
  expiresAt: number;
}

const pendingOtps = new Map<string, PendingOtp>();
const unlockGrants = new Map<string, UnlockGrant>();

function makeKey(sessionId: string, scope: string): string {
  return `${sessionId}::${scope}`;
}

export function requestOtp(
  sessionId: string,
  userId: string,
  scope: string
): { code: string; expiresAt: number } {
  const now = Date.now();
  const key = makeKey(sessionId, scope);
  const existing = pendingOtps.get(key);
  if (existing && now - existing.createdAt < OTP_COOLDOWN_MS) {
    const waitSec = Math.ceil((OTP_COOLDOWN_MS - (now - existing.createdAt)) / 1000);
    throw new Error(`Please wait ${waitSec}s before requesting another OTP.`);
  }

  const code = String(randomInt(100000, 1000000));
  const expiresAt = now + OTP_TTL_MS;
  pendingOtps.set(key, {
    code,
    userId,
    createdAt: now,
    expiresAt,
    attempts: 0,
  });

  return { code, expiresAt };
}

export function verifyOtp(
  sessionId: string,
  userId: string,
  scope: string,
  rawCode: string
): { expiresAt: number } {
  const now = Date.now();
  const key = makeKey(sessionId, scope);
  const pending = pendingOtps.get(key);
  if (!pending || pending.userId !== userId) {
    throw new Error("No active OTP found. Request a new code first.");
  }
  if (now > pending.expiresAt) {
    pendingOtps.delete(key);
    throw new Error("OTP code has expired. Request a new code.");
  }

  const clean = rawCode.replace(/\s+/g, "").trim();
  const a = Buffer.from(clean);
  const b = Buffer.from(pending.code);
  const matched = a.length === b.length && timingSafeEqual(a, b);

  if (!matched) {
    pending.attempts += 1;
    if (pending.attempts >= MAX_ATTEMPTS) {
      pendingOtps.delete(key);
      throw new Error("Too many invalid OTP attempts. Request a new code.");
    }
    throw new Error(`Invalid OTP code (${MAX_ATTEMPTS - pending.attempts} attempts left).`);
  }

  pendingOtps.delete(key);
  const expiresAt = now + UNLOCK_TTL_MS;
  unlockGrants.set(key, { userId, expiresAt });
  return { expiresAt };
}

export function isScopeUnlocked(
  sessionId: string,
  userId: string,
  scope: string
): boolean {
  const key = makeKey(sessionId, scope);
  const grant = unlockGrants.get(key);
  if (!grant) return false;
  if (grant.userId !== userId || Date.now() > grant.expiresAt) {
    unlockGrants.delete(key);
    return false;
  }
  return true;
}

export function getUnlockExpiresAt(
  sessionId: string,
  userId: string,
  scope: string
): number | null {
  const key = makeKey(sessionId, scope);
  const grant = unlockGrants.get(key);
  if (!grant || grant.userId !== userId || Date.now() > grant.expiresAt) {
    if (grant) unlockGrants.delete(key);
    return null;
  }
  return grant.expiresAt;
}

export function revokeSessionUnlocks(sessionId: string): void {
  const prefix = `${sessionId}::`;
  for (const key of pendingOtps.keys()) {
    if (key.startsWith(prefix)) pendingOtps.delete(key);
  }
  for (const key of unlockGrants.keys()) {
    if (key.startsWith(prefix)) unlockGrants.delete(key);
  }
}
