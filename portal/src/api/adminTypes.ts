export interface NodeConfig {
  daemonId: string;
  weight: number;
  maxInstances: number;
  enabled: boolean;
  note: string;
}

export interface AdminNode {
  uuid: string;
  ip: string;
  port: number;
  remarks?: string;
  available: boolean;
  ping: { name: string; running: number; instances: number; available: boolean } | null;
  config: NodeConfig;
}

export interface AdminPackage {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceFen: number;
  hours: number;
  mcsmCategoryId: number;
  setupInfo: string;
  resourceLimits: string;
  nodeStrategy: string;
  fixedNodeId: string;
  active: boolean;
  sort: number;
  lowStock: number;
}

export interface AdminCard {
  id: number;
  code: string;
  packageId: number;
  batchNo: string;
  status: "unused" | "used" | "disabled";
  usedBy: string;
  usedAt: string | null;
  expiresAt: string | null;
  package?: { id: number; name: string };
}

export interface CardBatch {
  batchNo: string;
  packageId: number;
  packageName: string;
  total: number;
  unused: number;
  used: number;
  disabled: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface AdminOrder {
  id: number;
  orderNo: string;
  username: string;
  packageId: number;
  source: string;
  amountFen: number;
  status: string;
  message: string;
  createdAt: string;
  package?: { id: number; name: string };
}

export interface AdminInstance {
  id: number;
  username: string;
  instanceUuid: string;
  daemonId: string;
  categoryId: number;
  status: string;
  expireAt: string | null;
  createdAt: string;
  package?: { id: number; name: string };
}

export interface QuickTemplate {
  title: string;
  description?: string;
  language?: string;
  gameType?: string;
  category?: string;
  platform?: string;
  runtime?: string;
  author?: string;
  setupInfo: Record<string, unknown>;
}

export interface OverviewAlert {
  level: "warn" | "err";
  message: string;
}
export interface StockRow {
  packageId: number;
  name: string;
  slug: string;
  unused: number;
  used: number;
  disabled: number;
  low: boolean;
  soldOut: boolean;
}
export interface Overview {
  stats: Record<string, number>;
  stock: StockRow[];
  nodes: AdminNode[];
  alerts: OverviewAlert[];
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  level: "info" | "warn" | "critical";
  active: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEventItem {
  id: number;
  provider: string;
  eventId: string;
  payload: string;
  signatureOk: boolean;
  processed: boolean;
  note: string;
  createdAt: string;
}

export interface AdminAuditItem {
  id: number;
  admin: string;
  method: string;
  path: string;
  status: number;
  detail: string;
  ip: string;
  createdAt: string;
}
