import type { FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors";

interface Bucket {
  count: number;
  resetAt: number;
}

// Fixed-window counters keyed by route-prefix + client IP. The map is pruned
// on a timer and whenever a window expires, so memory stays bounded.
const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS).unref();

export interface RateLimitRule {
  keyPrefix: string;
  max: number;
  windowMs: number;
}

function isTrustedProxyPeer(ip: string): boolean {
  // Production reaches the gateway through the local reverse proxy, so the
  // direct peer is loopback (or a private LAN address when the proxy is remote).
  const addr = ip.replace(/^::ffff:/, "");
  if (addr === "::1" || addr === "127.0.0.1" || addr.startsWith("127.")) return true;
  if (addr.startsWith("10.") || addr.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr)) return true;
  return false;
}

function clientIp(req: FastifyRequest): string {
  const peer = req.ip;
  const forwarded = req.headers["x-forwarded-for"];
  // Only honor X-Forwarded-For when the direct connection comes from our own
  // reverse proxy. Our proxy APPENDS the real client address, so the trusted
  // value is the LAST entry; an attacker-supplied leading entry is ignored.
  if (isTrustedProxyPeer(peer) && typeof forwarded === "string" && forwarded.length > 0) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return peer;
}

/** Build a preHandler hook that rejects traffic above max requests per window. */
export function rateLimit(rule: RateLimitRule) {
  return async function rateLimitHook(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const key = rule.keyPrefix + ":" + clientIp(req);
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
      return;
    }
    bucket.count += 1;
    if (bucket.count > rule.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      throw new AppError(429, "RATE_LIMITED", "Too many requests, retry after " + retryAfter + "s");
    }
  };
}

const WINDOW_MS = 15 * 60 * 1000;
// Strict limiter for credential endpoints (brute-force protection).
export const authRateLimit = rateLimit({ keyPrefix: "auth", max: 12, windowMs: WINDOW_MS });
// Looser limiter for authenticated buyer actions.
export const actionRateLimit = rateLimit({ keyPrefix: "action", max: 60, windowMs: WINDOW_MS });
// Generous limiter for server-to-server sales-channel webhooks.
export const webhookRateLimit = rateLimit({ keyPrefix: "webhook", max: 120, windowMs: WINDOW_MS });
