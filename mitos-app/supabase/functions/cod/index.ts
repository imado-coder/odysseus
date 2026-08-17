/**
 * POST /functions/v1/cod — the endpoint the theme's order form posts to.
 *
 * ── Why this exists next to app/routes/api.cod.tsx ───────────────────────
 *
 * That route is the canonical implementation and stays the canonical one.
 * This is a port of it to Deno, running on Supabase's own infrastructure,
 * for one reason: it needs no secret to be handed to it. The database URL is
 * injected by the platform, and the Shopify token is read from the Session
 * table — so nothing has to be carried into a deployment payload, and there
 * is no configuration step between writing this and orders arriving.
 *
 * It does not, despite what an earlier version of this comment claimed, run
 * in the database's region — Edge Functions run nearest the caller, measured
 * as `x-sb-edge-region: us-east-1` for a call from the United States. For an
 * Algerian shopper it starts in Europe and the hop to Paris is short, but it
 * is not free. The `x-region` header can pin it if that ever shows up in a
 * measurement.
 *
 * The cost is that the order logic now exists twice. Any change to
 * validation, pricing or order creation has to be made in both, and the
 * comments below mark each place the two must agree. If the Vercel app ever
 * gets its environment configured, this can be deleted and the theme pointed
 * back at /api/cod — nothing else depends on it.
 *
 * ── What it guarantees ───────────────────────────────────────────────────
 *
 * This is public: it is called by JavaScript on a customer's phone, so it has
 * no session and cannot trust anything in the request. Three rules follow.
 *
 *   The shop is identified by domain and looked up in our database — an
 *   unknown or uninstalled shop is rejected before any work happens.
 *
 *   Money is recomputed here from the merchant's own shipping table and the
 *   variants' real prices. The totals the storefront sends are read only to
 *   notice a mismatch worth logging, never to charge.
 *
 *   The lead is written before the Shopify order is attempted, so a failure
 *   at Shopify still leaves the merchant a customer to call back. That is the
 *   whole point of a cash-on-delivery funnel.
 */

import postgres from "npm:postgres@3.4.5";

const SHOPIFY_API_VERSION = "2026-10";

/* GET is listed because the storefront also asks this endpoint for the
   shipping table. That request is simple enough not to preflight today, but a
   method missing from this list is a failure waiting for the day someone adds
   a header to it. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

/* One pool per isolate, reused while the isolate stays warm. Serverless
   invocations that each opened their own connection would exhaust Postgres. */
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false,
  max: 2,
  idle_timeout: 20,
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/* ── Validation — must match app/lib/validate.server.ts ─────────────────── */

/* Algerian numbering plan: mobiles are 0 + 5/6/7 + 8 digits (Djezzy, Mobilis,
   Ooredoo), landlines are 0 + area code 2-4 + 7 digits. A bare `^0\d{8,9}$`
   would wave through 08…/09…, which no operator issues. */
const MOBILE = /^0[5-7]\d{8}$/;
const LANDLINE = /^0[2-4]\d{7}$/;

function str(v: unknown, max = 200) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Customers type their number every way there is: +213, 00213, spaces, dots,
 * dashes. All of those mean the same person, so they are folded to the local
 * 0-prefixed form before validation rather than rejected.
 */
function normalizePhone(input: string) {
  let p = input.replace(/[\s.\-()]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("213")) p = "0" + p.slice(3);
  return p;
}

/**
 * Verified against a live store: `orderCreate` rejects `0551234567` with
 * "Order Phone is invalid" and accepts `+213551234567`. Local numbers are
 * what the merchant dials, so they stay local in our own records and are
 * converted only at the Shopify boundary.
 */
function toE164(local: string) {
  const p = normalizePhone(local);
  return p.startsWith("0") ? "+213" + p.slice(1) : p;
}

