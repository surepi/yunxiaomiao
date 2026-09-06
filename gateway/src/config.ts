import dotenv from "dotenv";

dotenv.config();

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== "" ? n : fallback;
}

export const config = {
  port: num(process.env.GATEWAY_PORT, 8080),
  host: process.env.GATEWAY_HOST || "0.0.0.0",
  corsOrigin: process.env.CORS_ORIGIN || "*",

  jwtUserSecret: process.env.JWT_USER_SECRET || "dev-user-secret",
  jwtAdminSecret: process.env.JWT_ADMIN_SECRET || "dev-admin-secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123456",

  panelBaseUrl: (process.env.PANEL_BASE_URL || "http://localhost:23333").replace(/\/$/, ""),
  panelApiKey: process.env.PANEL_API_KEY || "",
  mcsmUiOrigin: (process.env.MCSM_UI_ORIGIN || "http://localhost:23333").replace(/\/$/, ""),

  databaseUrl: process.env.DATABASE_URL || "file:./data/gateway.db",
  reconcileIntervalMinutes: num(process.env.RECONCILE_INTERVAL_MINUTES, 60),

  // Shared secret used to verify inbound sales-channel webhooks (taobao/ERP).
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me-webhook-secret",

  isProd: process.env.NODE_ENV === "production"
};

export type AppConfig = typeof config;

/**
 * In production refuse to boot with development defaults or weak secrets so the
 * operator must configure explicit credentials. In development we only warn.
 */
export function assertRuntimeConfig(): void {
  const problems: string[] = [];
  if (!config.panelApiKey) problems.push("PANEL_API_KEY must be set to the panel admin apiKey");
  if (config.jwtUserSecret === "dev-user-secret" || config.jwtUserSecret.length < 16)
    problems.push("JWT_USER_SECRET must be a random value of at least 16 characters");
  if (config.jwtAdminSecret === "dev-admin-secret" || config.jwtAdminSecret.length < 16)
    problems.push("JWT_ADMIN_SECRET must be a random value of at least 16 characters");
  if (config.webhookSecret === "change-me-webhook-secret" || config.webhookSecret.length < 16)
    problems.push("WEBHOOK_SECRET must be a random value of at least 16 characters");
  if (config.adminPassword === "admin123456" || config.adminPassword.length < 10)
    problems.push("ADMIN_PASSWORD must be changed from the default (at least 10 characters)");
  if (config.corsOrigin === "*")
    problems.push("CORS_ORIGIN should be pinned to the portal origin(s)");

  if (problems.length === 0) return;
  if (config.isProd) {
    throw new Error("Refusing to start in production with insecure configuration:\n  - " + problems.join("\n  - "));
  }
  console.warn("[config] Insecure development configuration detected:");
  for (const p of problems) console.warn("  - " + p);
}

