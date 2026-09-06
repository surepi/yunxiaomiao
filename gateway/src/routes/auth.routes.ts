import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as authService from "../services/authService";
import { parse } from "./validate";
import { authRateLimit } from "../security/rateLimit";
import { requireUser } from "../security/guards";

const creds = z.object({
  username: z.string().min(4).max(32),
  password: z.string().min(9).max(36)
});

const adminCreds = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const changePassword = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(9).max(36)
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", { preHandler: authRateLimit }, async (req) => {
    const body = parse(creds, req.body);
    return authService.register(body.username, body.password);
  });

  app.post("/auth/login", { preHandler: authRateLimit }, async (req) => {
    const body = parse(creds, req.body);
    return authService.login(body.username, body.password);
  });

  app.post("/admin/login", { preHandler: authRateLimit }, async (req) => {
    const body = parse(adminCreds, req.body);
    return authService.adminLogin(body.username, body.password);
  });

  app.get("/auth/me", async (req) => {
    const user = await requireUser(req);
    return { username: user.username };
  });

  app.post("/auth/password", { preHandler: authRateLimit }, async (req) => {
    const user = await requireUser(req);
    const body = parse(changePassword, req.body);
    return authService.changePassword(user.username, body.oldPassword, body.newPassword);
  });
}
