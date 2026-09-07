// Online SQLite backup via VACUUM INTO: produces a consistent snapshot even
// while the gateway is running (safe with WAL). Usage: node backup-db.mjs <target-path>
import { PrismaClient } from "@prisma/client";

const target = process.argv[2];
if (!target) {
  console.error("usage: node backup-db.mjs <target-path>");
  process.exit(1);
}
const prisma = new PrismaClient();
try {
  // VACUUM INTO does not accept bound parameters; the target is an operator-
  // supplied local path, so escape single quotes defensively.
  const safe = target.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${safe}'`);
  console.log(`DB snapshot written: ${target}`);
} finally {
  await prisma.$disconnect();
}
