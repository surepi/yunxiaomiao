import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../security/guards";
import * as packageService from "../services/packageService";
import * as cardService from "../services/cardService";
import { listNodesOverview, upsertNodeConfig } from "../services/nodeService";
import { getOverview } from "../services/statsService";
import * as announcementService from "../services/announcementService";
import * as auditService from "../services/auditService";
import { prisma } from "../db/prisma";
import { Prisma } from "@prisma/client";
import { panelClient } from "../panel/client";
import { parse, parseId } from "./validate";
import { config } from "../config";

// A JSON-encoded object string, validated when a package is saved so that
// configuration mistakes surface in the admin console instead of at redeem time.
const jsonObjectString = (label: string) =>
  z.string().refine(
    (value) => {
      try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
      } catch {
        return false;
      }
    },
    { message: label + " must be a valid JSON object" }
  );

const packageSchema = z.object({
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional().default(""),
  priceFen: z.number().int().min(0).default(0),
  hours: z.number().int().min(1).default(720),
  mcsmCategoryId: z.number().int().min(0).default(0),
  setupInfo: jsonObjectString("setupInfo"),
  resourceLimits: jsonObjectString("resourceLimits").optional().default("{}"),
  nodeStrategy: z.enum(["auto", "fixed"]).default("auto"),
  fixedNodeId: z.string().optional().default(""),
  active: z.boolean().optional().default(true),
  sort: z.number().int().optional().default(0),
  lowStock: z.number().int().min(0).max(100000).optional().default(10)
});
// Update accepts any subset of the create payload.
const packageUpdateSchema = packageSchema.partial();

const generateSchema = z.object({
  packageId: z.number().int().positive(),
  count: z.number().int().min(1).max(10000),
  batchNo: z.string().max(64).optional(),
  expiresAt: z.string().datetime().optional()
});

const cardStatusSchema = z.object({
  status: z.enum(["unused", "disabled"])
});

const batchStatusSchema = z.object({
  status: z.enum(["unused", "disabled"])
});

const nodeConfigSchema = z.object({
  weight: z.number().int().min(1).max(100).optional(),
  maxInstances: z.number().int().min(0).max(10000).optional(),
  enabled: z.boolean().optional(),
  note: z.string().max(120).optional()
});

