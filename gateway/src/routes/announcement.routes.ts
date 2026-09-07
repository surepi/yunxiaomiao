import { FastifyInstance } from "fastify";
import * as announcementService from "../services/announcementService";

/**
 * Public, read-only endpoint used by the portal to render the announcement /
 * maintenance banner. Returns only announcements that are active and within
 * their optional schedule window.
 */
export async function announcementRoutes(app: FastifyInstance): Promise<void> {
  app.get("/announcements", async () => {
    return { announcements: await announcementService.listActive() };
  });
}