/** A bare numeric id becomes a GID; a GID passes through untouched. */
function toVariantGid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/ProductVariant/${id}`;
}

type CleanLead = {
  firstName: string;
  lastName: string;
  phone: string;
  wilayaCode: string;
  commune: string;
  address: string;
  delivery: "HOME" | "DESK";
  items: { variantId: string; quantity: number }[];
};

function validateLead(raw: Record<string, unknown>) {
  const errors: Record<string, string> = {};

  const firstName = str(raw.prenom ?? raw.firstName, 60);
  const lastName = str(raw.nom ?? raw.lastName, 60);
  const address = str(raw.adresse ?? raw.address, 400);
  const commune = str(raw.commune, 120);
  const wilayaCode = str(raw.wilaya ?? raw.wilayaCode, 2).padStart(2, "0");
  const phone = normalizePhone(str(raw.telephone ?? raw.phone, 24));

  if (!firstName) errors.firstName = "required";
  if (!lastName) errors.lastName = "required";
  if (!address) errors.address = "required";
  if (!commune) errors.commune = "required";
  if (!/^\d{2}$/.test(wilayaCode) || +wilayaCode < 1 || +wilayaCode > 58) {
    errors.wilaya = "invalid";
  }
  if (!MOBILE.test(phone) && !LANDLINE.test(phone)) {
    errors.phone = "invalid";
  }

  const delivery =
    str(raw.livraison ?? raw.delivery).toUpperCase() === "DESK"
      ? "DESK"
      : "HOME";

  /* Items arrive either as a cart array or as a single product page order. */
  let items: { variantId: string; quantity: number }[] = [];
  if (Array.isArray(raw.items)) {
    items = raw.items
      // deno-lint-ignore no-explicit-any
      .map((i: any) => ({
        variantId: str(i?.variantId ?? i?.variant_id, 80),
        quantity: Math.max(
          1,
          Math.min(99, parseInt(String(i?.qty ?? i?.quantity ?? 1), 10) || 1),
        ),
      }))
      .filter((i) => i.variantId);
  } else {
    const variantId = str(raw.variant_id ?? raw.variantId, 80);
    const quantity = Math.max(
      1,
      Math.min(
        99,
        parseInt(String(raw.quantite ?? raw.quantity ?? 1), 10) || 1,
      ),
    );
    if (variantId) items = [{ variantId, quantity }];
  }

  if (!items.length) errors.items = "required";

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    lead: ok
      ? ({
        firstName,
        lastName,
        phone,
        wilayaCode,
        commune,
        address,
        delivery,
        items,
      } as CleanLead)
      : null,
  };
}

/* ── Shopify — must match app/lib/order.server.ts ───────────────────────── */

async function shopifyGraphql(
  domain: string,
  token: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!res.ok) {
    throw new Error(`shopify_http_${res.status}`);
  }
  return await res.json();
}

/**
 * How the wilaya reaches the courier.
 *
 * Measured against a live store rather than guessed:
 *
 *   `provinceCode: "16"` is accepted but stored as `province: "16"` with a
 *   null provinceCode — Shopify carries no subdivisions for Algeria, so the
 *   ISO code just becomes an unreadable string on the packing slip. The name
 *   is what belongs in `province`, deprecated field or not.
 *
 *   Shopify's DZ address format then drops the province from the formatted
 *   address entirely, and for an Algerian courier that is the one line they
 *   route on — so it is repeated into address2, which the formatter keeps.
 */
function buildAddress(d: {
  firstName: string;
  lastName: string;
  address: string;
  commune: string;
  wilayaCode: string;
  wilayaName: string;
  phone: string;
}) {
  return {
    firstName: d.firstName,
    lastName: d.lastName,
    address1: d.address,
    address2: `Wilaya ${d.wilayaCode} — ${d.wilayaName}`,
    city: d.commune,
    province: d.wilayaName,
    countryCode: "DZ",
    phone: toE164(d.phone),
  };
}

const ORDER_CREATE = `#graphql
  mutation CreateCodOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order { id name }
      userErrors { field message }
    }
  }
