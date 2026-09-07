import { prisma } from "../db/prisma";
import { logger } from "../logger";

const MAX_DETAIL_CHARS = 1500;

// Fields that must never land in the audit trail verbatim.
const REDACT_KEYS = /password|secret|token|apiKey|api_key|pass/i;

/** Recursively redact sensitive fields from a request-body snapshot. */
function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? "***" : redact(v, depth + 1);
  }
  return out;
}

/**
 * Record one admin mutation. Best-effort: audit failures are logged but never
 * break the request that triggered them.
 */
export async function logAdminAction(params: {
  admin: string;
  method: string;
  path: string;
  status: number;
  body?: unknown;
  ip?: string;
}): Promise<void> {
  try {
    let detail = "";
    if (params.body && typeof params.body === "object") {
      detail = JSON.stringify(redact(params.body));
      if (detail.length > MAX_DETAIL_CHARS) detail = detail.slice(0, MAX_DETAIL_CHARS) + "…";
    }
    await prisma.adminAuditLog.create({
      data: {
        admin: params.admin || "unknown",
        method: params.method,
        path: params.path.slice(0, 200),
        status: params.status,
        detail,
        ip: (params.ip ?? "").slice(0, 64)
      }
    });
  } catch (err) {
    logger.warn(`Failed to write audit log: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function listAudit(filter: {
  admin?: string;
  q?: string;
  from?: string;
  to?: string;
}) {
  const where: {
    admin?: string;
    path?: { contains: string };
    createdAt?: { gte?: Date; lte?: Date };
  } = {};
  if (filter.admin) where.admin = filter.admin;
  const keyword = (filter.q || "").trim();
  if (keyword) where.path = { contains: keyword };
  const range: { gte?: Date; lte?: Date } = {};
  if (filter.from) {
    const d = new Date(filter.from);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (filter.to) {
    const d = new Date(filter.to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      range.lte = d;
    }
  }
  if (range.gte || range.lte) where.createdAt = range;
  return prisma.adminAuditLog.findMany({
    where,
    orderBy: { id: "desc" },
    take: 200
  });
}
