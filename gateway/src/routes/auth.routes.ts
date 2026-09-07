import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as authService from "../services/authService";
import { parse } from "./validate";
import { authRateLimit } from "../security/rateLimit";
import { requireUser } from "../security/guards";

const creds = z.object({
  username: z.string().min(4).max(32),
  password: z.string().min(9).max(36),
  email: z.string().min(3).max(128)
});

const loginCreds = z.object({
  username: z.string().min(4).max(32),
  password: z.string().min(1)
});

const adminCreds = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const changePassword = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(9).max(36)
});

const forgot = z.object({
  account: z.string().min(1).max(128)
});

const reset = z.object({
  token: z.string().min(10).max(200),
  newPassword: z.string().min(9).max(36)
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", { preHandler: authRateLimit }, async (req) => {
    const body = parse(creds, req.body);
    return authService.register(body.username, body.password, body.email);
  });

  app.post("/auth/login", { preHandler: authRateLimit }, async (req) => {
    const body = parse(loginCreds, req.body);
    return authService.login(body.username, body.password);
  });

  app.post("/admin/login", { preHandler: authRateLimit }, async (req) => {
    const body = parse(adminCreds, req.body);
    return authService.adminLogin(body.username, body.password);
  });

  app.post("/auth/forgot", { preHandler: authRateLimit }, async (req) => {
    const body = parse(forgot, req.body);
    return authService.forgotPassword(body.account);
  });

  app.post("/auth/reset", { preHandler: authRateLimit }, async (req) => {
    const body = parse(reset, req.body);
    return authService.resetPassword(body.token, body.newPassword);
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
