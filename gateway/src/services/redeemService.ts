import { prisma } from "../db/prisma";
import { panelClient } from "../panel/client";
import { badRequest, conflict, notFound } from "../errors";
import { logger } from "../logger";
import { selectNode } from "./nodeService";
import { buildPayload } from "./payloadBuilder";
import { getEmail } from "./authService";
import { mailProvisioned, mailRenewed } from "../notify/emails";
import type { InstanceInfo, PanelNode } from "../panel/client";

function hostOfNode(nodes: PanelNode[], daemonId: string): string {
  const node = nodes.find((x) => x.uuid === daemonId);
  if (!node?.ip) return "";
  return node.ip.replace(/^wss?:\/\//i, "").replace(/\/.*$/, "").trim();
}

/** Best-effort confirmation email after a server is provisioned. Never throws. */
async function notifyProvisioned(
  username: string,
  result: { instance_id: string; expire: number; instance_info?: unknown },
  node: { daemonId: string; remarks: string }
): Promise<void> {
  try {
    const email = await getEmail(username);
    if (!email) return;
    const info = result.instance_info as InstanceInfo | undefined;
    const instanceName = info?.name || result.instance_id.slice(0, 8);
    let addresses: string[] = [];
    if (info?.ports?.length) {
      const nodes = await panelClient.listNodes().catch(() => [] as PanelNode[]);
      const host = hostOfNode(nodes, node.daemonId);
      addresses = info.ports.map((pt) => (host ? `${host}:${pt.host}` : `${pt.host}`));
    }
    await mailProvisioned({
      username,
      email,
      instanceName,
      nodeName: node.remarks || undefined,
      expireAt: result.expire ? new Date(result.expire).toLocaleString() : undefined,
      addresses
    });
  } catch (err) {
    logger.warn(`notifyProvisioned skipped: ${err instanceof Error ? err.message : err}`);
  }
}

/** Best-effort confirmation email after a renewal. Never throws. */
async function notifyRenewed(
  username: string,
  instance: { instanceUuid: string; raw: string },
  expire: number
): Promise<void> {
  try {
    const email = await getEmail(username);
    if (!email) return;
    let instanceName = instance.instanceUuid.slice(0, 8);
    try {
      const raw = JSON.parse(instance.raw || "{}") as InstanceInfo;
      if (raw?.name) instanceName = raw.name;
    } catch {
      /* ignore malformed raw */
    }
    await mailRenewed({
      username,
      email,
      instanceName,
      expireAt: expire ? new Date(expire).toLocaleString() : undefined
    });
  } catch (err) {
    logger.warn(`notifyRenewed skipped: ${err instanceof Error ? err.message : err}`);
  }
}

export interface RedeemResult {
  instanceId: string;
  daemonId: string;
  nodeRemarks: string;
  expire: number;
  instanceInfo: unknown;
}

/**
 * Redeem a card code to provision a new game server for the given buyer.
 * The card is atomically reserved first (unique code + status transition) so
 * concurrent/duplicate submissions can never provision twice. On a failed
 * attempt where nothing was actually created, the card is released for retry.
 */
export async function redeem(username: string, code: string, preferredNodeId?: string): Promise<RedeemResult> {
  const card = await prisma.redeemCard.findUnique({
    where: { code },
    include: { package: true }
  });
  if (!card) throw notFound("Invalid redeem code", "CARD_INVALID");
  if (card.status === "disabled") throw badRequest("This redeem code has been disabled", "CARD_DISABLED");
  if (card.status === "used") throw conflict("This redeem code has already been used", "CARD_USED");
  if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
    throw badRequest("This redeem code has expired", "CARD_EXPIRED");
  }
  const pkg = card.package;
  if (!pkg.active) throw badRequest("This package is no longer on sale", "PACKAGE_OFFLINE");

  // Atomic reserve: only succeeds while the card is still "unused".
  const reserve = await prisma.redeemCard.updateMany({
    where: { id: card.id, status: "unused" },
    data: { status: "used", usedBy: username, usedAt: new Date() }
  });
  if (reserve.count === 0) throw conflict("This redeem code has already been used", "CARD_USED");

  const order = await prisma.order.create({
    data: {
      orderNo: `CARD-${card.id}-${Date.now()}`,
      username,
      packageId: pkg.id,
      source: "card",
      amountFen: pkg.priceFen,
      status: "provisioning"
    }
  });
  await prisma.redeemCard.update({ where: { id: card.id }, data: { orderId: order.id } });

  let instanceCreated = false;
  try {
    const node = await selectNode(pkg.nodeStrategy, pkg.fixedNodeId, preferredNodeId);
    const payload = buildPayload(pkg.setupInfo, pkg.resourceLimits);

    const result = await panelClient.buy({
      category_id: pkg.mcsmCategoryId,
      node_id: node.daemonId,
      username,
      hours: pkg.hours,
      payload
    });
    if (!result?.instance_id) throw new Error("Panel did not return an instance id");

    // The panel has created the server, so the card is now permanently consumed.
    // Persist our record best-effort (upsert keyed by instanceUuid): a DB hiccup
    // here must never release the card and trigger a duplicate provisioning.
    instanceCreated = true;
    try {
      await prisma.provisionedInstance.upsert({
        where: { instanceUuid: result.instance_id },
        create: {
          username,
          instanceUuid: result.instance_id,
          daemonId: node.daemonId,
          categoryId: pkg.mcsmCategoryId,
          packageId: pkg.id,
          orderId: order.id,
          status: "active",
          expireAt: result.expire ? new Date(result.expire) : null,
          raw: JSON.stringify(result.instance_info ?? {})
        },
        update: {
          status: "active",
          expireAt: result.expire ? new Date(result.expire) : null,
          raw: JSON.stringify(result.instance_info ?? {})
        }
      });
      await prisma.order.update({ where: { id: order.id }, data: { status: "done" } });
    } catch (persistErr) {
      logger.error(
        `Provisioned ${result.instance_id} on ${node.daemonId} but failed to persist gateway record: ` +
          (persistErr instanceof Error ? persistErr.message : persistErr)
      );
    }

    logger.info(`Provisioned instance ${result.instance_id} on ${node.daemonId} for ${username} (order ${order.orderNo})`);
    void notifyProvisioned(username, result, node).catch(() => undefined);
    return {
      instanceId: result.instance_id,
      daemonId: node.daemonId,
      nodeRemarks: node.remarks,
      expire: result.expire,
      instanceInfo: result.instance_info
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.order
      .update({ where: { id: order.id }, data: { status: "failed", message } })
      .catch(() => undefined);
    // Only release the card if the panel did NOT create a server, so retries are safe.
    if (!instanceCreated) {
      await prisma.redeemCard.update({
        where: { id: card.id },
        data: { status: "unused", usedBy: "", usedAt: null, orderId: null }
      });
    }
    logger.error(`Redeem failed for order ${order.orderNo}: ${message}`);
    throw err;
  }
}

export interface RenewResult {
  instanceId: string;
  expire: number;
}

/** Redeem a card to extend the validity of an existing instance. */
export async function renew(
  username: string,
  code: string,
  instanceId: string
): Promise<RenewResult> {
  const instance = await prisma.provisionedInstance.findUnique({
    where: { instanceUuid: instanceId },
    include: { package: true }
  });
  if (!instance || instance.username !== username) {
    throw notFound("Instance not found for this account", "INSTANCE_NOT_FOUND");
  }
  // Archived instances were deleted from the panel after the grace period; they
  // cannot be renewed and must be re-provisioned with a new card.
  if (instance.status === "archived") {
    throw badRequest("This server has been retired after expiry and cannot be renewed; please open a new server", "INSTANCE_ARCHIVED");
  }

  const card = await prisma.redeemCard.findUnique({
    where: { code },
    include: { package: true }
  });
  if (!card) throw notFound("Invalid redeem code", "CARD_INVALID");
  if (card.status !== "unused") throw conflict("This redeem code has already been used", "CARD_USED");
  if (card.expiresAt && card.expiresAt.getTime() < Date.now()) {
    throw badRequest("This redeem code has expired", "CARD_EXPIRED");
  }
  const pkg = card.package;
  // A renew card must match the package the server was provisioned with, so a
  // cheaper card cannot extend a more expensive server sharing the same MCSM category.
  if (instance.packageId && pkg.id !== instance.packageId) {
    throw badRequest("This redeem code belongs to a different package", "CARD_PACKAGE_MISMATCH");
  }

  const reserve = await prisma.redeemCard.updateMany({
    where: { id: card.id, status: "unused" },
    data: { status: "used", usedBy: username, usedAt: new Date() }
  });
  if (reserve.count === 0) throw conflict("This redeem code has already been used", "CARD_USED");

  const order = await prisma.order.create({
    data: {
      orderNo: `RENEW-${card.id}-${Date.now()}`,
      username,
      packageId: pkg.id,
      source: "card",
      amountFen: pkg.priceFen,
      status: "provisioning"
    }
  });
  await prisma.redeemCard.update({ where: { id: card.id }, data: { orderId: order.id } });

  let renewedOnPanel = false;
  try {
    const result = await panelClient.renew({
      category_id: pkg.mcsmCategoryId,
      node_id: instance.daemonId,
      instance_id: instanceId,
      hours: pkg.hours
    });
    renewedOnPanel = true;
    const expire = Number(result.expire) || 0;
    try {
      await prisma.provisionedInstance.update({
        where: { instanceUuid: instanceId },
        data: {
          status: "active",
          expireAt: expire ? new Date(expire) : instance.expireAt,
          // Validity extended: re-arm the 3-day / 1-day expiry reminders.
          remindFlags: ""
        }
      });
      await prisma.order.update({ where: { id: order.id }, data: { status: "done" } });
    } catch (persistErr) {
      logger.error(
        `Renewed instance ${instanceId} on panel but failed to persist gateway record: ` +
          (persistErr instanceof Error ? persistErr.message : persistErr)
      );
    }
    logger.info(`Renewed instance ${instanceId} for ${username} until ${expire} (order ${order.orderNo})`);
    void notifyRenewed(username, instance, expire).catch(() => undefined);
    return { instanceId, expire };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.order
      .update({ where: { id: order.id }, data: { status: "failed", message } })
      .catch(() => undefined);
    // Only release the card if the panel did not apply the renewal.
    if (!renewedOnPanel) {
      await prisma.redeemCard.update({
        where: { id: card.id },
        data: { status: "unused", usedBy: "", usedAt: null, orderId: null }
      });
    }
    logger.error(`Renew failed for order ${order.orderNo}: ${message}`);
    throw err;
  }
}
