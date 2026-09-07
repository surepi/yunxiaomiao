import { panelClient, NodeStatus } from "../panel/client";
import { prisma } from "../db/prisma";
import { badRequest, upstream } from "../errors";

export interface NodeConfig {
  daemonId: string;
  weight: number;
  maxInstances: number;
  enabled: boolean;
  note: string;
}

const DEFAULT_CONFIG: Omit<NodeConfig, "daemonId"> = { weight: 1, maxInstances: 0, enabled: true, note: "" };

/** Gateway-side scheduling overrides for every node, keyed by daemon uuid. */
export async function getNodeConfigMap(): Promise<Map<string, NodeConfig>> {
  const rows = await prisma.nodeConfig.findMany();
  return new Map(rows.map((r) => [r.daemonId, { daemonId: r.daemonId, weight: r.weight, maxInstances: r.maxInstances, enabled: r.enabled, note: r.note }]));
}

/** Upsert one node's scheduling override. */
export async function upsertNodeConfig(
  daemonId: string,
  data: { weight?: number; maxInstances?: number; enabled?: boolean; note?: string }
): Promise<NodeConfig> {
  const row = await prisma.nodeConfig.upsert({
    where: { daemonId },
    update: data,
    create: { daemonId, ...DEFAULT_CONFIG, ...data }
  });
  return { daemonId: row.daemonId, weight: row.weight, maxInstances: row.maxInstances, enabled: row.enabled, note: row.note };
}

/**
 * Whether a node (with live ping status) may take a new instance according to
 * the gateway-side overrides: enabled flag on and below the instance cap.
 */
function acceptsLoad(cfg: NodeConfig | undefined, status: NodeStatus): boolean {
  if (cfg && !cfg.enabled) return false;
  const cap = cfg?.maxInstances ?? 0;
  if (cap > 0 && status.instances >= cap) return false;
  return true;
}

/** Lower = preferred. Weight is a relative capacity multiplier. */
function loadScore(cfg: NodeConfig | undefined, status: NodeStatus): number {
  const weight = Math.max(1, cfg?.weight ?? 1);
  return (status.running * 10 + status.instances) / weight;
}

export interface SelectedNode {
  daemonId: string;
  remarks: string;
  running: number;
  instances: number;
}

/**
 * Choose which daemon should host a new instance.
 * - fixed strategy: use the package's pinned daemonId if it is online.
 * - auto strategy: ping every available daemon and pick the least loaded one.
 */
export async function selectNode(
  strategy: string,
  fixedNodeId: string,
  preferredNodeId?: string
): Promise<SelectedNode> {
  if (strategy !== "auto" && fixedNodeId) {
    const status = await panelClient.pingNode(fixedNodeId);
    const configs = await getNodeConfigMap();
    if (!status.available) throw upstream(`Configured node is unavailable: ${fixedNodeId}`, "NODE_DOWN");
    if (!acceptsLoad(configs.get(fixedNodeId), status)) {
      throw upstream(`Configured node is disabled or full: ${fixedNodeId}`, "NODE_DOWN");
    }
    return {
      daemonId: status.id,
      remarks: status.name,
      running: status.running,
      instances: status.instances
    };
  }

  // Auto strategy: a buyer may explicitly pick a node in the portal.
  if (preferredNodeId) {
    const [status, configs] = await Promise.all([
      panelClient.pingNode(preferredNodeId).catch(() => null),
      getNodeConfigMap()
    ]);
    if (!status || !status.available || !acceptsLoad(configs.get(preferredNodeId), status)) {
      throw badRequest("The selected node is unavailable, choose another or use auto", "NODE_DOWN");
    }
    return {
      daemonId: status.id,
      remarks: status.name,
      running: status.running,
      instances: status.instances
    };
  }

  const [nodes, configs] = await Promise.all([panelClient.listNodes(), getNodeConfigMap()]);
  const online = nodes.filter((n) => n.available);
  if (online.length === 0) {
    throw badRequest("No available daemon node is connected to the panel", "NO_NODE");
  }

  const statuses: NodeStatus[] = [];
  for (const node of online) {
    try {
      statuses.push(await panelClient.pingNode(node.uuid));
    } catch {
      // A node that fails to ping is skipped from auto scheduling.
    }
  }
  // Apply gateway-side overrides: disabled nodes and nodes at their instance
  // cap never receive new servers, then balance by weighted load.
  const healthy = statuses.filter((s) => s.available && acceptsLoad(configs.get(s.id), s));
  if (healthy.length === 0) {
    throw badRequest("No reachable daemon node can accept new instances", "NODE_DOWN");
  }

  healthy.sort((a, b) => loadScore(configs.get(a.id), a) - loadScore(configs.get(b.id), b));
  const best = healthy[0];
  return {
    daemonId: best.id,
    remarks: best.name,
    running: best.running,
    instances: best.instances
  };
}

export interface NodeOverview {
  uuid: string;
  ip: string;
  port: number;
  remarks?: string;
  available: boolean;
  ping: { name: string; running: number; instances: number; available: boolean } | null;
  config: NodeConfig;
}

/** Admin overview: every configured node plus live capacity (ping). */
export async function listNodesOverview(): Promise<NodeOverview[]> {
  const [nodes, configs] = await Promise.all([panelClient.listNodes(), getNodeConfigMap()]);
  const result: NodeOverview[] = [];
  for (const n of nodes) {
    let ping: NodeOverview["ping"] = null;
    try {
      const s = await panelClient.pingNode(n.uuid);
      ping = { name: s.name, running: s.running, instances: s.instances, available: s.available };
    } catch {
      ping = null;
    }
    result.push({
      uuid: n.uuid,
      ip: n.ip,
      port: n.port,
      remarks: n.remarks,
      available: n.available,
      ping,
      config: configs.get(n.uuid) ?? { daemonId: n.uuid, ...DEFAULT_CONFIG }
    });
  }
  return result;
}

export interface SelectableNode {
  id: string;
  name: string;
  running: number;
  instances: number;
}

/** Buyer-facing list of online nodes a new server can be placed on, least loaded first. */
export async function listSelectableNodes(): Promise<SelectableNode[]> {
  const [nodes, configs] = await Promise.all([panelClient.listNodes(), getNodeConfigMap()]);
  const out: SelectableNode[] = [];
  for (const n of nodes.filter((x) => x.available)) {
    try {
      const s = await panelClient.pingNode(n.uuid);
      if (s.available && acceptsLoad(configs.get(s.id), s)) {
        out.push({
          id: s.id,
          name: s.name || n.remarks || n.uuid.slice(0, 8),
          running: s.running,
          instances: s.instances
        });
      }
    } catch {
      // Unreachable nodes are hidden from the buyer picker.
    }
  }
  out.sort(
    (a, b) =>
      loadScore(configs.get(a.id), { running: a.running, instances: a.instances } as NodeStatus) -
      loadScore(configs.get(b.id), { running: b.running, instances: b.instances } as NodeStatus)
  );
  return out;
}
