import { prisma } from "../db/prisma";
import { panelClient, InstanceInfo, PanelNode } from "../panel/client";
import { forbidden, notFound } from "../errors";

export interface MyInstance extends InstanceInfo {
  daemonId: string;
  expireAt: string | null;
  managed: boolean;
  // Public host players use to connect (derived from the node address).
  nodeHost: string;
}

function hostOf(node: PanelNode | undefined): string {
  if (!node?.ip) return "";
  // Node "ip" may be stored as "wss://node1.example.com" or a bare host.
  return node.ip.replace(/^wss?:\/\//i, "").replace(/\/.*$/, "").trim();
}

/**
 * Return the buyer's instances. Live data comes from the panel; gateway-side
 * provisioning records supply the daemonId/managed status and the node public
 * host needed to build player connection addresses.
 */
export async function listForUser(username: string): Promise<MyInstance[]> {
  const [live, records, nodes] = await Promise.all([
    panelClient.queryInstances(username).catch(() => [] as InstanceInfo[]),
    prisma.provisionedInstance.findMany({ where: { username } }),
    panelClient.listNodes().catch(() => [] as PanelNode[])
  ]);

  const recByUuid = new Map(records.map((r) => [r.instanceUuid, r]));
  const hostByDaemon = new Map(nodes.map((n) => [n.uuid, hostOf(n)]));

  const merged: MyInstance[] = live.map((info) => {
    const rec = recByUuid.get(info.instance_id);
    const daemonId = rec?.daemonId ?? "";
    return {
      ...info,
      daemonId,
      expireAt: rec?.expireAt
        ? rec.expireAt.toISOString()
        : info.expire
        ? new Date(info.expire).toISOString()
        : null,
      managed: Boolean(rec),
      nodeHost: hostByDaemon.get(daemonId) ?? ""
    };
  });

  const liveIds = new Set(live.map((i) => i.instance_id));
  for (const rec of records) {
    if (liveIds.has(rec.instanceUuid)) continue;
    merged.push({
      instance_id: rec.instanceUuid,
      name: "",
      status: 0,
      expire: rec.expireAt ? rec.expireAt.getTime() : 0,
      ports: [],
      lines: [],
      daemonId: rec.daemonId,
      expireAt: rec.expireAt ? rec.expireAt.toISOString() : null,
      managed: true,
      nodeHost: hostByDaemon.get(rec.daemonId) ?? ""
    });
  }

  return merged;
}

/** Produce a one-click SSO login link for an instance owned by the buyer. */
export async function ssoLink(
  username: string,
  instanceId: string
): Promise<{ url: string }> {
  const rec = await prisma.provisionedInstance.findUnique({
    where: { instanceUuid: instanceId }
  });
  if (!rec || rec.username !== username) {
    throw notFound("Instance not found for this account", "INSTANCE_NOT_FOUND");
  }
  const token = await panelClient.ssoToken(username);
  const url = panelClient.buildSsoUrl({
    username,
    token,
    instanceId,
    daemonId: rec.daemonId
  });
  return { url };
}

export type InstanceControlAction = "open" | "stop" | "restart";

/** Start / stop / restart an instance owned by the buyer. Expired servers cannot be started. */
export async function controlInstance(
  username: string,
  instanceId: string,
  action: InstanceControlAction
): Promise<{ ok: true }> {
  const rec = await prisma.provisionedInstance.findUnique({
    where: { instanceUuid: instanceId }
  });
  if (!rec || rec.username !== username) {
    throw notFound("Instance not found for this account", "INSTANCE_NOT_FOUND");
  }
  if (action !== "stop" && rec.expireAt && rec.expireAt.getTime() < Date.now()) {
    throw forbidden("Instance has expired, please renew first", "INSTANCE_EXPIRED");
  }
  await panelClient.instanceAction(action, instanceId, rec.daemonId);
  return { ok: true };
}
