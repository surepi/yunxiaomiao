import { config } from "../config";
import { tooManyRequests } from "../errors";

interface Attempt {
  failures: number;
  firstFailAt: number;
  lockedUntil: number;
}

// Per-account consecutive-failure tracker. In-memory, matching the per-IP rate
// limiter; the gateway runs as a single process behind the reverse proxy.
const attempts = new Map<string, Attempt>();

// Failures older than this start a fresh streak (and are pruned from memory).
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [key, a] of attempts) {
    const lockExpired = a.lockedUntil !== 0 && a.lockedUntil <= now;
    const streakExpired = a.lockedUntil === 0 && now - a.firstFailAt > FAILURE_WINDOW_MS;
    if (lockExpired || streakExpired) attempts.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

/** Account-key helper: separate buyer and admin namespaces. */
export function accountKey(scope: "user" | "admin", username: string): string {
  return `${scope}:${(username || "").trim().toLowerCase()}`;
}

/** Throw 429 if the account is currently locked due to repeated failed logins. */
export function assertNotLocked(key: string): void {
  const a = attempts.get(key);
  if (a && a.lockedUntil > Date.now()) {
    const minutes = Math.max(1, Math.ceil((a.lockedUntil - Date.now()) / 60000));
    throw tooManyRequests(
      `Too many failed login attempts. Please try again in about ${minutes} minute(s).`,
      "LOGIN_LOCKED"
    );
  }
}

/**
 * Record a failed login. Once consecutive failures within the window reach the
 * configured threshold the account is locked for the lockout period.
 */
export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const a = attempts.get(key) ?? { failures: 0, firstFailAt: now, lockedUntil: 0 };
  if (a.lockedUntil && a.lockedUntil <= now) {
    a.failures = 0;
    a.lockedUntil = 0;
    a.firstFailAt = now;
  }
  if (a.failures === 0 || now - a.firstFailAt > FAILURE_WINDOW_MS) {
    a.failures = 0;
    a.firstFailAt = now;
  }
  a.failures += 1;
  if (a.failures >= config.loginMaxFailures) {
    a.lockedUntil = now + config.loginLockoutMinutes * 60000;
  }
  attempts.set(key, a);
}

/** Clear any failure/lock state after a successful login. */
export function recordLoginSuccess(key: string): void {
  attempts.delete(key);
}
