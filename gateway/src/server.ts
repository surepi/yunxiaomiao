import { buildApp } from "./app";
import { config, assertRuntimeConfig } from "./config";
import { prisma } from "./db/prisma";
import { logger } from "./logger";
import { ensureAdmin } from "./services/authService";
import { startReconcile } from "./cron/reconcile";

async function main(): Promise<void> {
  assertRuntimeConfig();
  await prisma.$connect();
  logger.info("Database connected");

  await ensureAdmin(config.adminUsername, config.adminPassword);
  logger.info(`Admin account ready: ${config.adminUsername}`);

  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  logger.info(`Provisioning gateway listening on http://${config.host}:${config.port}`);
  logger.info(`Panel API target: ${config.panelBaseUrl}`);

  startReconcile(config.reconcileIntervalMinutes);
}

main().catch((err) => {
  logger.error(`Failed to start gateway: ${err instanceof Error ? err.stack ?? err.message : err}`);
  process.exit(1);
});