const announcementSchema = z.object({
  title: z.string().max(120).optional().default(""),
  content: z.string().min(1).max(2000),
  level: z.enum(["info", "warn", "critical"]).default("info"),
  active: z.boolean().optional().default(true),
  // datetime-local strings ("2026-09-10T13:00") or null; empty means no window.
  startAt: z.string().optional().nullable(),
  endAt: z.string().optional().nullable()
});
const announcementUpdateSchema = announcementSchema.partial();

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Build a Prisma createdAt range from optional from/to date strings. */
function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | null {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      // Treat an end date (yyyy-mm-dd) as inclusive of that whole day.
      d.setHours(23, 59, 59, 999);
      range.lte = d;
    }
  }
  return range.gte || range.lte ? range : null;
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req) => {
    (req as unknown as { admin: { username: string } }).admin = await requireAdmin(req);
  });

  // Audit trail: record every mutating admin request after it completes.
  app.addHook("onResponse", async (req, rep) => {
    if (!["POST", "PUT", "DELETE"].includes(req.method)) return;
    const admin = (req as unknown as { admin?: { username: string } }).admin?.username ?? "";
    await auditService.logAdminAction({
      admin,
      method: req.method,
      path: req.url.split("?")[0],
      status: rep.statusCode,
      body: req.body,
      ip: req.ip
    });
  });

  app.get("/admin/packages", async () => {
    return { packages: await packageService.listAllPackages() };
  });

  app.post("/admin/packages", async (req) => {
    const body = parse(packageSchema, req.body);
    return { package: await packageService.createPackage(body) };
  });

  app.put("/admin/packages/:id", async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parse(packageUpdateSchema, req.body);
    return { package: await packageService.updatePackage(id, body as Record<string, unknown>) };
  });

  app.delete("/admin/packages/:id", async (req) => {
    const id = parseId((req.params as { id: string }).id);
    await packageService.deletePackage(id);
    return { ok: true };
  });

  app.post("/admin/cards/generate", async (req) => {
    const body = parse(generateSchema, req.body);
    const cards = await cardService.createCards(body.packageId, body.count, {
      batchNo: body.batchNo,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
    });
    return { count: cards.length, batchNo: cards[0]?.batchNo, cards };
  });

  app.get("/admin/cards", async (req) => {
    const q = req.query as { status?: string; batchNo?: string; packageId?: string };
    return {
      cards: await cardService.listCards({
        status: q.status,
        batchNo: q.batchNo,
        packageId: q.packageId ? Number(q.packageId) : undefined
      })
    };
  });

  app.get("/admin/cards/batches", async () => {
    return { batches: await cardService.listBatches() };
  });

  app.post("/admin/cards/:id/status", async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parse(cardStatusSchema, req.body);
    return { card: await cardService.setCardStatus(id, body.status) };
  });

  app.post("/admin/cards/batches/:batchNo/status", async (req) => {
    const batchNo = decodeURIComponent((req.params as { batchNo: string }).batchNo);
    const body = parse(batchStatusSchema, req.body);
    const changed = await cardService.setBatchStatus(batchNo, body.status);
    return { changed };
  });

  app.get("/admin/templates", async () => {
    const templates = await panelClient.quickInstallList().catch(() => []);
    return { templates };
  });

  app.get("/admin/nodes", async () => {
    return { nodes: await listNodesOverview() };
  });

  app.put("/admin/nodes/config/:daemonId", async (req) => {
    const daemonId = (req.params as { daemonId: string }).daemonId;
    const body = parse(nodeConfigSchema, req.body);
    return { config: await upsertNodeConfig(daemonId, body) };
  });

  app.get("/admin/overview", async () => {
    return { overview: await getOverview() };
  });

  // Bootstrap config for the admin console (e.g. the panel URL for a direct link).
  app.get("/admin/config", async () => {
    return { panelUrl: config.mcsmUiOrigin };
  });

  app.get("/admin/orders", async (req) => {
    const q = req.query as { q?: string; status?: string; from?: string; to?: string };
    const where: Prisma.OrderWhereInput = {};
    const keyword = (q.q || "").trim();
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { orderNo: { contains: keyword } }
      ];
    }
    if (q.status) where.status = q.status;
    const range = dateRange(q.from, q.to);
    if (range) where.createdAt = range;
    const orders = await prisma.order.findMany({
      where,
      orderBy: { id: "desc" },
      take: 500,
      include: { package: { select: { id: true, name: true } } }
    });
    return { orders };
  });

  app.get("/admin/instances", async (req) => {
    const q = req.query as { q?: string; status?: string };
    const where: Prisma.ProvisionedInstanceWhereInput = {};
    const keyword = (q.q || "").trim();
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { instanceUuid: { contains: keyword } },
        { daemonId: { contains: keyword } }
      ];
    }
    if (q.status) where.status = q.status;
    const instances = await prisma.provisionedInstance.findMany({
      where,
      orderBy: { id: "desc" },
      take: 500,
      include: { package: { select: { id: true, name: true } } }
    });
    return { instances };
  });

  app.get("/admin/announcements", async () => {
    return { announcements: await announcementService.listAll() };
  });

  app.post("/admin/announcements", async (req) => {
    const body = parse(announcementSchema, req.body);
    return {
      announcement: await announcementService.create({
        title: body.title,
        content: body.content,
        level: body.level,
        active: body.active,
        startAt: toDate(body.startAt),
        endAt: toDate(body.endAt)
      })
    };
  });

  app.put("/admin/announcements/:id", async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parse(announcementUpdateSchema, req.body);
    return {
      announcement: await announcementService.update(id, {
        title: body.title,
        content: body.content,
        level: body.level,
        active: body.active,
        startAt: toDate(body.startAt),
        endAt: toDate(body.endAt)
      })
    };
  });

  app.delete("/admin/announcements/:id", async (req) => {
    const id = parseId((req.params as { id: string }).id);
    await announcementService.remove(id);
    return { ok: true };
  });

  app.get("/admin/webhooks", async (req) => {
    const q = req.query as { provider?: string; sig?: string; processed?: string };
    const where: Prisma.WebhookEventWhereInput = {};
    if (q.provider) where.provider = q.provider;
    if (q.sig === "ok") where.signatureOk = true;
    else if (q.sig === "bad") where.signatureOk = false;
    if (q.processed === "yes") where.processed = true;
    else if (q.processed === "no") where.processed = false;
    const events = await prisma.webhookEvent.findMany({
      where,
      orderBy: { id: "desc" },
      take: 200
    });
    return { events };
  });

  app.get("/admin/audit", async (req) => {
    const q = req.query as { admin?: string; q?: string; from?: string; to?: string };
    return { logs: await auditService.listAudit(q) };
  });
}
