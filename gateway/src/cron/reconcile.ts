import fs from "fs";
import path from "path";
import { prisma } from "../db/prisma";
import { panelClient } from "../panel/client";
import { logger } from "../logger";
import { config } from "../config";
import { getEmail } from "../services/authService";
import { mailExpiryReminder, mailExpiredGrace, mailInstanceArchived } from "../notify/emails";
import type { ProvisionedInstance } from "@prisma/client";

const DAY_MS = 86_400_000;

/** Read the cached instance name out of the raw JSON snapshot. */
function nameOf(rec: ProvisionedInstance): string {
  try {
    const raw = JSON.parse(rec.raw || "{}") as { name?: string };
    if (raw?.name) return raw.name;
  } catch {
    /* ignore malformed raw */
  }
  return rec.instanceUuid.slice(0, 8);
}

/**
 * Write a metadata snapshot before destroying an instance. Game files are kept
 * on the daemon unless DELETE_INSTANCE_FILES=true; this snapshot at least
 * preserves the provisioning/order/port details for support and recovery.
 * Returns the file path written. Throws on failure so the caller aborts delete.
 */
function writeArchiveBackup(rec: ProvisionedInstance): string {
  const dir = path.resolve(config.backupDir);
  fs.mkdirSync(dir, { recursive: true });
  let info: unknown = {};
  try {
    info = JSON.parse(rec.raw || "{}");
  } catch {
    /* keep empty info */
  }
  const snapshot = {
    archivedAt: new Date().toISOString(),
    username: rec.username,
    instanceUuid: rec.instanceUuid,
    daemonId: rec.daemonId,
    categoryId: rec.categoryId,
    packageId: rec.packageId,
    orderId: rec.orderId,
    expireAt: rec.expireAt ? rec.expireAt.toISOString() : null,
    instance: info
  };
  const file = path.join(dir, `archive-${rec.instanceUuid.slice(0, 8)}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  return file;
}

/**
 * Periodically sync provisioned instances with the panel: refresh expiry/status,
 * mark expired ones and send pre-expiry reminders (3 days, then 1 day).
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

      // Expiry reminders: fire once per threshold (3 days, then 1 day).
      let remindFlags = rec.remindFlags;
      if (!expired && expireMs > 0) {
        const daysLeft = Math.ceil((expireMs - Date.now()) / DAY_MS);
        const sent = new Set(remindFlags.split(",").filter(Boolean));
        let threshold = 0;
        if (daysLeft <= 1 && !sent.has("1")) threshold = 1;
        else if (daysLeft <= 3 && !sent.has("3")) threshold = 3;
        if (threshold > 0) {
          const email = await getEmail(username).catch(() => "");
          if (email) {
            await mailExpiryReminder(
              {
                username,
                email,
                instanceName: info?.name || rec.instanceUuid.slice(0, 8),
                expireAt: new Date(expireMs).toLocaleString()
              },
              threshold
            );
            sent.add(String(threshold));
            remindFlags = Array.from(sent).join(",");
          }
        }
      }

      await prisma.provisionedInstance.update({
        where: { id: rec.id },
        data: {
          status: expired ? "expired" : "active",
          expireAt: expireMs ? new Date(expireMs) : rec.expireAt,
          raw: info ? JSON.stringify(info) : rec.raw,
          remindFlags
        }
      });
    }
  }

  await cleanupExpired();
  logger.info(`Reconcile completed for ${records.length} active/provisioning instances`);
}

/**
 * Post-expiry lifecycle. Expired servers get a one-time grace-period warning;
 * once GRACE_PERIOD_DAYS elapses they are (optionally) backed up and deleted.
 * Auto-deletion is opt-in via AUTO_DELETE_EXPIRED; when off we only warn.
 */
async function cleanupExpired(): Promise<void> {
  const expired = await prisma.provisionedInstance.findMany({
    where: { status: "expired", archivedAt: null }
  });
  if (expired.length === 0) return;

  for (const rec of expired) {
    const expireMs = rec.expireAt ? rec.expireAt.getTime() : 0;
    if (!expireMs) continue; // no known expiry: cannot compute grace, leave as-is
    const deadline = expireMs + config.gracePeriodDays * DAY_MS;
    const flags = new Set(rec.remindFlags.split(",").filter(Boolean));
    const email = await getEmail(rec.username).catch(() => "");

    // First time we see it expired: warn that data is retained for the grace period.
    if (!flags.has("grace")) {
      if (email) {
        await mailExpiredGrace(
          {
            username: rec.username,
            email,
            instanceName: nameOf(rec),
            expireAt: rec.expireAt ? rec.expireAt.toLocaleString() : undefined
          },
          config.gracePeriodDays
        );
      }
      flags.add("grace");
      await prisma.provisionedInstance.update({
        where: { id: rec.id },
        data: { remindFlags: Array.from(flags).join(",") }
      });
    }

    if (Date.now() < deadline) continue;

    if (!config.autoDeleteExpired) {
      logger.info(
        `Instance ${rec.instanceUuid} is past its ${config.gracePeriodDays}-day grace period; ` +
          `AUTO_DELETE_EXPIRED is off, leaving it in place.`
      );
      continue;
    }

    // Back up metadata first; if that fails, skip deletion and retry next run.
    let backupFile = "";
    try {
      backupFile = writeArchiveBackup(rec);
    } catch (err) {
      logger.warn(
        `Backup failed for ${rec.instanceUuid}, skipping delete this run: ` +
          (err instanceof Error ? err.message : err)
      );
      continue;
    }

    try {
      await panelClient.deleteInstance(rec.instanceUuid, rec.daemonId, config.deleteInstanceFiles);
    } catch (err) {
      logger.warn(
        `Panel delete failed for ${rec.instanceUuid}, will retry next run: ` +
          (err instanceof Error ? err.message : err)
      );
      continue;
    }

    flags.add("archived");
    await prisma.provisionedInstance.update({
      where: { id: rec.id },
      data: { status: "archived", archivedAt: new Date(), remindFlags: Array.from(flags).join(",") }
    });
    logger.info(
      `Archived expired instance ${rec.instanceUuid} (user ${rec.username}) after ${config.gracePeriodDays}d grace; backup: ${backupFile}`
    );
    if (email) {
      await mailInstanceArchived({
        username: rec.username,
        email,
        instanceName: nameOf(rec),
        expireAt: rec.expireAt ? rec.expireAt.toLocaleString() : undefined
      });
    }
  }
}

export function startReconcile(intervalMinutes: number): NodeJS.Timeout {
  const run = () => {
    reconcileOnce().catch((err) => logger.error(`Reconcile error: ${err instanceof Error ? err.message : err}`));
  };
  return setInterval(run, intervalMinutes * 60 * 1000);
}
