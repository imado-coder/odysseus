/**
 * The three privacy webhooks, driven against an in-memory database.
 *
 * Run: npm run test:gdpr
 *
 * A reviewer fires all three at a test store and looks at what changed, so the
 * assertions here are the ones they would make: did the shopper's fields
 * actually go, did anything the merchant needs survive, and does a second
 * delivery of the same webhook — Shopify retries — leave the same result.
 *
 * The double is deliberately literal about Prisma's shapes (`{ in: [...] }`,
 * `include`, `select`), because the bugs worth catching in this file are
 * queries that silently match nothing. A redaction that finds no rows and a
 * redaction that ran perfectly look identical from the outside; the only
 * defence is a test that seeds a row it knows must be hit.
 *
 * Two defects were found by writing it, and both are asserted below:
 *
 *   - `Shipment.request` and `Shipment.response` were being left alone. They
 *     hold the JSON posted to the carrier — the shopper's name, phone and
 *     street — so "customer redacted" would have been false while a full copy
 *     sat one table over.
 *
 *   - `shop/redact` deleted the carrier rows and left their Supabase Vault
 *     secrets behind. `Carrier.credentialsRef` is the only pointer to them, so
 *     a live courier API token would have stayed encrypted in `vault.secrets`
 *     forever, unreferenced and unfindable.
 */
import {
  phoneVariants,
  orderIdVariants,
  findLeadIds,
  recordDataRequest,
  buildCustomerExport,
  redactCustomer,
  redactShop,
} from "../app/lib/gdpr.server";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

/* ── A just-enough Prisma ────────────────────────────────────────────────── */

type Row = Record<string, any>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      if ("in" in v) return (v.in as any[]).includes(row[k]);
    }
    return row[k] === v;
  });
}

const project = (row: Row, select?: Row) =>
  select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row };

function table(rows: Row[]) {
  return {
    rows,
    findMany: async ({ where = {}, select, include }: Row = {}) =>
      rows.filter((r) => matches(r, where)).map((r) => {
        const out: Row = project(r, select);
        if (include) for (const k of Object.keys(include)) out[k] = r[k] ?? null;
        return out;
      }),
    findUnique: async ({ where = {}, include }: Row = {}) => {
      const hit = rows.find((r) => matches(r, where));
      if (!hit) return null;
      const out: Row = { ...hit };
      if (include) for (const k of Object.keys(include)) out[k] = hit[k] ?? null;
      return out;
    },
    updateMany: async ({ where = {}, data = {} }: Row = {}) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    },
    create: async ({ data }: Row) => {
      const r = { id: `row_${rows.length + 1}`, ...data };
      rows.push(r);
      return r;
    },
    upsert: async ({ where, create, update }: Row) => {
      const hit = rows.find((r) => matches(r, where));
      if (hit) {
        Object.assign(hit, update);
        return hit;
      }
      const r = { id: `row_${rows.length + 1}`, ...create };
      rows.push(r);
      return r;
    },
    deleteMany: async ({ where = {} }: Row = {}) => {
      const keep = rows.filter((r) => !matches(r, where));
      const n = rows.length - keep.length;
      rows.length = 0;
      rows.push(...keep);
      return { count: n };
    },
    delete: async ({ where = {} }: Row = {}) => {
      const i = rows.findIndex((r) => matches(r, where));
      if (i < 0) throw new Error("not found");
      return rows.splice(i, 1)[0];
    },
  };
}

