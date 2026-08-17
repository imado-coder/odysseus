/**
 * POST /api/cod — the endpoint the theme's order form posts to.
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
 *   The lead is written before the Shopify order is attempted, so a failure at
 *   Shopify still leaves the merchant a customer to call back. That is the
 *   whole point of a cash-on-delivery funnel.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { validateLead, toVariantGid } from "../lib/validate.server";
import { createCodOrder } from "../lib/order.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/**
 * GET with a shop is the storefront asking what delivery costs.
 *
 * It matters that this exists: the action below recomputes shipping from the
 * merchant's own table and ignores whatever the storefront sent. If the theme
 * quoted from its own setting instead, the two could drift and a shopper would
 * be quoted one price and charged another — and the merchant would have to
 * remember to edit two places to change one number.
 *
 * Kept in step with supabase/functions/cod/index.ts.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const domain = new URL(request.url).searchParams.get("shop")?.toLowerCase();
  if (!domain) return new Response(null, { status: 204, headers: CORS });

  const shop = await prisma.shop.findFirst({
    where: { domain, uninstalledAt: null },
    include: {
      settings: true,
      rates: {
        where: {
          enabled: true,
          /* The default carrier's price, or the shop's own list. A rate
             belonging to some other carrier is not what this shopper will be
             charged, so it is not what they are shown. */
          OR: [
            { carrierId: null },
            { carrier: { enabled: true, isDefault: true } },
          ],
        },
        /* Carrier rows last, so the loop below overwrites the shop's own
           figure with the carrier's wherever the carrier has priced it. */
        orderBy: { carrierId: "asc" },
      },
    },
  });

  if (!shop) return json({ error: "unknown_shop" }, 404);

  /* Shaped as the theme already reads it: keyed by wilaya code, [home, desk].
     Matching the existing shape means the storefront needs no new parsing —
     the table simply arrives from here instead of from a setting. */
  const rates: Record<string, [number, number]> = {};
  for (const r of shop.rates) {
    rates[r.wilayaCode] = [r.homeRate, r.deskRate];
  }

  return json({
    ok: true,
    rates,
    fallback: [
      shop.settings?.defaultHomeRate ?? 600,
      shop.settings?.defaultDeskRate ?? 350,
    ],
  });
}

export async function action(args: ActionFunctionArgs) {
  /* Anything that escapes must still come back as JSON with CORS headers.
     React Router's default error response is HTML without them, which a
     storefront fetch() cannot even read the status of — the customer would
     see a silent failure. */
  try {
    return await handle(args);
  } catch (e) {
    console.error("api.cod unhandled", e);
    return json({ error: "server_error" }, 500);
  }
}

