import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  // Expected constraint violations are caught and mapped to 4xx by the app
  // (see prismaError in errors.ts), so Prisma's own error channel is disabled
  // to avoid noisy logs; real failures still surface through the route handlers.
  log: ["warn"]
});