function seed({ vaultFails = false } = {}) {
  const lead: Row = {
    id: "lead_1",
    shopId: "shop_1",
    firstName: "Yacine",
    lastName: "Belkacem",
    phone: "0551234567",
    wilayaCode: "16",
    wilayaName: "Alger",
    commune: "Bab Ezzouar",
    address: "12 rue des Frères Aissiou",
    delivery: "HOME",
    note: "après 18h",
    items: [{ title: "Montre", qty: 1, price: 4500 }],
    subtotal: 4500,
    shipping: 600,
    total: 5100,
    ip: "41.100.0.1",
    userAgent: "Mozilla/5.0",
    idempotencyKey: "key-abc",
    createdAt: new Date("2026-08-01"),
    redactedAt: null,
  };
  const order: Row = {
    id: "order_1",
    shopId: "shop_1",
    leadId: "lead_1",
    shopifyOrderId: "gid://shopify/Order/9001",
    shopifyName: "#1008",
    status: "CONFIRMED",
    createdAt: new Date("2026-08-01"),
  };
  lead.order = order;

  /* A second shopper who must be left completely alone. */
  const other: Row = {
    id: "lead_2",
    shopId: "shop_1",
    firstName: "Amina",
    lastName: "Haddad",
    phone: "0770000000",
    wilayaCode: "31",
    wilayaName: "Oran",
    commune: "Es Senia",
    address: "5 rue Larbi",
    delivery: "DESK",
    note: null,
    items: [],
    subtotal: 3000,
    shipping: 350,
    total: 3350,
    ip: "41.100.0.2",
    userAgent: "Mozilla/5.0",
    idempotencyKey: "key-def",
    createdAt: new Date("2026-08-02"),
    redactedAt: null,
    order: null,
  };

  const shipment: Row = {
    id: "ship_1",
    shopId: "shop_1",
    codOrderId: "order_1",
    trackingNumber: "TRX-778",
    request: { nom: "Yacine Belkacem", telephone: "0551234567", adresse: "12 rue des Frères Aissiou" },
    response: { tracking: "TRX-778", client: "Yacine Belkacem" },
    lastError: "timeout contacting 0551234567",
  };

  const shop: Row = {
    id: "shop_1",
    domain: "test-shop.myshopify.com",
    carriers: [
      { credentialsRef: "11111111-1111-1111-1111-111111111111" },
      { credentialsRef: "22222222-2222-2222-2222-222222222222" },
      { credentialsRef: null },
    ],
  };

  const rawSql: string[] = [];
  const db: Row = {
    lead: table([lead, other]),
    codOrder: table([order]),
    shipment: table([shipment]),
    dataRequest: table([]),
    shop: table([shop]),
    session: table([
      { id: "s1", shop: "test-shop.myshopify.com", accessToken: "shpat_x" },
      { id: "s2", shop: "another.myshopify.com", accessToken: "shpat_y" },
    ]),
    $executeRawUnsafe: async (_sql: string, ref: string) => {
      if (vaultFails) throw new Error("vault schema does not exist");
      rawSql.push(ref);
      return 1;
    },
  };
  return { db, lead, other, order, shipment, shop, rawSql };
}

/* ── 1. Phone, the join that decides whether anything happens at all ─────── */

console.log("\n1. Phone spellings");
{
  const fromShopify = phoneVariants("+213551234567");
  ok("the international form finds the stored local one", fromShopify.includes("0551234567"));

  const fromUs = phoneVariants("0551234567");
  ok("the local form finds an international row", fromUs.includes("+213551234567"));

  ok("spacing and dashes do not defeat it",
    phoneVariants("+213 551 23 45 67").includes("0551234567"));
  ok("the 00213 prefix is handled",
    phoneVariants("00213551234567").includes("0551234567"));
  ok("both spellings agree on the same set",
    JSON.stringify([...fromShopify].sort()) === JSON.stringify([...fromUs].sort()),
    JSON.stringify(fromShopify));
  ok("nothing in, nothing out", phoneVariants("").length === 0 && phoneVariants(null).length === 0);
  ok("a string with no digits yields no match", phoneVariants("n/a").length === 0);
}

console.log("\n2. Order ids");
{
  ok("a bare numeric id reaches the gid we store",
    orderIdVariants(9001).includes("gid://shopify/Order/9001"));
  ok("a gid reaches the bare form", orderIdVariants("gid://shopify/Order/9001").includes("9001"));
  ok("empty is empty", orderIdVariants(null).length === 0);
}

