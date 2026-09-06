import { prisma } from "../db/prisma";
import { panelClient } from "../panel/client";
import { logger } from "../logger";

/**
 * Periodically sync provisioned instances with the panel: refresh expiry/status
 * and mark expired ones. The panel already stops expired servers; the gateway
 * only reflects state here (auto deletion of expired servers is a future task).
 */
export async function reconcileOnce(): Promise<void> {
  const records = await prisma.provisionedInstance.findMany({
    where: { status: { in: ["active", "provisioning"] } }
  });
  const usernames = Array.from(new Set(records.map((r) => r.username)));

  for (const username of usernames) {
    let live: Awaited<ReturnType<typeof panelClient.queryInstances>> = [];
    try {
      live = await panelClient.queryInstances(username);
    } catch (err) {
      logger.warn(`Reconcile: query failed for ${username}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    const byUuid = new Map(live.map((i) => [i.instance_id, i]));

    for (const rec of records.filter((r) => r.username === username)) {
      const info = byUuid.get(rec.instanceUuid);
      const expireMs = info?.expire || (rec.expireAt ? rec.expireAt.getTime() : 0);
      const expired = expireMs > 0 && expireMs < Date.now();
      await prisma.provisionedInstance.update({
        where: { id: rec.id },
        data: {
          status: expired ? "expired" : "active",
          expireAt: expireMs ? new Date(expireMs) : rec.expireAt,
          raw: info ? JSON.stringify(info) : rec.raw
        }
      });
    }
  }
  logger.info(`Reconcile completed for ${records.length} provisioned instances`);
}

export function startReconcile(intervalMinutes: number): NodeJS.Timeout {
  const run = () => {
    reconcileOnce().catch((err) => logger.error(`Reconcile error: ${err instanceof Error ? err.message : err}`));
  };
  return setInterval(run, intervalMinutes * 60 * 1000);
}
