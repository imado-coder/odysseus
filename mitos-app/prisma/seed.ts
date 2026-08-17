/**
 * Loads the reference data — the 58 wilayas and 1,541 communes of Algeria —
 * into a database this machine can reach directly.
 *
 * The wilayas are seeded by the same function the bootstrap endpoint calls,
 * so the two paths can never disagree. The communes are only seeded here:
 * they come from prisma/algeria.json rather than the application bundle,
 * because nothing the app serves reads them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { seedWilayas } from "../app/lib/geo.server";

type WilayaRow = { c: string; fr: string; ar: string; m: [string, string][] };

const prisma = new PrismaClient();

async function main() {
  const { wilayas } = await seedWilayas(prisma);

  const path = fileURLToPath(new URL("./algeria.json", import.meta.url));
  const data: WilayaRow[] = JSON.parse(readFileSync(path, "utf8"));

  /* Communes are replaced wholesale rather than diffed: the list changes only
     when the source dataset does, and a rebuild is cheaper than reconciling. */
  await prisma.commune.deleteMany();
  await prisma.commune.createMany({
    data: data.flatMap((w) =>
      w.m.map((m) => ({ wilayaCode: w.c, nameAr: m[0], nameFr: m[1] })),
    ),
  });

  const communes = await prisma.commune.count();
  console.log(`seeded ${wilayas} wilayas, ${communes} communes`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