/* ── 3. Finding the shopper ──────────────────────────────────────────────── */

console.log("\n3. Finding the shopper's leads");
{
  const { db } = seed();
  const byPhone = await findLeadIds(db, "shop_1", {
    customer: { phone: "+213551234567" },
  });
  ok("found by the phone Shopify sends", byPhone.join() === "lead_1", byPhone.join());

  const byOrder = await findLeadIds(db, "shop_1", { orders_to_redact: [9001] });
  ok("found by a numeric order id", byOrder.join() === "lead_1", byOrder.join());

  const both = await findLeadIds(db, "shop_1", {
    customer: { phone: "+213551234567" },
    orders_to_redact: [9001],
  });
  ok("the two paths do not double-count", both.length === 1, String(both.length));

  const none = await findLeadIds(db, "shop_1", { customer: { phone: "+213999999999" } });
  ok("a stranger matches nothing", none.length === 0);

  const wrongShop = await findLeadIds(db, "shop_2", { customer: { phone: "+213551234567" } });
  ok("another shop's redaction cannot reach these rows", wrongShop.length === 0);
}

/* ── 4. customers/data_request ───────────────────────────────────────────── */

console.log("\n4. customers/data_request");
{
  const { db } = seed();
  const payload = {
    customer: { id: 555, phone: "+213551234567" },
    orders_requested: [9001],
    data_request: { id: 777 },
  };
  await recordDataRequest(db, "shop_1", payload);
  await recordDataRequest(db, "shop_1", payload);
  ok("a redelivered request is one row, not two", db.dataRequest.rows.length === 1,
    String(db.dataRequest.rows.length));
  ok("the order ids are stored as strings",
    JSON.stringify(db.dataRequest.rows[0].orderIds) === '["9001"]');

  const exported = await buildCustomerExport(db, "shop_1", payload);
  ok("the export carries the address", exported.leads[0]?.address === "12 rue des Frères Aissiou");
  ok("the export carries the order", exported.orders[0]?.shopifyName === "#1008");
  ok("the export does not leak the other shopper", exported.leads.length === 1);

  const empty = await buildCustomerExport(db, "shop_1", { customer: { phone: "+213999999999" } });
  ok("a stranger exports nothing", empty.leads.length === 0 && empty.orders.length === 0);
}

/* ── 5. customers/redact ─────────────────────────────────────────────────── */

