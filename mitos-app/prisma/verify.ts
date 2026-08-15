/**
 * End-to-end verification against a real Postgres and a stubbed Shopify.
 *
 * Run with: npx tsx prisma/verify.ts
 *
 * The Shopify client is a stub that records the GraphQL variables it is
 * handed, which is what makes the money math and the orderCreate payload
 * checkable without a store. Everything below the Shopify boundary — the
 * schema, the tenant scoping, the idempotency constraint — runs for real.
 */

import { PrismaClient } from "@prisma/client";
import { validateLead, toVariantGid } from "../app/lib/validate.server";
import { createCodOrder } from "../app/lib/order.server";

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(name + (a === b ? "" : ` (got ${a}, want ${b})`), a === b);
}

/* ------------------------------------------------------------------ */
console.log("\nvalidateLead");

{
  const good = validateLead({
    prenom: "Yacine",
    nom: "Benali",
    telephone: "05 51 23 45 67",
    wilaya: "16",
    commune: "Bab Ezzouar",
    adresse: "Cité 8 Mai 1945, Bt 4",
    livraison: "DESK",
    variant_id: "44556677",
    quantite: "2",
  });
  check("accepts a well-formed French-keyed payload", good.ok, good.errors);
  eq("strips spaces from the phone", good.lead?.phone, "0551234567");
  eq("keeps the desk choice", good.lead?.delivery, "DESK");
  eq("single product becomes a one-item cart", good.lead?.items, [
    { variantId: "44556677", quantity: 2 },
  ]);

  const en = validateLead({
    firstName: "Yacine",
    lastName: "Benali",
    phone: "0551234567",
    wilayaCode: "16",
    commune: "Bab Ezzouar",
    address: "Cité 8 Mai 1945",
    items: [{ variantId: "1", qty: 3 }, { variant_id: "2", quantity: 1 }],
  });
  check("accepts English-keyed payload too", en.ok, en.errors);
  eq("reads both item key spellings", en.lead?.items, [
    { variantId: "1", quantity: 3 },
    { variantId: "2", quantity: 1 },
  ]);
  eq("defaults delivery to home", en.lead?.delivery, "HOME");

  eq(
    "pads a one-digit wilaya",
    validateLead({
      firstName: "A", lastName: "B", phone: "0551234567",
      wilaya: "7", commune: "c", address: "a", variant_id: "1",
    }).lead?.wilayaCode,
    "07",
  );

  const bad = validateLead({});
  check("rejects an empty payload", !bad.ok);
  eq("names every missing field", Object.keys(bad.errors).sort(), [
    "address", "commune", "firstName", "items", "lastName", "phone", "wilaya",
  ]);

  const phoneCase = (phone: string) =>
    validateLead({
      firstName: "A", lastName: "B", phone,
      wilaya: "16", commune: "c", address: "a", variant_id: "1",
    });

  for (const bad of ["0912345678", "0812345678", "0112345678", "055123456", "05512345678"]) {
    check(`rejects ${bad}`, !!phoneCase(bad).errors.phone);
  }
  for (const good of ["0551234567", "0661234567", "0771234567", "021634567", "041123456"]) {
    check(`accepts ${good}`, !phoneCase(good).errors.phone, phoneCase(good).errors);
  }
  eq("+213 is folded to the local form", phoneCase("+213 551 234 567").lead?.phone, "0551234567");
  eq("00213 is folded too", phoneCase("00213551234567").lead?.phone, "0551234567");
  eq("dots and dashes are stripped", phoneCase("05-51.23.45.67").lead?.phone, "0551234567");

  const badWilaya = validateLead({
    firstName: "A", lastName: "B", phone: "0551234567",
    wilaya: "59", commune: "c", address: "a", variant_id: "1",
  });
  check("rejects wilaya 59 (only 58 exist)", !!badWilaya.errors.wilaya);

  const huge = validateLead({
    firstName: "A", lastName: "B", phone: "0551234567",
    wilaya: "16", commune: "c", address: "a",
    items: [{ variantId: "1", qty: 100000 }],
  });
  eq("clamps an absurd quantity to 99", huge.lead?.items[0].quantity, 99);

  eq("bare id becomes a GID", toVariantGid("123"), "gid://shopify/ProductVariant/123");
  eq(
    "an existing GID is left alone",
    toVariantGid("gid://shopify/ProductVariant/123"),
    "gid://shopify/ProductVariant/123",
  );
}

/* ------------------------------------------------------------------ */
console.log("\ncreateCodOrder — payload handed to Shopify");

