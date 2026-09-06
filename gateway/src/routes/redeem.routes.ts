import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUser } from "../security/guards";
import * as redeemService from "../services/redeemService";
import { parse } from "./validate";
import { actionRateLimit } from "../security/rateLimit";

const redeemSchema = z.object({
  code: z.string().min(4).max(64),
  nodeId: z.string().min(1).max(64).optional()
});
const renewSchema = z.object({
  code: z.string().min(4).max(64),
  instanceId: z.string().min(1)
});

export async function redeemRoutes(app: FastifyInstance): Promise<void> {
  app.post("/redeem", { preHandler: actionRateLimit }, async (req) => {
    const user = await requireUser(req);
    const body = parse(redeemSchema, req.body);
    return redeemService.redeem(user.username, body.code.trim().toUpperCase(), body.nodeId);
  });

  app.post("/renew", { preHandler: actionRateLimit }, async (req) => {
    const user = await requireUser(req);
    const body = parse(renewSchema, req.body);
    return redeemService.renew(user.username, body.code.trim().toUpperCase(), body.instanceId);
  });
}
