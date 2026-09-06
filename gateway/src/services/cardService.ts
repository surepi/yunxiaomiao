import { randomBytes } from "crypto";
import { prisma } from "../db/prisma";
import { badRequest, notFound } from "../errors";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length = 16): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  // Human friendly grouping: XXXX-XXXX-XXXX-XXXX
  return out.match(/.{1,4}/g)!.join("-");
}

export async function createCards(
  packageId: number,
  count: number,
  options: { batchNo?: string; expiresAt?: Date | null } = {}
): Promise<{ code: string; batchNo: string }[]> {
  if (!Number.isInteger(count) || count <= 0 || count > 10000) {
    throw badRequest("count must be between 1 and 10000", "BAD_COUNT");
  }
  const pkg = await prisma.package.findUnique({ where: { id: packageId } });
  if (!pkg) throw notFound("Package not found", "PACKAGE_NOT_FOUND");

  const batchNo = options.batchNo ?? `B${Date.now()}`;
  const created: { code: string; batchNo: string }[] = [];

  for (let i = 0; i < count; i++) {
    let code = generateCode();
    // Extremely unlikely, but guarantee uniqueness.
    while (await prisma.redeemCard.findUnique({ where: { code } })) {
      code = generateCode();
    }
    await prisma.redeemCard.create({
      data: {
        code,
        packageId,
        batchNo,
        expiresAt: options.expiresAt ?? null
      }
    });
    created.push({ code, batchNo });
  }
  return created;
}

export async function listCards(filter: { status?: string; batchNo?: string; packageId?: number }) {
  return prisma.redeemCard.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.batchNo ? { batchNo: filter.batchNo } : {}),
      ...(filter.packageId ? { packageId: filter.packageId } : {})
    },
    orderBy: { id: "desc" },
    take: 500,
    include: { package: { select: { id: true, name: true } } }
  });
}

export async function setCardStatus(id: number, status: "unused" | "disabled") {
  const card = await prisma.redeemCard.findUnique({ where: { id } });
  if (!card) throw notFound("Card not found", "CARD_NOT_FOUND");
  if (card.status === "used") throw badRequest("Used cards cannot be modified", "CARD_USED");
  return prisma.redeemCard.update({ where: { id }, data: { status } });
}
