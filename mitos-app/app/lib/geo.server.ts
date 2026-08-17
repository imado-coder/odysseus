/**
 * Loading the wilaya table.
 *
 * This runs from two places: `npm run prisma:seed` on a machine that can
 * reach the database, and the bootstrap endpoint on a machine that can't — a
 * managed Postgres is normally only reachable from the deployment itself.
 * Keeping one implementation means the second path can never drift into
 * seeding something subtly different from the first.
 *
 * Communes are not seeded here; see wilayas.server.ts for why.
 */
import type { PrismaClient } from "@prisma/client";
import { WILAYAS } from "./wilayas.server";

export async function seedWilayas(prisma: PrismaClient) {
  for (const [code, nameFr, nameAr] of WILAYAS) {
    await prisma.wilaya.upsert({
      where: { code },
      update: { nameFr, nameAr },
      create: { code, nameFr, nameAr },
    });
  }

  return {
    wilayas: await prisma.wilaya.count(),
    communes: await prisma.commune.count(),
  };
}
