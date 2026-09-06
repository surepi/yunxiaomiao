import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAdminToken, verifyUserToken } from "./jwt";
import { unauthorized } from "../errors";

function bearerToken(req: FastifyRequest): string {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw unauthorized("Missing bearer token");
  return token;
}

export async function requireUser(req: FastifyRequest): Promise<{ username: string }> {
  try {
    const payload = verifyUserToken(bearerToken(req));
    return { username: payload.username };
  } catch {
    throw unauthorized("Invalid or expired user token");
  }
}

export async function requireAdmin(req: FastifyRequest): Promise<{ username: string }> {
  try {
    const payload = verifyAdminToken(bearerToken(req));
    return { username: payload.username };
  } catch {
    throw unauthorized("Invalid or expired admin token");
  }
}

export function userHook(req: FastifyRequest, _reply: FastifyReply) {
  return requireUser(req);
}
