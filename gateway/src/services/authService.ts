import crypto from "crypto";
import { prisma } from "../db/prisma";
import { panelClient } from "../panel/client";
import { signUserToken, signAdminToken } from "../security/jwt";
import { hashPassword, verifyPassword } from "../security/password";
import { config } from "../config";
import { mailPasswordReset } from "../notify/emails";
import { badRequest, unauthorized, upstream } from "../errors";
import { accountKey, assertNotLocked, recordLoginFailure, recordLoginSuccess } from "../security/loginGuard";

export function validateUsername(username: string): void {
  if (!/^[A-Za-z0-9_]{4,32}$/.test(username)) {
    throw badRequest("Username must be 4-32 letters, digits or underscore", "BAD_USERNAME");
  }
}

/** Basic email shape check; the address is only used for notifications/reset. */
export function validateEmail(email: string): void {
  const value = (email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 128) {
    throw badRequest("Please provide a valid email address", "BAD_EMAIL");
  }
}

/** Password policy shared with the panel: 9-36 chars with lower, upper and a digit. */
export function validatePassword(password: string): void {
  if (!password || password.length < 9 || password.length > 36) {
    throw badRequest("Password must be 9-36 characters", "BAD_PASSWORD");
  }
  // Match the panel policy: must contain lower, upper and digit.
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(password)) {
    throw badRequest("Password must contain upper, lower case letters and a digit", "BAD_PASSWORD");
  }
}

/** Look up a buyer's notification email (empty string when not on file). */
export async function getEmail(username: string): Promise<string> {
  const profile = await prisma.userProfile.findUnique({ where: { username } });
  return profile?.email ?? "";
}

/** Register a buyer; the account is created inside the MCSM panel. */
export async function register(
  username: string,
  password: string,
  email: string
): Promise<{ username: string }> {
  validateUsername(username);
  validatePassword(password);
  validateEmail(email);
  const normalized = email.trim().toLowerCase();
  const byEmail = await prisma.userProfile.findUnique({ where: { email: normalized } });
  if (byEmail && byEmail.username !== username) {
    throw badRequest("This email is already registered", "EMAIL_TAKEN");
  }
  await panelClient.createUser(username, password);
  await prisma.userProfile.upsert({
    where: { username },
    update: { email: normalized },
    create: { username, email: normalized }
  });
  return { username };
}

/**
 * Begin password reset. Always resolves successfully (even when the account is
 * unknown) so the endpoint cannot be used to enumerate usernames/emails.
 */
export async function forgotPassword(account: string): Promise<{ ok: true }> {
  const key = (account || "").trim();
  if (key) {
    const byUsername = await prisma.userProfile.findUnique({ where: { username: key } }).catch(() => null);
    const byEmail = await prisma.userProfile
      .findUnique({ where: { email: key.toLowerCase() } })
      .catch(() => null);
    const profile = byUsername ?? byEmail;
    if (profile) {
      const uuid = await panelClient.getUserUuid(profile.username).catch(() => "");
      if (uuid) {
        const raw = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
        await prisma.passwordReset.create({
          data: {
            username: profile.username,
            tokenHash,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000)
          }
        });
        const resetUrl = `${config.portalOrigin}/reset?token=${raw}`;
        await mailPasswordReset(profile.email, profile.username, resetUrl);
      }
    }
  }
  return { ok: true };
}

/** Complete a password reset with the emailed single-use token. */
export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
  validatePassword(newPassword);
  if (!token) throw badRequest("Invalid reset link", "BAD_RESET_TOKEN");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rec = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now()) {
    throw badRequest("Reset link is invalid or has expired", "BAD_RESET_TOKEN");
  }
  const uuid = await panelClient.getUserUuid(rec.username);
  if (!uuid) throw upstream("Panel account not found", "USER_NOT_FOUND");
  await panelClient.updateUserPassword(uuid, newPassword);
  const now = new Date();
  // Consume this token and any other outstanding ones for the same account.
  await prisma.passwordReset.updateMany({
    where: { username: rec.username, usedAt: null },
    data: { usedAt: now }
  });
  return { ok: true };
}

/**
 * Self-service password change. The panel is the source of truth: first prove the
 * caller knows the current password, then reset it via the admin apiKey.
 */
export async function changePassword(
  username: string,
  oldPassword: string,
  newPassword: string
): Promise<{ ok: true }> {
  validateUsername(username);
  validatePassword(newPassword);
  if (oldPassword === newPassword) {
    throw badRequest("New password must be different from the current one", "SAME_PASSWORD");
  }
  try {
    await panelClient.verifyLogin(username, oldPassword);
  } catch {
    throw unauthorized("Current password is incorrect", "BAD_OLD_PASSWORD");
  }
  const uuid = await panelClient.getUserUuid(username);
  if (!uuid) {
    throw upstream("Panel account not found", "USER_NOT_FOUND");
  }
  await panelClient.updateUserPassword(uuid, newPassword);
  return { ok: true };
}

/** Verify buyer credentials against the panel and issue a gateway JWT. */
export async function login(username: string, password: string): Promise<{ token: string; username: string }> {
  validateUsername(username);
  const key = accountKey("user", username);
  assertNotLocked(key);
  try {
    await panelClient.verifyLogin(username, password);
  } catch {
    recordLoginFailure(key);
    throw unauthorized("Invalid username or password", "LOGIN_FAILED");
  }
  recordLoginSuccess(key);
  return { token: signUserToken(username), username };
}

/** Admin console login (gateway-local admin account, not the panel). */
export async function adminLogin(username: string, password: string): Promise<{ token: string }> {
  const key = accountKey("admin", username);
  assertNotLocked(key);
  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    recordLoginFailure(key);
    throw unauthorized("Invalid admin credentials", "ADMIN_LOGIN_FAILED");
  }
  recordLoginSuccess(key);
  return { token: signAdminToken(username) };
}

export async function ensureAdmin(username: string, password: string): Promise<void> {
  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) return;
  await prisma.adminUser.create({
    data: { username, passwordHash: hashPassword(password) }
  });
}
