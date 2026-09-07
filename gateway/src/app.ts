import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { config } from "./config";
import { AppError } from "./errors";
import { logger } from "./logger";
import { authRoutes } from "./routes/auth.routes";
import { packageRoutes } from "./routes/package.routes";
import { redeemRoutes } from "./routes/redeem.routes";
import { instanceRoutes } from "./routes/instance.routes";
import { adminRoutes } from "./routes/admin.routes";
import { webhookRoutes } from "./routes/webhook.routes";
import { announcementRoutes } from "./routes/announcement.routes";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

  await app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(","),
    credentials: true
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ code: err.code, message: err.message });
    }
    logger.error(`Unhandled error: ${err.message}`);
    return reply.status(500).send({ code: "INTERNAL", message: "Internal server error" });
  });

  app.get("/health", async () => ({ ok: true, time: Date.now() }));

  await app.register(authRoutes);
  await app.register(packageRoutes);
  await app.register(redeemRoutes);
  await app.register(instanceRoutes);
  await app.register(adminRoutes);
  await app.register(webhookRoutes);
  await app.register(announcementRoutes);

  return app;
}