async function handle({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

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

  const shop = await prisma.shop.findUnique({
    where: { domain },
    include: { settings: true },
  });

  if (!shop || shop.uninstalledAt) {
    return json({ error: "unknown_shop" }, 404);
  }

  const { ok, errors, lead } = validateLead(payload);
  if (!ok || !lead) {
    return json({ error: "validation_failed", fields: errors }, 422);
  }

  /* A double-tap on a slow connection must not become two orders. */
  const idempotencyKey =
    String(payload.idempotencyKey || "") ||
    `${lead.phone}:${lead.items.map((i) => `${i.variantId}x${i.quantity}`).join(",")}`;

  const existing = await prisma.lead.findUnique({
    where: { shopId_idempotencyKey: { shopId: shop.id, idempotencyKey } },
    include: { order: true },
  });

  if (existing) {
    return json({
      ok: true,
      duplicate: true,
      orderName: existing.order?.shopifyName ?? null,
    });
  }

  /* Shipping comes from the merchant's table, never from the payload. */
  /* The same resolution the quote used, so the shopper is charged the number
     they were shown. Carrier first, then the shop's own list. */
  const rate = await prisma.shippingRate.findFirst({
    where: {
      shopId: shop.id,
      wilayaCode: lead.wilayaCode,
      enabled: true,
      OR: [
        { carrierId: null },
        { carrier: { enabled: true, isDefault: true } },
      ],
    },
    orderBy: { carrierId: "desc" },
  });

  const shipping =
    lead.delivery === "DESK"
      ? rate?.deskRate ?? shop.settings?.defaultDeskRate ?? 350
      : rate?.homeRate ?? shop.settings?.defaultHomeRate ?? 600;

  const wilaya = await prisma.wilaya.findUnique({
    where: { code: lead.wilayaCode },
  });

  /* Prices come from Shopify, so a tampered payload cannot change what is
     charged. The variant lookup doubles as an existence check.

     But Shopify being unreachable — a revoked token, an outage, a lost session
     row — must not cost the merchant the customer. So this whole section is
     allowed to fail: if it does, the lead is still saved, flagged as unpriced,
     and surfaced in the dashboard as needing a call. */
  const variantGids = lead.items.map((i) => toVariantGid(i.variantId));

  let admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"] | null =
    null;
  let nodes: any[] = [];
  let shopifyError: string | null = null;

  try {
    admin = (await unauthenticated.admin(domain)).admin;

    const priced = await admin.graphql(
      `#graphql
        query VariantPrices($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant { id price title product { id title } }
          }
        }`,
      { variables: { ids: variantGids } },
    );

    const priceBody = await priced.json();
    nodes = (priceBody?.data?.nodes ?? []).filter(Boolean);
  } catch (e) {
    shopifyError = e instanceof Error ? e.message : "shopify_unreachable";
  }

  /* A variant that does not exist is the customer's problem to fix now, so it
     is still rejected outright — but only when Shopify actually answered. */
  if (!shopifyError && nodes.length !== variantGids.length) {
    return json({ error: "variant_not_found" }, 422);
  }

  const pricesVerified = !shopifyError;

  const priceOf = new Map<string, number>(
    nodes.map((n: { id: string; price: string }) => [
      n.id,
      Math.round(Number(n.price)),
    ]),
  );

  /* Only used when Shopify is unreachable: the storefront's own figure, kept
     so the merchant has something to read out on the call. It is never used to
     charge — pricesVerified marks it as unconfirmed. */
  const claimed = new Map<string, number>(
    (Array.isArray(payload.items) ? payload.items : [])
      .map(
        (i: any): [string, number] => [
          toVariantGid(String(i?.variantId ?? i?.variant_id ?? "")),
          Math.max(0, Math.round(Number(i?.price)) || 0),
        ],
      )
      .filter(([, price]) => price > 0),
  );

  const items = lead.items.map((i) => {
    const gid = toVariantGid(i.variantId);
    const node = nodes.find((n: { id: string }) => n.id === gid);
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

  const record = await prisma.lead.create({
    data: {
      shopId: shop.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      phone: lead.phone,
      wilayaCode: lead.wilayaCode,
      wilayaName: wilaya?.nameFr ?? lead.wilayaCode,
      commune: lead.commune,
      address: lead.address,
      delivery: lead.delivery,
      items,
      subtotal,
      shipping,
      total,
      pricesVerified,
      source: String(payload.source || "product"),
      userAgent: request.headers.get("user-agent")?.slice(0, 300),
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
      idempotencyKey,
    },
  });

  /* Shopify never answered. The customer is saved; the merchant calls. */
  if (!admin) {
    await prisma.codOrder.create({
      data: {
        shopId: shop.id,
        leadId: record.id,
        createFailed: true,
        createError: (shopifyError ?? "shopify_unreachable").slice(0, 500),
      },
    });
    return json({ ok: true, pendingReview: true });
  }

  /* The merchant can choose to hold leads for a call before an order exists. */
  if (shop.settings && shop.settings.autoCreateOrder === false) {
    await prisma.codOrder.create({
      data: { shopId: shop.id, leadId: record.id },
    });
    return json({ ok: true, held: true });
  }

  try {
    const order = await createCodOrder(admin, {
      phone: lead.phone,
      firstName: lead.firstName,
      lastName: lead.lastName,
      address: lead.address,
      commune: lead.commune,
      wilayaCode: lead.wilayaCode,
      wilayaName: wilaya?.nameFr ?? lead.wilayaCode,
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.qty })),
      shipping,
      currency: shop.currency,
      tag: shop.settings?.orderTag ?? "MITOS-COD",
      note: `MITOS — ${lead.delivery === "DESK" ? "bureau" : "domicile"} — ${lead.commune}, ${wilaya?.nameFr ?? lead.wilayaCode}`,
    });

    await prisma.codOrder.create({
      data: {
        shopId: shop.id,
        leadId: record.id,
        shopifyOrderId: order.id,
        shopifyName: order.name,
      },
    });

    return json({ ok: true, orderName: order.name, total });
  } catch (e) {
    /* The lead survives. The merchant sees the failure in the dashboard and
       can still call the customer — losing the sale to an API error is the one
       outcome this endpoint exists to prevent. */
    await prisma.codOrder.create({
      data: {
        shopId: shop.id,
        leadId: record.id,
        createFailed: true,
        createError: e instanceof Error ? e.message.slice(0, 500) : "unknown",
      },
    });

    return json({ ok: true, pendingReview: true, total });
  }
}