`;

async function createCodOrder(
  domain: string,
  token: string,
  draft: {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    commune: string;
    wilayaCode: string;
    wilayaName: string;
    items: { variantId: string; quantity: number }[];
    shipping: number;
    currency: string;
    tag: string;
    note: string;
  },
) {
  const address = buildAddress(draft);

  const body = await shopifyGraphql(domain, token, ORDER_CREATE, {
    order: {
      currency: draft.currency,
      /* Cash on delivery is an unpaid order that is expected to be paid, not
         an order with no financial state. Left unset, Shopify reports
         displayFinancialStatus as null and the admin shows a blank column —
         the merchant cannot tell a pending order from a broken one, and no
         "unpaid" filter or automation matches it. */
      financialStatus: "PENDING",
      phone: toE164(draft.phone),
      tags: [draft.tag],
      note: draft.note || undefined,
      billingAddress: address,
      shippingAddress: address,
      lineItems: draft.items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
      })),
      shippingLines: draft.shipping
        ? [{
          title: "Livraison",
          priceSet: {
            shopMoney: {
              amount: draft.shipping,
              currencyCode: draft.currency,
            },
          },
        }]
        : [],
    },
    options: {
      /* A cash-on-delivery customer is phoned, not emailed, and many have no
         email address at all — so nothing is sent automatically. */
      sendReceipt: false,
      sendFulfillmentReceipt: false,
    },
  });

  const result = body?.data?.orderCreate;
  const order = result?.order ?? null;
  const userErrors = (result?.userErrors ?? []) as {
    field?: string[];
    message: string;
  }[];

  if (!order || userErrors.length) {
    const message = userErrors
      .map((e) => `${e.field?.join(".") ?? "order"}: ${e.message}`)
      .join("; ") ||
      JSON.stringify(body?.errors ?? "orderCreate returned no order");
    throw new Error(message);
  }

  return order as { id: string; name: string };
}

/* ── Handler — must match app/routes/api.cod.tsx ────────────────────────── */

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method === "GET") {
    /* With a shop, this is the storefront asking what delivery costs, so that
       the price it quotes is the price this endpoint will charge. Without one,
       it is a person or a monitor asking whether the thing is alive. */
    const shop = new URL(request.url).searchParams.get("shop");
    return shop
      ? await rates(shop.toLowerCase())
      : json({ ok: true, service: "mitos-cod" });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  /* Anything that escapes must still come back as JSON with CORS headers.
     An unhandled throw returns a body a storefront fetch() cannot read the
     status of — the customer would see a silent failure. */
  try {
    return await handle(request);
  } catch (e) {
    console.error("cod unhandled", e);
    return json({ error: "server_error" }, 500);
  }
});

async function handle(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const domain = String(payload.shop || "").toLowerCase();
  if (!domain.endsWith(".myshopify.com")) {
    return json({ error: "unknown_shop" }, 400);
  }

  const [shop] = await sql`
    SELECT s.id, s.currency, s."uninstalledAt",
           st."autoCreateOrder", st."orderTag",
           st."defaultHomeRate", st."defaultDeskRate"
      FROM "Shop" s
      LEFT JOIN "ShopSettings" st ON st."shopId" = s.id
     WHERE s.domain = ${domain}
  `;

  if (!shop || shop.uninstalledAt) {
    return json({ error: "unknown_shop" }, 404);
  }

  const { ok, errors, lead } = validateLead(payload);
  if (!ok || !lead) {
    return json({ error: "validation_failed", fields: errors }, 422);
  }

  /* A double-tap on a slow connection must not become two orders. */
  const idempotencyKey = String(payload.idempotencyKey || "") ||
    `${lead.phone}:${
      lead.items.map((i) => `${i.variantId}x${i.quantity}`).join(",")
    }`;

  const [existing] = await sql`
    SELECT l.id, o."shopifyName"
      FROM "Lead" l
      LEFT JOIN "CodOrder" o ON o."leadId" = l.id
     WHERE l."shopId" = ${shop.id} AND l."idempotencyKey" = ${idempotencyKey}
  `;

  if (existing) {
    return json({
      ok: true,
      duplicate: true,
      orderName: existing.shopifyName ?? null,
    });
  }

  /* Shipping comes from the merchant's table, never from the payload. */
  const [rate] = await sql`
    SELECT "homeRate", "deskRate"
      FROM "ShippingRate"
     WHERE "shopId" = ${shop.id} AND "wilayaCode" = ${lead.wilayaCode}
  `;

  const shipping = lead.delivery === "DESK"
    ? rate?.deskRate ?? shop.defaultDeskRate ?? 350
    : rate?.homeRate ?? shop.defaultHomeRate ?? 600;

  const [wilaya] = await sql`
    SELECT "nameFr" FROM "Wilaya" WHERE code = ${lead.wilayaCode}
  `;
  const wilayaName = wilaya?.nameFr ?? lead.wilayaCode;

  const [session] = await sql`
    SELECT "accessToken" FROM "Session"
     WHERE shop = ${domain} AND "isOnline" = false
     LIMIT 1
  `;

  /* Prices come from Shopify, so a tampered payload cannot change what is
     charged. The variant lookup doubles as an existence check.

     But Shopify being unreachable — a revoked token, an outage, a missing
     session row — must not cost the merchant the customer. So this whole
     section is allowed to fail: if it does, the lead is still saved, flagged
     as unpriced, and surfaced in the dashboard as needing a call. */
  const variantGids = lead.items.map((i) => toVariantGid(i.variantId));

  // deno-lint-ignore no-explicit-any
  let nodes: any[] = [];
  let shopifyError: string | null = null;

  if (!session?.accessToken) {
    shopifyError = "no_offline_session";
  } else {
    try {
      const body = await shopifyGraphql(
        domain,
        session.accessToken,
        `#graphql
          query VariantPrices($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on ProductVariant { id price title product { id title } }
            }
          }`,
        { ids: variantGids },
      );
      nodes = (body?.data?.nodes ?? []).filter(Boolean);
    } catch (e) {
      shopifyError = e instanceof Error ? e.message : "shopify_unreachable";
    }
  }

  /* A variant that does not exist is the customer's problem to fix now, so it
     is still rejected outright — but only when Shopify actually answered. */
  if (!shopifyError && nodes.length !== variantGids.length) {
    return json({ error: "variant_not_found" }, 422);
  }

  const pricesVerified = !shopifyError;

  const priceOf = new Map<string, number>(
    nodes.map((n) => [n.id, Math.round(Number(n.price))]),
  );

  /* Only used when Shopify is unreachable: the storefront's own figure, kept
     so the merchant has something to read out on the call. It is never used
     to charge — pricesVerified marks it as unconfirmed. */
  const claimed = new Map<string, number>(
    (Array.isArray(payload.items) ? payload.items : [])
      // deno-lint-ignore no-explicit-any
      .map((i: any): [string, number] => [
        toVariantGid(String(i?.variantId ?? i?.variant_id ?? "")),
        Math.max(0, Math.round(Number(i?.price)) || 0),
      ])
      .filter(([, price]) => price > 0),
  );

  const items = lead.items.map((i) => {
    const gid = toVariantGid(i.variantId);
    const node = nodes.find((n) => n.id === gid);
    return {
      variantId: gid,
      productId: node?.product?.id ?? null,
      title: node?.product?.title ?? "",
      option: node?.title ?? "",
      price: pricesVerified ? priceOf.get(gid) ?? 0 : claimed.get(gid) ?? 0,
      qty: i.quantity,
    };
  });

  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  const total = subtotal + shipping;

  const leadId = crypto.randomUUID();

  await sql`
    INSERT INTO "Lead" (
      id, "shopId", "firstName", "lastName", phone,
      "wilayaCode", "wilayaName", commune, address, delivery,
      items, subtotal, shipping, total, "pricesVerified",
      source, "userAgent", ip, "idempotencyKey"
    ) VALUES (
      ${leadId}, ${shop.id}, ${lead.firstName}, ${lead.lastName}, ${lead.phone},
      ${lead.wilayaCode}, ${wilayaName}, ${lead.commune}, ${lead.address},
      ${lead.delivery}::"DeliveryMethod",
      ${sql.json(items)}, ${subtotal}, ${shipping}, ${total}, ${pricesVerified},
      ${String(payload.source || "product")},
      ${request.headers.get("user-agent")?.slice(0, 300) ?? null},
      ${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null},
      ${idempotencyKey}
    )
  `;

  const orderId = () => crypto.randomUUID();

  /* Shopify never answered. The customer is saved; the merchant calls. */
  if (shopifyError) {
    await sql`
      INSERT INTO "CodOrder" (id, "shopId", "leadId", "createFailed", "createError", "updatedAt")
      VALUES (${orderId()}, ${shop.id}, ${leadId}, true, ${
      shopifyError.slice(0, 500)
    }, now())
    `;
    return json({ ok: true, pendingReview: true, total });
  }

  /* The merchant can choose to hold leads for a call before an order exists. */
  if (shop.autoCreateOrder === false) {
    await sql`
      INSERT INTO "CodOrder" (id, "shopId", "leadId", "updatedAt")
      VALUES (${orderId()}, ${shop.id}, ${leadId}, now())
    `;
    return json({ ok: true, held: true, total });
  }

  try {
    const order = await createCodOrder(domain, session!.accessToken, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      address: lead.address,
      commune: lead.commune,
      wilayaCode: lead.wilayaCode,
      wilayaName,
      items: lead.items.map((i) => ({
        variantId: toVariantGid(i.variantId),
        quantity: i.quantity,
      })),
      shipping,
      currency: shop.currency,
      tag: shop.orderTag ?? "MITOS-COD",
      note: `MITOS — ${
        lead.delivery === "DESK" ? "bureau" : "domicile"
      } — ${lead.commune}, ${wilayaName}`,
    });

    await sql`
      INSERT INTO "CodOrder" (id, "shopId", "leadId", "shopifyOrderId", "shopifyName", "updatedAt")
      VALUES (${orderId()}, ${shop.id}, ${leadId}, ${order.id}, ${order.name}, now())
    `;

    return json({ ok: true, orderName: order.name, total });
  } catch (e) {
    /* The lead survives. The merchant sees the failure in the dashboard and
       can still call the customer — losing the sale to an API error is the
       one outcome this endpoint exists to prevent. */
    const detail = e instanceof Error ? e.message.slice(0, 500) : "unknown";
    console.error("orderCreate failed", detail);

    await sql`
      INSERT INTO "CodOrder" (id, "shopId", "leadId", "createFailed", "createError", "updatedAt")
      VALUES (${orderId()}, ${shop.id}, ${leadId}, true, ${detail}, now())
    `;

    return json({ ok: true, pendingReview: true, total });
  }
}

/**
 * The merchant's shipping table, for the storefront to quote from.
 *
 * This endpoint recomputes shipping from this same table on every order and
 * ignores the figures the storefront sends. If the theme quoted from its own
 * setting instead, the two could drift and a shopper would be quoted one price
 * and charged another — so the theme asks here, and the setting is only its
 * fallback for when this call fails.
 *
 * Public, like the rest of this function: a delivery price is on the page
 * already. Nothing here is per-customer.
 */
async function rates(domain: string) {
  const [shop] = await sql`
    SELECT s.id, st."defaultHomeRate", st."defaultDeskRate"
      FROM "Shop" s
      LEFT JOIN "ShopSettings" st ON st."shopId" = s.id
     WHERE s.domain = ${domain} AND s."uninstalledAt" IS NULL
  `;

  if (!shop) return json({ error: "unknown_shop" }, 404);

  const rows = await sql`
    SELECT "wilayaCode", "homeRate", "deskRate"
      FROM "ShippingRate"
     WHERE "shopId" = ${shop.id} AND enabled = true
     ORDER BY "wilayaCode"
  `;

  /* Shaped as the theme already reads it: keyed by wilaya code, [home, desk].
     Matching the existing shape means the storefront needs no new parsing —
     the table simply arrives from here instead of from a setting. */
  const table: Record<string, [number, number]> = {};
  for (const r of rows) {
    table[r.wilayaCode] = [r.homeRate, r.deskRate];
  }

  return json({
    ok: true,
    rates: table,
    fallback: [
      shop.defaultHomeRate ?? 600,
      shop.defaultDeskRate ?? 350,
    ],
  });
}
