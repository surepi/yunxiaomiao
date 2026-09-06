import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../security/guards";
import * as packageService from "../services/packageService";
import * as cardService from "../services/cardService";
import { listNodesOverview } from "../services/nodeService";
import { getOverview } from "../services/statsService";
import { prisma } from "../db/prisma";
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
  sort: z.number().int().optional().default(0)
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

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req) => {
    (req as unknown as { admin: { username: string } }).admin = await requireAdmin(req);
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

  app.post("/admin/cards/:id/status", async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parse(cardStatusSchema, req.body);
    return { card: await cardService.setCardStatus(id, body.status) };
  });

  app.get("/admin/templates", async () => {
    const templates = await panelClient.quickInstallList().catch(() => []);
    return { templates };
  });

  app.get("/admin/nodes", async () => {
    return { nodes: await listNodesOverview() };
  });

  app.get("/admin/overview", async () => {
    return { overview: await getOverview() };
  });

  // Bootstrap config for the admin console (e.g. the panel URL for a direct link).
  app.get("/admin/config", async () => {
    return { panelUrl: config.mcsmUiOrigin };
  });

  app.get("/admin/orders", async () => {
    const orders = await prisma.order.findMany({
      orderBy: { id: "desc" },
      take: 200,
      include: { package: { select: { id: true, name: true } } }
    });
    return { orders };
  });

  app.get("/admin/instances", async () => {
    const instances = await prisma.provisionedInstance.findMany({
      orderBy: { id: "desc" },
      take: 500,
      include: { package: { select: { id: true, name: true } } }
    });
    return { instances };
  });
}
