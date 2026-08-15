/** Inserts a demo shop so the public endpoint can be exercised locally. */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const shop = await p.shop.upsert({
  where: { domain: "demo.myshopify.com" },
  update: { uninstalledAt: null },
  create: { domain: "demo.myshopify.com", name: "Demo", currency: "DZD" },
});

await p.shopSettings.upsert({
  where: { shopId: shop.id },
  update: {},
  create: { shopId: shop.id },
});

const wilayas = await p.wilaya.findMany({ select: { code: true } });
await p.shippingRate.createMany({
  data: wilayas.map((w) => ({
    shopId: shop.id,
    wilayaCode: w.code,
    homeRate: 600,
    deskRate: 350,
  })),
  skipDuplicates: true,
});

console.log("shop ready:", shop.domain, shop.id);
await p.$disconnect();