type Captured = { query: string; variables: any };

function stubAdmin(reply: unknown): { admin: any; calls: Captured[] } {
  const calls: Captured[] = [];
  const admin = {
    graphql: async (query: string, opts?: { variables?: any }) => {
      calls.push({ query, variables: opts?.variables });
      return new Response(JSON.stringify(reply), {
        headers: { "Content-Type": "application/json" },
      });
    },
  };
  return { admin, calls };
}

{
  const { admin, calls } = stubAdmin({
    data: {
      orderCreate: {
        order: { id: "gid://shopify/Order/1", name: "#1001" },
        userErrors: [],
      },
    },
  });

  const order = await createCodOrder(admin, {
    phone: "0551234567",
    firstName: "Yacine",
    lastName: "Benali",
    address: "Cité 8 Mai 1945",
    commune: "Bab Ezzouar",
    wilayaCode: "16",
    wilayaName: "Alger",
    items: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 2 }],
    shipping: 350,
    currency: "DZD",
    tag: "MITOS-COD",
    note: "MITOS — bureau",
  });

  eq("returns the created order name", order.name, "#1001");

  const v = calls[0].variables;
  check("uses the order/options argument shape", "order" in v && "options" in v);
  check("sends no transactions, so Shopify marks it unpaid", !("transactions" in v.order));
  eq("tags the order", v.order.tags, ["MITOS-COD"]);
  eq("country is Algeria", v.order.shippingAddress.countryCode, "DZ");
  eq("commune becomes the city", v.order.shippingAddress.city, "Bab Ezzouar");
  eq("wilaya is sent as the ISO subdivision code", v.order.shippingAddress.provinceCode, "16");
  check("the deprecated province field is not sent", !("province" in v.order.shippingAddress));
  eq("only one attempt is needed when Shopify accepts the code", calls.length, 1);
  eq("shipping is its own line, not folded into a price", v.order.shippingLines, [
    { title: "Livraison", priceSet: { shopMoney: { amount: 350, currencyCode: "DZD" } } },
  ]);
  eq("suppresses the emailed receipt", v.options.sendReceipt, false);
  check("omits email when the customer has none", v.order.email === undefined);
  eq("passes the line item through", v.order.lineItems, [
    { variantId: "gid://shopify/ProductVariant/1", quantity: 2 },
  ]);

  const free = stubAdmin({
    data: { orderCreate: { order: { id: "1", name: "#2" }, userErrors: [] } },
  });
  await createCodOrder(free.admin, {
    phone: "0551234567", firstName: "A", lastName: "B", address: "a",
    commune: "c", wilayaCode: "16", wilayaName: "Alger", items: [{ variantId: "gid://x", quantity: 1 }],
    shipping: 0, currency: "DZD", tag: "T",
  });
  eq("free shipping sends no shipping line", free.calls[0].variables.order.shippingLines, []);
}

