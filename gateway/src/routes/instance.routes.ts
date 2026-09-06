import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../security/guards";
import { actionRateLimit } from "../security/rateLimit";
import * as instanceService from "../services/instanceService";
import { listSelectableNodes } from "../services/nodeService";
import { parse } from "./validate";

const ssoSchema = z.object({ instanceId: z.string().min(1) });
const actionSchema = z.object({
  instanceId: z.string().min(1),
  action: z.enum(["open", "stop", "restart"])
});

export async function instanceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/instances", async (req) => {
    const user = await requireUser(req);
    return { instances: await instanceService.listForUser(user.username) };
  });

  // Online nodes the buyer can place a new server on (open-server picker).
  app.get("/nodes", async (req) => {
    await requireUser(req);
    return { nodes: await listSelectableNodes() };
  });

  app.post("/instances/sso", async (req) => {
    const user = await requireUser(req);
    const body = parse(ssoSchema, req.body);
    return instanceService.ssoLink(user.username, body.instanceId);
  });

  app.post("/instances/action", { preHandler: actionRateLimit }, async (req) => {
    const user = await requireUser(req);
    const body = parse(actionSchema, req.body);
    await instanceService.controlInstance(user.username, body.instanceId, body.action);
    return { ok: true };
  });
}
