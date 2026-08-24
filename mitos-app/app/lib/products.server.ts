/**
 * What each product did after the call.
 *
 * ── Why this is not a product table ──────────────────────────────────────
 *
 * There is no `Product` model in this schema and there should not be. The
 * catalogue belongs to Shopify: it is edited there, translated there, and goes
 * out of stock there. A copy would be wrong within a day and nobody would know
 * which of the two to believe. So the product list on that screen is fetched
 * live from the Admin API, and the only thing stored here is the id.
 *
 * ── What we know that Shopify does not ───────────────────────────────────
 *
 * Shopify can already list products and show what sold. What it cannot show is
 * the thing a cash-on-delivery merchant actually lives or dies by: of the
 * orders a product produced, how many survived the phone call, and how many
 * came back. A product that sells fifty and has forty refused at the door is
 * losing money on every one of them — the merchant pays the return leg — and
 * on Shopify's own reports it looks like a bestseller.
 *
 * That number lives in our orders, so it is computed here and joined to
 * Shopify's catalogue in the screen.
 *
 * ── On the raw query ─────────────────────────────────────────────────────
 *
 * `Lead.items` is JSON — one row per order holding the lines. Counting orders
 * per product means unrolling that array, which Prisma cannot express, so this
 * is one `$queryRaw`. Two things in it are deliberate:
 *
 *   `count(DISTINCT o.id)`, not `count(*)`. A shopper ordering two variants of
 *   the same product is one order for that product, not two, and counting it
 *   twice would quietly inflate every rate on the screen.
 *
 *   `shopId` is bound, never interpolated. It is the parameter that decides
 *   whose customers these are.
 */

import type { PrismaClient } from "@prisma/client";
import type { ProductStats } from "./products";

/* The rules for reading these numbers are in products.ts, not here: the table
   renders them in the browser. Re-exported so a caller has one import. */
export { EMPTY_STATS, lossRate, lossTone, MIN_DECIDED, type ProductStats } from "./products";

type Row = {
  product_id: string;
  orders: number;
  pending: number;
  confirmed: number;
  delivered: number;
  lost: number;
  delivered_value: number;
};

/**
 * One row per product this shop has ever sold, keyed by Shopify product GID.
 *
 * Returned as a Map so the screen can look each Shopify product up in constant
 * time — the catalogue page is the outer loop, and it is the thing that
 * paginates.
 */
export async function statsByProduct(
  prisma: PrismaClient,
  shopId: string,
): Promise<Map<string, ProductStats>> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT item->>'productId' AS product_id,
           count(DISTINCT o.id)::int AS orders,
           count(DISTINCT o.id) FILTER (WHERE o.status = 'PENDING')::int AS pending,
           count(DISTINCT o.id) FILTER (WHERE o.status = 'CONFIRMED')::int AS confirmed,
           count(DISTINCT o.id) FILTER (WHERE o.status = 'DELIVERED')::int AS delivered,
           count(DISTINCT o.id) FILTER (WHERE o.status IN ('CANCELLED','RETURNED'))::int AS lost,
           COALESCE(
             sum((item->>'lineTotal')::int) FILTER (WHERE o.status = 'DELIVERED'), 0
           )::int AS delivered_value
      FROM "CodOrder" o
      JOIN "Lead" l ON l.id = o."leadId"
      CROSS JOIN LATERAL jsonb_array_elements(l.items) AS item
     WHERE o."shopId" = ${shopId}
       AND item->>'productId' IS NOT NULL
     GROUP BY 1
  `;

  return new Map(
    rows.map((r) => [
      r.product_id,
      {
        orders: r.orders,
        pending: r.pending,
        confirmed: r.confirmed,
        delivered: r.delivered,
        lost: r.lost,
        deliveredValue: r.delivered_value,
      },
    ]),
  );
}


