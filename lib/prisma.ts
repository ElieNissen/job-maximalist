import { PrismaClient } from "@prisma/client";
import { getRuntimeDatabaseFilePath, toPrismaSqliteUrl } from "@/lib/runtime-paths";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const databaseUrl = process.env.DATABASE_URL?.trim() || toPrismaSqliteUrl(getRuntimeDatabaseFilePath());

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    },
    log: ["error", "warn"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

