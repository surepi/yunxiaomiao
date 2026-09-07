import { prisma } from "../db/prisma";
import { badRequest, notFound } from "../errors";

export const LEVELS = ["info", "warn", "critical"] as const;
export type AnnouncementLevel = (typeof LEVELS)[number];

export interface AnnouncementInput {
  title?: string;
  content: string;
  level?: string;
  active?: boolean;
  startAt?: Date | null;
  endAt?: Date | null;
}

function normalize(input: AnnouncementInput) {
  const content = (input.content ?? "").trim();
  if (!content) throw badRequest("Announcement content is required", "ANNOUNCEMENT_EMPTY");
  if (content.length > 2000) throw badRequest("Announcement content is too long", "ANNOUNCEMENT_TOO_LONG");
  const level = (LEVELS as readonly string[]).includes(input.level ?? "")
    ? (input.level as AnnouncementLevel)
    : "info";
  const title = (input.title ?? "").trim().slice(0, 120);
  const startAt = input.startAt ?? null;
  const endAt = input.endAt ?? null;
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) {
    throw badRequest("End time must be after start time", "ANNOUNCEMENT_BAD_WINDOW");
  }
  return { title, content, level, active: input.active ?? true, startAt, endAt };
}

/** All announcements for the admin console, newest first. */
export function listAll() {
  return prisma.announcement.findMany({ orderBy: { id: "desc" }, take: 200 });
}

/** Currently visible announcements for the public portal banner. */
export function listActive() {
  const now = new Date();
  return prisma.announcement.findMany({
    where: {
      active: true,
      AND: [
        { OR: [{ startAt: null }, { startAt: { lte: now } }] },
        { OR: [{ endAt: null }, { endAt: { gte: now } }] }
      ]
    },
    orderBy: { id: "desc" },
    take: 10
  });
}

export function create(input: AnnouncementInput) {
  return prisma.announcement.create({ data: normalize(input) });
}

export async function update(id: number, input: Partial<AnnouncementInput>) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw notFound("Announcement not found", "ANNOUNCEMENT_NOT_FOUND");
  // Merge with existing values so partial updates validate the full window.
  const merged = normalize({
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    level: input.level ?? existing.level,
    active: input.active ?? existing.active,
    startAt: input.startAt === undefined ? existing.startAt : input.startAt,
    endAt: input.endAt === undefined ? existing.endAt : input.endAt
  });
  return prisma.announcement.update({ where: { id }, data: merged });
}

export async function remove(id: number): Promise<void> {
  await prisma.announcement.delete({ where: { id } });
}
