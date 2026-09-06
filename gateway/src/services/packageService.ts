import { prisma } from "../db/prisma";
import { notFound, prismaError } from "../errors";

/** Map known Prisma constraint errors to typed AppErrors; rethrow the rest. */
async function withPrisma<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (err) {
    const mapped = prismaError(err);
    if (mapped) throw mapped;
    throw err;
  }
}

export interface PublicPackage {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceFen: number;
  hours: number;
  active: boolean;
}

export async function listPublicPackages(): Promise<PublicPackage[]> {
  const rows = await prisma.package.findMany({
    where: { active: true },
    orderBy: [{ sort: "asc" }, { id: "asc" }]
  });
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceFen: p.priceFen,
    hours: p.hours,
    active: p.active
  }));
}

export async function listAllPackages() {
  return prisma.package.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] });
}

export async function getPackageOrThrow(id: number) {
  const pkg = await prisma.package.findUnique({ where: { id } });
  if (!pkg) throw notFound("Package not found", "PACKAGE_NOT_FOUND");
  return pkg;
}

export async function createPackage(data: {
  slug: string;
  name: string;
  description?: string;
  priceFen: number;
  hours: number;
  mcsmCategoryId: number;
  setupInfo: string;
  resourceLimits?: string;
  nodeStrategy?: string;
  fixedNodeId?: string;
  active?: boolean;
  sort?: number;
}) {
  return withPrisma(
    prisma.package.create({
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description ?? "",
        priceFen: data.priceFen,
        hours: data.hours,
        mcsmCategoryId: data.mcsmCategoryId,
        setupInfo: data.setupInfo,
        resourceLimits: data.resourceLimits ?? "{}",
        nodeStrategy: data.nodeStrategy ?? "auto",
        fixedNodeId: data.fixedNodeId ?? "",
        active: data.active ?? true,
        sort: data.sort ?? 0
      }
    })
  );
}

export async function updatePackage(id: number, data: Record<string, unknown>) {
  await getPackageOrThrow(id);
  return withPrisma(prisma.package.update({ where: { id }, data }));
}

export async function deletePackage(id: number): Promise<void> {
  await getPackageOrThrow(id);
  await withPrisma(prisma.package.delete({ where: { id } }));
}
