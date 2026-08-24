/**
 * How to read a product's record after the call.
 *
 * Deliberately NOT a `.server` module — the table renders these in the
 * browser, and a component that imports a `.server` file fails the build.
 * The query that produces the numbers lives in products.server.ts; the rules
 * for interpreting them live here, where both sides can reach them.
 */

export type ProductStats = {
  /** Orders that contained this product at all. */
  orders: number;
  /** Still waiting for the call. */
  pending: number;
  /** Survived the call. */
  confirmed: number;
  /** Reached the customer and was paid for. */
  delivered: number;
  /** Cancelled or returned — the ones that cost the merchant the return leg. */
  lost: number;
  /** What the delivered ones were worth, in the shop's currency. */
  deliveredValue: number;
};

export const EMPTY_STATS: ProductStats = {
  orders: 0,
  pending: 0,
  confirmed: 0,
  delivered: 0,
  lost: 0,
  deliveredValue: 0,
};

/** Below this many decided orders, a rate is noise rather than a signal. */
export const MIN_DECIDED = 3;

/**
 * The share of decided orders that were lost.
 *
 * Only decided orders count. An order still waiting to be called is not a
 * failure yet, and counting it as one would make every product look terrible
 * on its first day. Returns null when nothing has been decided — there is no
 * rate yet, and printing 0 % would be a claim we cannot make.
 */
export function lossRate(s: ProductStats): number | null {
  const decided = s.delivered + s.lost;
  if (decided === 0) return null;
  return s.lost / decided;
}

/**
 * How loudly to say it.
 *
 * A rate is only worth flagging once there is enough behind it to mean
 * something: below MIN_DECIDED, a single refusal would paint a good product as
 * failing.
 */
export function lossTone(s: ProductStats): "critical" | "warning" | "neutral" {
  const rate = lossRate(s);
  if (rate == null || s.delivered + s.lost < MIN_DECIDED) return "neutral";
  if (rate >= 0.4) return "critical";
  if (rate >= 0.2) return "warning";
  return "neutral";
}
