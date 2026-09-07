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

export interface CardBatch {
  batchNo: string;
  packageId: number;
  packageName: string;
  total: number;
  unused: number;
  used: number;
  disabled: number;
  expiresAt: string | null;
  createdAt: string;
}

/** Aggregate cards by batch number for the admin batch-management view. */
export async function listBatches(): Promise<CardBatch[]> {
  const groups = await prisma.redeemCard.groupBy({
    by: ["batchNo", "packageId"],
    _count: { _all: true },
    _min: { createdAt: true, expiresAt: true }
  });
  const countsByStatus = await prisma.redeemCard.groupBy({
    by: ["batchNo", "status"],
    _count: { _all: true }
  });
  const packages = await prisma.package.findMany({ select: { id: true, name: true } });
  const pkgName = new Map(packages.map((p) => [p.id, p.name]));
  const statusMap = new Map<string, { unused: number; used: number; disabled: number }>();
  for (const c of countsByStatus) {
    const row = statusMap.get(c.batchNo) ?? { unused: 0, used: 0, disabled: 0 };
    if (c.status === "unused") row.unused += c._count._all;
    else if (c.status === "used") row.used += c._count._all;
    else if (c.status === "disabled") row.disabled += c._count._all;
    statusMap.set(c.batchNo, row);
  }
  return groups
    .filter((g) => g.batchNo)
    .map((g) => {
      const st = statusMap.get(g.batchNo) ?? { unused: 0, used: 0, disabled: 0 };
      return {
        batchNo: g.batchNo,
        packageId: g.packageId,
        packageName: pkgName.get(g.packageId) ?? String(g.packageId),
        total: g._count._all,
        unused: st.unused,
        used: st.used,
        disabled: st.disabled,
        expiresAt: g._min.expiresAt ? g._min.expiresAt.toISOString() : null,
        createdAt: (g._min.createdAt ?? new Date(0)).toISOString()
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * Enable/disable every non-used card in a batch. Used cards are never touched
 * (they belong to completed orders). Returns how many cards changed state.
 */
export async function setBatchStatus(batchNo: string, status: "unused" | "disabled"): Promise<number> {
  if (!batchNo) throw badRequest("batchNo is required", "BAD_BATCH");
  const result = await prisma.redeemCard.updateMany({
    where: { batchNo, status: status === "disabled" ? "unused" : "disabled" },
    data: { status }
  });
  return result.count;
}
