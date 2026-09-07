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

  // Panel usernames that must never be used as buyer portal accounts. The
  // MCSM panel ships with a super admin ("root", permission=10); even with the
  // correct password such accounts may not log in or register on the buyer side.
  buyerReservedUsernames: (process.env.BUYER_RESERVED_USERNAMES || "root")
    .split(",")
    .map((u) => u.trim().toLowerCase())
    .filter(Boolean),

  panelBaseUrl: (process.env.PANEL_BASE_URL || "http://localhost:23333").replace(/\/$/, ""),
  panelApiKey: process.env.PANEL_API_KEY || "",
  mcsmUiOrigin: (process.env.MCSM_UI_ORIGIN || "http://localhost:23333").replace(/\/$/, ""),

  databaseUrl: process.env.DATABASE_URL || "file:./data/gateway.db",
  reconcileIntervalMinutes: num(process.env.RECONCILE_INTERVAL_MINUTES, 60),

  // Brute-force protection: after LOGIN_MAX_FAILURES consecutive bad logins for
  // the same account, that account is locked for LOGIN_LOCKOUT_MINUTES. This is
  // per-account (on top of the per-IP rate limiter) and in-memory.
  loginMaxFailures: num(process.env.LOGIN_MAX_FAILURES, 5),
  loginLockoutMinutes: num(process.env.LOGIN_LOCKOUT_MINUTES, 15),

  // Expired-instance lifecycle. After a server expires the panel stops it; the
  // gateway then waits GRACE_PERIOD_DAYS before archiving. AUTO_DELETE_EXPIRED
  // is off by default (we only warn), so nothing is ever destroyed without an
  // explicit opt-in. When enabled, the panel instance is deleted after a
  // metadata snapshot is written to BACKUP_DIR; DELETE_INSTANCE_FILES also wipes
  // the daemon files (kept by default as a manual recovery safety net).
  gracePeriodDays: num(process.env.GRACE_PERIOD_DAYS, 7),
  autoDeleteExpired: process.env.AUTO_DELETE_EXPIRED === "true",
  deleteInstanceFiles: process.env.DELETE_INSTANCE_FILES === "true",
  backupDir: process.env.BACKUP_DIR || "data/backups",

  // Shared secret used to verify inbound sales-channel webhooks (taobao/ERP).
  webhookSecret: process.env.WEBHOOK_SECRET || "change-me-webhook-secret",

  // Ops alert recipients (node offline, provisioning failures, panel API down).
  // Comma-separated; when empty, alerts are logged but no email is sent.
  alertEmails: (process.env.ALERT_EMAIL || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean),
  alertIntervalMinutes: num(process.env.ALERT_INTERVAL_MINUTES, 10),

  // Public buyer-portal origin, used to build password-reset links in emails.
  portalOrigin: (process.env.PORTAL_ORIGIN || "http://localhost:5174").replace(/\/$/, ""),

  // Email (SMTP). Disabled by default; provision/renew/expiry/reset mail is
  // skipped (only logged) until explicitly enabled and configured.
  mailEnabled: process.env.SMTP_ENABLED === "true",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: num(process.env.SMTP_PORT, 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  mailFrom: process.env.MAIL_FROM || "云小喵 <no-reply@example.com>",

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