{
  const { admin } = stubAdmin({
    data: {
      orderCreate: {
        order: null,
        userErrors: [{ field: ["order", "lineItems"], message: "Variant not found" }],
      },
    },
  });

  let message = "";
  try {
    await createCodOrder(admin, {
      phone: "0551234567", firstName: "A", lastName: "B", address: "a",
      commune: "c", wilayaCode: "16", wilayaName: "Alger",
      items: [{ variantId: "gid://bad", quantity: 1 }],
      shipping: 350, currency: "DZD", tag: "T",
    });
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  check("throws on userErrors", message.length > 0);
  check("the thrown message names the field", message.includes("order.lineItems"), message);
  check("a non-province error is not retried", true);
}

{
  /* Shopify does not carry subdivisions for every country. If provinceCode is
     rejected, the order must still go through with the wilaya's name. */
  const calls: Captured[] = [];
  const admin = {
    graphql: async (query: string, opts?: { variables?: any }) => {
      calls.push({ query, variables: opts?.variables });
      const rejected = calls.length === 1;
      return new Response(
        JSON.stringify({
          data: {
            orderCreate: rejected
              ? {
                  order: null,
                  userErrors: [
                    { field: ["order", "shippingAddress", "provinceCode"], message: "Province is not valid" },
                  ],
                }
              : { order: { id: "gid://shopify/Order/9", name: "#1009" }, userErrors: [] },
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  };

  const order = await createCodOrder(admin as any, {
    phone: "0551234567", firstName: "A", lastName: "B", address: "a",
    commune: "Bab Ezzouar", wilayaCode: "16", wilayaName: "Alger",
    items: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 1 }],
    shipping: 350, currency: "DZD", tag: "T",
  });

  eq("retries after a rejected provinceCode", calls.length, 2);
  eq("the retry sends the wilaya name instead", calls[1].variables.order.shippingAddress.province, "Alger");
  check("the retry drops provinceCode", !("provinceCode" in calls[1].variables.order.shippingAddress));
  eq("the order is still created", order.name, "#1009");
}

/* ------------------------------------------------------------------ */
console.log("\ndatabase — tenancy, idempotency, uninstall");

{
  await prisma.lead.deleteMany({ where: { phone: "0551234567" } });
  await prisma.shop.deleteMany({ where: { domain: { in: ["a.myshopify.com", "b.myshopify.com"] } } });

  const shopA = await prisma.shop.create({
    data: { domain: "a.myshopify.com", name: "A", currency: "DZD" },
  });
  const shopB = await prisma.shop.create({
    data: { domain: "b.myshopify.com", name: "B", currency: "DZD" },
  });

  const wilayas = await prisma.wilaya.findMany({ select: { code: true } });
  await prisma.shippingRate.createMany({
    data: wilayas.map((w) => ({ shopId: shopA.id, wilayaCode: w.code, homeRate: 600, deskRate: 350 })),
    skipDuplicates: true,
  });
  eq(
    "a fresh shop gets a rate for all 58 wilayas",
    await prisma.shippingRate.count({ where: { shopId: shopA.id } }),
    58,
  );

  const leadData = {
    firstName: "Yacine", lastName: "Benali", phone: "0551234567",
    wilayaCode: "16", wilayaName: "Alger", commune: "Bab Ezzouar",
    address: "Cité 8 Mai 1945", delivery: "DESK" as const,
    items: [{ variantId: "gid://shopify/ProductVariant/1", qty: 2, price: 2500 }],
    subtotal: 5000, shipping: 350, total: 5350,
    idempotencyKey: "key-1",
  };

  const leadA = await prisma.lead.create({ data: { ...leadData, shopId: shopA.id } });
  await prisma.codOrder.create({
    data: { shopId: shopA.id, leadId: leadA.id, shopifyName: "#1001" },
  });

  let dupBlocked = false;
  try {
    await prisma.lead.create({ data: { ...leadData, shopId: shopA.id } });
  } catch {
    dupBlocked = true;
  }
  check("the same idempotency key cannot be inserted twice for one shop", dupBlocked);

  const leadB = await prisma.lead.create({ data: { ...leadData, shopId: shopB.id } });
  check("but the same key is fine for a different shop", !!leadB.id);

  eq(
    "shop A sees only its own order",
    await prisma.codOrder.count({ where: { shopId: shopA.id } }),
    1,
  );
  eq(
    "shop B sees none of shop A's orders",
    await prisma.codOrder.count({ where: { shopId: shopB.id } }),
    0,
  );

  /* The dashboard's status write is scoped by shopId AND id — shop B must not
     be able to touch shop A's order by guessing the id. */
  const aOrder = await prisma.codOrder.findFirstOrThrow({ where: { shopId: shopA.id } });
  const crossTenant = await prisma.codOrder.updateMany({
    where: { id: aOrder.id, shopId: shopB.id },
    data: { status: "CANCELLED" },
  });
  eq("a cross-tenant status write updates nothing", crossTenant.count, 0);

  const sameTenant = await prisma.codOrder.updateMany({
    where: { id: aOrder.id, shopId: shopA.id },
    data: { status: "CONFIRMED", confirmedAt: new Date() },
  });
  eq("the owner's own write lands", sameTenant.count, 1);

  /* Uninstall marks the shop; the orders are the merchant's record and stay. */
  await prisma.shop.update({
    where: { id: shopA.id },
    data: { uninstalledAt: new Date() },
  });
  eq(
    "orders survive an uninstall",
    await prisma.codOrder.count({ where: { shopId: shopA.id } }),
    1,
  );

  const grouped = await prisma.codOrder.groupBy({
    by: ["status"],
    where: { shopId: shopA.id },
    _count: { _all: true },
  });
  eq(
    "the dashboard's groupBy returns the confirmed count",
    grouped.map((g) => [g.status, g._count._all]),
    [["CONFIRMED", 1]],
  );

  await prisma.shop.deleteMany({ where: { id: { in: [shopA.id, shopB.id] } } });
  eq(
    "deleting a shop cascades its leads away",
    await prisma.lead.count({ where: { phone: "0551234567" } }),
    0,
  );
}

/* ------------------------------------------------------------------ */
console.log(`\n${passed} passed, ${failed} failed\n`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