console.log("\n5. customers/redact");
{
  const { db, lead, other, shipment } = seed();
  await recordDataRequest(db, "shop_1", {
    customer: { id: 555, phone: "0551234567" },
    data_request: { id: 777 },
  });

  const result = await redactCustomer(db, "shop_1", {
    customer: { id: 555, phone: "+213551234567" },
    orders_to_redact: [9001],
  });

  ok("one lead was redacted", result.leads === 1, JSON.stringify(result));
  ok("the name is gone", lead.firstName === "" && lead.lastName === "");
  ok("the phone is gone", lead.phone === "");
  ok("the street is gone", lead.address === "");
  ok("the commune is gone", lead.commune === "");
  ok("the note is gone", lead.note === null);
  ok("the IP and user agent are gone", lead.ip === null && lead.userAgent === null);
  ok("the idempotency key is gone", lead.idempotencyKey === null);
  ok("it is stamped as redacted", lead.redactedAt instanceof Date);

  ok("the money survives", lead.total === 5100 && lead.subtotal === 4500);
  ok("the wilaya survives, so the merchant's report still adds up",
    lead.wilayaName === "Alger" && lead.wilayaCode === "16");
  ok("the products survive", Array.isArray(lead.items) && lead.items.length === 1);
  ok("the order row survives", db.codOrder.rows.length === 1);

  ok("what was posted to the carrier is gone", shipment.request === null);
  ok("what the carrier answered is gone", shipment.response === null);
  ok("an error message quoting the phone is gone", shipment.lastError === null);
  ok("the tracking number survives — it identifies a parcel, not a person",
    shipment.trackingNumber === "TRX-778");
  ok("one shipment was scrubbed", result.shipments === 1, JSON.stringify(result));

  ok("the open data request for that shopper is gone", db.dataRequest.rows.length === 0);

  ok("the other shopper is untouched",
    other.firstName === "Amina" && other.phone === "0770000000" && other.redactedAt === null);

  const stamp = lead.redactedAt;
  const again = await redactCustomer(db, "shop_1", {
    customer: { id: 555, phone: "+213551234567" },
    orders_to_redact: [9001],
  });
  ok("a retry redacts the same row again without error", again.leads === 1);
  ok("a retry leaves the same emptied fields", lead.firstName === "" && lead.phone === "");
  ok("a retry does not resurrect anything", lead.total === 5100 && stamp instanceof Date);

  /* Which lookup can still reach a redacted row is the point here. The phone
     was emptied, so a phone-only request finds nothing — correctly, because
     nothing linking that number to anything is left. The order id survives
     redaction, so a request naming one still reaches the row, and what it
     reports is the erasure rather than a set of blank fields that would read
     as a broken record. */
  const byPhone = await buildCustomerExport(db, "shop_1", {
    customer: { phone: "+213551234567" },
  });
  ok("a redacted shopper is no longer reachable by phone", byPhone.leads.length === 0);

  const byOrder = await buildCustomerExport(db, "shop_1", { orders_requested: [9001] });
  ok("but the order still reaches the row",
    byOrder.leads.length === 1, JSON.stringify(byOrder.leads));
  ok("and it reports the erasure rather than blanks",
    byOrder.leads[0]?.redactedAt instanceof Date && !("address" in (byOrder.leads[0] ?? {})));
}

console.log("\n6. customers/redact for a shopper we never had");
{
  const { db } = seed();
  const result = await redactCustomer(db, "shop_1", { customer: { phone: "+213600000000" } });
  ok("nothing matched and nothing threw", result.leads === 0);
  ok("no lead was touched", db.lead.rows.every((l: Row) => l.redactedAt === null));
}

/* ── 7. shop/redact ──────────────────────────────────────────────────────── */

console.log("\n7. shop/redact");
{
  const { db, rawSql } = seed();
  const result = await redactShop(db, "test-shop.myshopify.com");

  ok("the shop row is gone", db.shop.rows.length === 0);
  ok("its session — and the Admin token in it — is gone",
    !db.session.rows.some((s: Row) => s.shop === "test-shop.myshopify.com"));
  ok("another store's session is untouched",
    db.session.rows.some((s: Row) => s.shop === "another.myshopify.com"));
  ok("both carrier secrets were deleted from Vault", result.secrets === 2, JSON.stringify(result));
  ok("a carrier that was never linked is not a null delete",
    rawSql.length === 2 && !rawSql.includes(null as any));
  ok("the secrets deleted are the ones the carriers pointed at",
    rawSql[0] === "11111111-1111-1111-1111-111111111111" &&
    rawSql[1] === "22222222-2222-2222-2222-222222222222");
}

console.log("\n8. shop/redact is safe to retry and safe to fail");
{
  const { db } = seed();
  await redactShop(db, "test-shop.myshopify.com");
  const again = await redactShop(db, "test-shop.myshopify.com");
  ok("a second delivery does not throw", again.shop === false);

  const broken = seed({ vaultFails: true });
  const result = await redactShop(broken.db, "test-shop.myshopify.com");
  ok("a Vault that is not there does not block the deletion",
    result.shop === true && broken.db.shop.rows.length === 0);
  ok("and the failure is reported rather than hidden", result.secrets === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
