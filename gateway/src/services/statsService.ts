import { prisma } from "../db/prisma";
import { listNodesOverview, NodeOverview } from "./nodeService";


export interface OverviewAlert {
  level: "warn" | "err";
  message: string;
}

export interface StockRow {
  packageId: number;
  name: string;
  slug: string;
  active: boolean;
  unused: number;
  used: number;
  disabled: number;
  low: boolean;
  soldOut: boolean;
  threshold: number;
}

/** Aggregate business/ops stats for the admin overview dashboard. */
export async function getOverview() {
  const [packages, cards, orders, instances, nodes] = await Promise.all([
    prisma.package.findMany({ select: { id: true, name: true, slug: true, active: true, lowStock: true } }),
    prisma.redeemCard.findMany({ select: { status: true, packageId: true } }),
    prisma.order.findMany({ select: { status: true, amountFen: true, createdAt: true } }),
    prisma.provisionedInstance.findMany({ select: { status: true, expireAt: true } }),
    listNodesOverview().catch((): NodeOverview[] => [])
  ]);

  const stockMap = new Map<number, StockRow>();
  for (const p of packages) {
    stockMap.set(p.id, {
      packageId: p.id, name: p.name, slug: p.slug, active: p.active,
      unused: 0, used: 0, disabled: 0, low: false, soldOut: false,
      threshold: p.lowStock
    });
  }

  let cardsUnused = 0, cardsUsed = 0, cardsDisabled = 0;
  for (const c of cards) {
    const row = stockMap.get(c.packageId);
    if (c.status === "unused") { cardsUnused++; if (row) row.unused++; }
    else if (c.status === "used") { cardsUsed++; if (row) row.used++; }
    else if (c.status === "disabled") { cardsDisabled++; if (row) row.disabled++; }
  }

  const stock = Array.from(stockMap.values())
    .map((r) => ({
      ...r,
      low: r.unused > 0 && r.unused < r.threshold,
      soldOut: r.unused === 0
    }))
    .sort((a, b) => a.unused - b.unused);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  let ordersToday = 0, ordersFailed = 0, ordersDone = 0, revenueFen = 0;
  for (const o of orders) {
    if (o.createdAt >= startOfToday) ordersToday++;
    if (o.status === "failed") ordersFailed++;
    if (o.status === "done") { ordersDone++; revenueFen += o.amountFen; }
  }

  let instActive = 0, instExpired = 0, instProvisioning = 0, instFailed = 0, instArchived = 0, expiringSoon = 0;
  const now = Date.now();
  const in3days = now + 3 * 24 * 3600 * 1000;
  for (const i of instances) {
    if (i.status === "active") {
      instActive++;
      const t = i.expireAt ? i.expireAt.getTime() : 0;
      if (t > now && t < in3days) expiringSoon++;
    } else if (i.status === "expired") instExpired++;
    else if (i.status === "provisioning") instProvisioning++;
    else if (i.status === "failed") instFailed++;
    else if (i.status === "archived") instArchived++;
  }

  const nodesOnline = nodes.filter((n) => n.available && n.ping?.available).length;

  const alerts: OverviewAlert[] = [];
  for (const s of stock) {
    if (!s.active) continue; // off-sale packages do not need stock alerts
    if (s.soldOut) alerts.push({ level: "err", message: `套餐「${s.name}」卡密已售罄，请尽快补卡` });
    else if (s.low) alerts.push({ level: "warn", message: `套餐「${s.name}」库存偏低（剩 ${s.unused} 张）` });
  }
  if (nodes.length === 0) alerts.push({ level: "err", message: "没有可用节点，请先在 MCSM 面板连接守护端" });
  else if (nodesOnline < nodes.length) alerts.push({ level: "warn", message: `有 ${nodes.length - nodesOnline} 个节点离线` });
  if (instFailed > 0) alerts.push({ level: "err", message: `${instFailed} 个实例开通失败，请查看实例标签` });
  if (expiringSoon > 0) alerts.push({ level: "warn", message: `${expiringSoon} 个实例将在 3 天内到期` });

  return {
    stats: {
      packagesTotal: packages.length,
      packagesActive: packages.filter((p) => p.active).length,
      cardsUnused, cardsUsed, cardsDisabled,
      ordersTotal: orders.length, ordersToday, ordersDone, ordersFailed,
      revenueFen,
      instancesTotal: instances.length, instActive, instExpired, instProvisioning, instFailed, instArchived, expiringSoon,
      nodesTotal: nodes.length, nodesOnline
    },
    stock,
    nodes,
    alerts
  };
}
