import { panelClient, NodeStatus } from "../panel/client";
import { badRequest, upstream } from "../errors";

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
    if (!status.available) throw upstream(`Configured node is unavailable: ${fixedNodeId}`, "NODE_DOWN");
    return {
      daemonId: status.id,
      remarks: status.name,
      running: status.running,
      instances: status.instances
    };
  }

  // Auto strategy: a buyer may explicitly pick a node in the portal.
  if (preferredNodeId) {
    const status = await panelClient.pingNode(preferredNodeId).catch(() => null);
    if (!status || !status.available) {
      throw badRequest("The selected node is unavailable, choose another or use auto", "NODE_DOWN");
    }
    return {
      daemonId: status.id,
      remarks: status.name,
      running: status.running,
      instances: status.instances
    };
  }

  const nodes = await panelClient.listNodes();
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
  const healthy = statuses.filter((s) => s.available);
  if (healthy.length === 0) {
    throw badRequest("No reachable daemon node can accept new instances", "NODE_DOWN");
  }

  // Prefer fewer running instances, then fewer total instances.
  healthy.sort((a, b) => a.running - b.running || a.instances - b.instances);
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
}

/** Admin overview: every configured node plus live capacity (ping). */
export async function listNodesOverview(): Promise<NodeOverview[]> {
  const nodes = await panelClient.listNodes();
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
      ping
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
  const nodes = await panelClient.listNodes();
  const out: SelectableNode[] = [];
  for (const n of nodes.filter((x) => x.available)) {
    try {
      const s = await panelClient.pingNode(n.uuid);
      if (s.available) {
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
  out.sort((a, b) => a.running - b.running || a.instances - b.instances);
  return out;
}
