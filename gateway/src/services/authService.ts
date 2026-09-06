import { prisma } from "../db/prisma";
import { panelClient } from "../panel/client";
import { signUserToken, signAdminToken } from "../security/jwt";
import { hashPassword, verifyPassword } from "../security/password";
import { badRequest, unauthorized } from "../errors";

export function validateUsername(username: string): void {
  if (!/^[A-Za-z0-9_]{4,32}$/.test(username)) {
    throw badRequest("Username must be 4-32 letters, digits or underscore", "BAD_USERNAME");
  }
}

/** Register a buyer; the account is created inside the MCSM panel. */
export async function register(username: string, password: string): Promise<{ username: string }> {
  validateUsername(username);
  if (!password || password.length < 9 || password.length > 36) {
    throw badRequest("Password must be 9-36 characters", "BAD_PASSWORD");
  }
  // Match the panel policy: must contain lower, upper and digit.
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(password)) {
    throw badRequest("Password must contain upper, lower case letters and a digit", "BAD_PASSWORD");
  }
  await panelClient.createUser(username, password);
  return { username };
}

/** Verify buyer credentials against the panel and issue a gateway JWT. */
export async function login(username: string, password: string): Promise<{ token: string; username: string }> {
  validateUsername(username);
  try {
    await panelClient.verifyLogin(username, password);
  } catch {
    throw unauthorized("Invalid username or password", "LOGIN_FAILED");
  }
  return { token: signUserToken(username), username };
}

/** Admin console login (gateway-local admin account, not the panel). */
export async function adminLogin(username: string, password: string): Promise<{ token: string }> {
  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    throw unauthorized("Invalid admin credentials", "ADMIN_LOGIN_FAILED");
  }
  return { token: signAdminToken(username) };
}

export async function ensureAdmin(username: string, password: string): Promise<void> {
  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) return;
  await prisma.adminUser.create({
    data: { username, passwordHash: hashPassword(password) }
  });
}
