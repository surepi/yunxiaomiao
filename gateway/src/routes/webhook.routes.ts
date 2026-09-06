import { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config";
import { prisma } from "../db/prisma";
import { logger } from "../logger";
import { unauthorized } from "../errors";
import { webhookRateLimit } from "../security/rateLimit";

function sign(body: string): string {
  return createHmac("sha256", config.webhookSecret).update(body).digest("hex");
}

/**
 * Sales-channel (taobao/ERP) order webhook. v1 only verifies the HMAC signature
 * and records the event; automatic direct provisioning is intentionally deferred
 * until an order source (ERP/聚水潭 or Taobao TOP) is connected.
 */
export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Capture the raw body inside this encapsulated context for signature checks.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as unknown as { rawBody: string }).rawBody = String(body);
    try {
      done(null, body ? JSON.parse(String(body)) : {});
    } catch {
      done(null, {});
    }
  });

  app.post("/webhooks/taobao", { preHandler: webhookRateLimit }, async (req, reply) => {
    const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? "";
    const signature = String(req.headers["x-webhook-signature"] ?? "");
    const expected = sign(rawBody);

    let signatureOk = false;
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      signatureOk = a.length === b.length && timingSafeEqual(a, b);
    } catch {
      signatureOk = false;
    }

    const payload = (req.body as Record<string, unknown>) ?? {};
    const eventId = String(payload.eventId ?? payload.tid ?? payload.orderNo ?? "");

    // Reject forgeries before touching the database so a caller without the
    // secret cannot fill storage with junk events.
    if (!signatureOk) {
      logger.warn(`Rejected taobao webhook with bad signature (eventId=${eventId})`);
      throw unauthorized("Invalid webhook signature", "BAD_SIGNATURE");
    }

    await prisma.webhookEvent.create({
      data: {
        provider: "taobao",
        eventId,
        payload: rawBody || JSON.stringify(payload),
        signatureOk: true,
        processed: false,
        note: "accepted_pending_processing"
      }
    });

    logger.info(`Received taobao webhook eventId=${eventId} (stored, not yet provisioned)`);
    reply.code(202);
    return { received: true, processed: false };
  });
}
