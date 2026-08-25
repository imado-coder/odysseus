/**
 * What MITOS costs, and how the app decides whether a shop may use it.
 *
 * ── This file is imported by the browser ─────────────────────────────────
 *
 * The pricing screen renders these numbers, so nothing here may import a
 * `.server` module or anything out of `@shopify/shopify-api` — that library is
 * server-only and pulling it into a component fails the build in a way `tsc`
 * does not catch. The Shopify billing config is assembled from these values in
 * shopify.server.ts, which is the only place that touches their enums.
 *
 * ── One plan, not three ──────────────────────────────────────────────────
 *
 * A merchant installs MITOS and gets the storefront, the order form, the call
 * list, the shipping table, the carriers and the offers. There is no feature
 * held back for a higher tier, so there is no higher tier. Inventing one would
 * mean gating something that works today, and the merchant would be paying
 * more for us to switch it off.
 *
 * ── The plan key is what the merchant reads ──────────────────────────────
 *
 * Shopify sends the key of this object as the subscription's `name`, and that
 * name is what appears on the charge approval screen and on the merchant's
 * Shopify invoice. It is a label, not an identifier. Renaming it orphans every
 * existing subscription — `billing.check` matches on the name — so it does not
 * change once a real shop has approved one.
 */

/**
 * ⚠ The price. This is the number to change, and the only one.
 *
 * Shopify's Billing API bills in the currency named here, converting to the
 * merchant's own at charge time. USD because that is what Shopify settles in;
 * a DZD amount is not accepted.
 */
export const PRICE = { amount: 19, currencyCode: "USD" } as const;

/**
 * Shopify runs the trial itself. The merchant approves the charge on day one
 * and is billed on day fifteen, and if they uninstall before then they are
 * billed nothing.
 *
 * Deliberately not a clock of our own. A local "installed less than 14 days
 * ago" window has to answer what happens when a shop uninstalls and reinstalls
 * — and every answer is either a free-forever loop or a merchant who loses
 * days they were promised. Shopify already decides this, so it decides it.
 */
export const TRIAL_DAYS = 14;

export const PLAN = "Essentiel";
export type PlanKey = typeof PLAN;

/** What the merchant is told they are buying, on the pricing screen. */
export const INCLUDED = [
  "Le formulaire de commande, sur votre thème ou sur le nôtre",
  "La liste d'appels, sur ordinateur et sur téléphone",
  "Les 58 wilayas et vos tarifs, à domicile et au bureau",
  "Vos transporteurs, et le bordereau créé pour vous",
  "Les offres par quantité",
  "Commandes, produits et ce que chacun devient après l'appel",
] as const;

/**
 * A subscription as this app stores it — a copy of Shopify's answer, not a
 * decision of ours. `status` is Shopify's own vocabulary.
 */
export type StoredSubscription = {
  plan: string;
  status: string;
  trialEndsAt: Date | string | null;
  currentPeriodEnd: Date | string | null;
} | null;

export type Entitlement =
  | { state: "active"; trialDaysLeft: number }
  | { state: "none" };

/**
 * Shopify's word for a subscription that is being paid for, or is inside the
 * trial it granted. Anything else — CANCELLED, EXPIRED, FROZEN, DECLINED,
 * PENDING — is not access.
 *
 * FROZEN is worth naming: it means the merchant's own Shopify bill is unpaid.
 * Shopify has suspended the charge, so we are not being paid either, and
 * treating it as access would be a shop using the app for free indefinitely.
 */
export const ACTIVE = "ACTIVE";

export function entitlementOf(
  sub: StoredSubscription,
  now: Date = new Date(),
): Entitlement {
  if (!sub || sub.status !== ACTIVE) return { state: "none" };

  return { state: "active", trialDaysLeft: trialDaysLeft(sub, now) };
}

/**
 * Whole days left in the trial, floored, never negative.
 *
 * Floored rather than rounded because "1 jour restant" must not appear on a
 * subscription that charges in eleven hours: the merchant reads that as
 * tomorrow-plus-a-bit and is surprised by the invoice. Zero means today.
 */
export function trialDaysLeft(
  sub: StoredSubscription,
  now: Date = new Date(),
): number {
  if (!sub?.trialEndsAt) return 0;
  const end = new Date(sub.trialEndsAt).getTime();
  if (!Number.isFinite(end)) return 0;
  const ms = end - now.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}

/** Whether the shop may use the app at all. */
export function isEntitled(sub: StoredSubscription, now?: Date): boolean {
  return entitlementOf(sub, now).state === "active";
}

/** `19 USD` → `19 $ US / mois`, for the one place that prints the price. */
export function priceLabel(): string {
  return `${PRICE.amount} ${PRICE.currencyCode} / mois`;
}
