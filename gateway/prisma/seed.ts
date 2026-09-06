import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/security/password";

const prisma = new PrismaClient();

const baseInstance = {
  stopCommand: "^C",
  cwd: "/data",
  ie: "utf8",
  oe: "utf8",
  fileCode: "utf8",
  processType: "docker",
  runAs: "root",
  updateCommand: "",
  crlf: 1,
  endTime: 0,
  category: 0,
  basePort: 0,
  eventTask: { autoStart: false, autoRestart: true, autoRestartMaxTimes: 3, ignore: false },
  terminalOption: { haveColor: true, pty: false, ptyWindowCol: 100, ptyWindowRow: 30 },
  java: {},
  actionCommandList: [],
  tag: ["Minecraft"]
};

const javaSetup = {
  ...baseInstance,
  startCommand: "",
  nickname: "",
  type: "minecraft/java",
  docker: {
    image: "itzg/minecraft-server:latest",
    ports: ["{mcsm_port1}:25565/tcp"],
    changeWorkdir: true,
    workingDir: "/data",
    env: ["EULA=TRUE", "TYPE=VANILLA", "VERSION=LATEST", "MEMORY=2G"],
    extraVolumes: []
  },
  pingConfig: { ip: "", port: 0, type: 1 }
};

const bedrockSetup = {
  ...baseInstance,
  startCommand: "",
  nickname: "",
  type: "minecraft/bedrock",
  docker: {
    image: "itzg/minecraft-bedrock-server:latest",
    ports: ["{mcsm_port1}:19132/udp"],
    changeWorkdir: true,
    workingDir: "/data",
    env: ["EULA=TRUE", "VERSION=LATEST"],
    extraVolumes: []
  },
  pingConfig: { ip: "", port: 0, type: 2 }
};

async function main(): Promise<void> {
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPass = process.env.ADMIN_PASSWORD || "admin123456";
  await prisma.adminUser.upsert({
    where: { username: adminUser },
    update: {},
    create: { username: adminUser, passwordHash: hashPassword(adminPass) }
  });
  console.log(`Admin ready: ${adminUser}`);

  const java = await prisma.package.upsert({
    where: { slug: "mc-java-2g" },
    update: {},
    create: {
      slug: "mc-java-2g",
      name: "Minecraft Java 版 · 2G 内存",
      description: "Java 版 Vanilla 服务端，2G 内存 / 30 天，适合 5-10 人小队。",
      priceFen: 2990,
      hours: 720,
      mcsmCategoryId: 1,
      setupInfo: JSON.stringify(javaSetup),
      resourceLimits: JSON.stringify({ memory: 2048, cpuUsage: 100, maxSpace: 10240 }),
      nodeStrategy: "auto",
      active: true,
      sort: 1
    }
  });

  const bedrock = await prisma.package.upsert({
    where: { slug: "mc-bedrock-1g" },
    update: {},
    create: {
      slug: "mc-bedrock-1g",
      name: "Minecraft 基岩版 · 1G 内存",
      description: "Bedrock 服务端，1G 内存 / 30 天，手机/Win10 可连。",
      priceFen: 1990,
      hours: 720,
      mcsmCategoryId: 2,
      setupInfo: JSON.stringify(bedrockSetup),
      resourceLimits: JSON.stringify({ memory: 1024, cpuUsage: 100, maxSpace: 10240 }),
      nodeStrategy: "auto",
      active: true,
      sort: 2
    }
  });

  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const genCode = () => {
    let out = "";
    for (let i = 0; i < 16; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return out.match(/.{1,4}/g)!.join("-");
  };

  for (const pkg of [java, bedrock]) {
    const count = await prisma.redeemCard.count({ where: { packageId: pkg.id } });
    if (count > 0) continue;
    const batchNo = `SEED-${pkg.slug}`;
    for (let i = 0; i < 5; i++) {
      await prisma.redeemCard.create({
        data: { code: genCode(), packageId: pkg.id, batchNo }
      });
    }
    console.log(`Seeded 5 sample cards for ${pkg.slug}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
