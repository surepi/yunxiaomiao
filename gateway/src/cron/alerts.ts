import { prisma } from "../db/prisma";
import { logger } from "../logger";
import { listNodesOverview } from "../services/nodeService";
import { mailAdminAlert } from "../notify/emails";

interface NodeHealth {
  online: boolean;
  name: string;
}

// In-memory health state, mirroring the login guard: the gateway runs as a
// single process. A restart re-baselines silently (first check never alerts),
// which avoids false alarms after a reboot.
let bootstrapped = false;
const nodeState = new Map<string, NodeHealth>();
let panelOnline = true;
let panelFailStreak = 0;
let lastFailedOrderId = 0;

/** Send an ops alert: email when ALERT_EMAIL is configured, always log. */
async function alert(subject: string, lines: string[]): Promise<void> {
  logger.warn(`[ops-alert] ${subject} | ${lines.filter(Boolean).join(" / ")}`);
  try {
    await mailAdminAlert(subject, lines);
  } catch (err) {
    logger.warn(`[ops-alert] mail failed: ${err instanceof Error ? err.message : err}`);
  }
}

/** Detect node offline/recovery transitions vs the last check. */
async function checkNodes(): Promise<void> {
  let overview;
  try {
    overview = await listNodesOverview();
  } catch (err) {
    panelFailStreak++;
    // Require two consecutive failures so a reboot ordering race does not
    // page the operator; the next sweep re-checks and escalates if still down.
    if (panelOnline && panelFailStreak >= 2) {
      panelOnline = false;
      await alert("面板 API 不可达，无法巡检节点", [
        `错误：${err instanceof Error ? err.message : String(err)}`,
        "节点在线状态与自动开通可能受影响，请检查 MCSManager 面板。"
      ]);
    }
    return;
  }
  panelFailStreak = 0;
  if (!panelOnline) {
    panelOnline = true;
    await alert("面板 API 已恢复", ["面板接口重新可达，节点巡检恢复正常。"]);
  }

  // Managed (gateway-provisioned) instance count per daemon, so the alert says
  // how many buyer servers sit on the dead node.
  const instances = await prisma.provisionedInstance.findMany({
    where: { status: { not: "archived" } },
    select: { daemonId: true }
  });
  const managedByNode = new Map<string, number>();
  for (const i of instances) {
    managedByNode.set(i.daemonId, (managedByNode.get(i.daemonId) ?? 0) + 1);
  }

  const seen = new Set<string>();
  for (const n of overview) {
    seen.add(n.uuid);
    const online = n.available && Boolean(n.ping?.available);
    const name = n.remarks || n.ping?.name || n.uuid.slice(0, 8);
    const prev = nodeState.get(n.uuid);
    if (bootstrapped && prev && prev.online && !online) {
      await alert(`节点离线：${name}`, [
        `节点：${name}（${n.ip}:${n.port}）`,
        `该节点上托管的买家实例：约 ${managedByNode.get(n.uuid) ?? 0} 个`,
        "自动调度已避开该节点；请检查守护端进程与网络。"
      ]);
    } else if (bootstrapped && prev && !prev.online && online) {
      await alert(`节点恢复：${name}`, [`节点：${name}（${n.ip}:${n.port}）已重新在线。`]);
    }
    nodeState.set(n.uuid, { online, name });
  }

  // Nodes that disappeared from the panel configuration entirely.
  for (const [daemonId, prev] of nodeState) {
    if (!seen.has(daemonId) && bootstrapped && prev.online) {
      await alert(`节点从面板移除：${prev.name}`, [
        `节点：${prev.name}（${daemonId}）`,
        "面板中已看不到该守护端，若为误删请重新连接。"
      ]);
      nodeState.set(daemonId, { online: false, name: prev.name });
    }
  }
}

/** Alert once per failed order (ids are monotonic; first run just baselines). */
async function checkFailedOrders(): Promise<void> {
  const failed = await prisma.order.findMany({
    where: { status: "failed", id: { gt: lastFailedOrderId } },
    orderBy: { id: "asc" },
    take: 20,
    include: { package: { select: { name: true } } }
  });
  if (failed.length === 0) {
    if (lastFailedOrderId === 0) {
      const newest = await prisma.order.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
      lastFailedOrderId = newest?.id ?? 0;
    }
    return;
  }
  for (const o of failed) lastFailedOrderId = Math.max(lastFailedOrderId, o.id);
  if (!bootstrapped) return;
  const lines = failed.map((o) => `#${o.orderNo} 用户 ${o.username} 套餐「${o.package?.name ?? o.packageId}」：${o.message || "无错误信息"}`);
  await alert(`${failed.length} 笔订单开通失败`, lines);
}

/** One ops-health sweep. Safe to run frequently; alerts only on transitions. */
export async function checkAlertsOnce(): Promise<void> {
  await checkNodes();
  await checkFailedOrders();
  bootstrapped = true;
}

export function startAlertWatcher(intervalMinutes: number): NodeJS.Timeout {
  const run = () => {
    checkAlertsOnce().catch((err) =>
      logger.error(`Alert check error: ${err instanceof Error ? err.message : err}`)
    );
  };
  // Baseline shortly after boot (after reconcile/prisma warmup), then periodic.
  setTimeout(run, 20_000).unref();
  return setInterval(run, Math.max(1, intervalMinutes) * 60 * 1000);
}
