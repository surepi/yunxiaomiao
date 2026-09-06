import { FastifyInstance } from "fastify";
import * as packageService from "../services/packageService";

export async function packageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/packages", async () => {
    return { packages: await packageService.listPublicPackages() };
  });
}
