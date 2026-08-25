/**
 * The subscription row, and why it is only ever a copy.
 *
 * ── Shopify owns this fact ───────────────────────────────────────────────
 *
 * Whether a merchant is paying is decided by Shopify, not by us. They approve
 * the charge on Shopify's screen, they cancel it from Shopify's admin, and
 * Shopify freezes it when their own bill goes unpaid. Nothing in this app can
 * make any of those happen, so nothing in this app may hold an opinion about
 * them.
 *
 * The `Subscription` row therefore stores what Shopify last said, and every
 * function here is a way of copying that answer down. It exists so the layout
 * loader can gate a page on one indexed read instead of a GraphQL round trip
 * on every screen the merchant opens.
 *
 * ── Which means it must never go stale silently ──────────────────────────
 *
 * Two things keep it fresh, and both are needed:
 *
 *   `app_subscriptions/update` fires when the merchant approves, cancels, or
 *   when Shopify freezes the charge. That is what stops a cancelled shop from
 *   keeping access until someone happens to reload the pricing screen.
 *
 *   The pricing screen asks Shopify directly. Webhooks can be missed — a
 *   deploy mid-delivery, a 500 — and a merchant who is being charged but is
 *   locked out will go to the pricing screen, so that is the screen that has
 *   to be able to repair itself.
 *
 * ── isTest ───────────────────────────────────────────────────────────────
 *
 * A test subscription looks exactly like a real one everywhere in the API and
 * charges nobody anything. Storing the flag is the only way the pricing screen
 * can say so out loud. A whole shop billed in test mode by mistake is a
 * mistake that is otherwise invisible until the money does not arrive.
 */

import type { PrismaClient } from "@prisma/client";
import { ACTIVE, PLAN } from "./plans";

/** The subset of Shopify's AppSubscription this app copies down. */
type ShopifySubscription = {
  id: string;
  name: string;
  status: string;
  test: boolean;
  trialDays: number;
  createdAt: string;
  currentPeriodEnd: string | null;
};

/**
 * True unless someone has deliberately said otherwise.
 *
 * Defaulting to test mode means the worst case of a misconfigured deploy is a
 * merchant who is not charged, rather than one who is charged by an app that
 * was not meant to be live yet. The pricing screen prints which mode it is in,
 * so this cannot quietly stay wrong.
 */
export const IS_TEST = process.env.MITOS_BILLING_TEST !== "false";

/** Shopify grants the trial; the end date is just arithmetic on their answer. */
function trialEnd(sub: ShopifySubscription): Date | null {
  if (!sub.trialDays) return null;
  const start = new Date(sub.createdAt);
  if (!Number.isFinite(start.getTime())) return null;
  return new Date(start.getTime() + sub.trialDays * 86_400_000);
}

function asDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Write down what Shopify just said about this shop.
 *
 * `subscriptions` is what `billing.check` returned, which is only ever the
 * active ones — Shopify filters cancelled and expired out of that list. So an
 * empty array is not "no answer", it is the answer: this shop is not paying,
 * and the stored row is marked so rather than left as it was.
 */
export async function syncFromShopify(
  prisma: PrismaClient,
  shopId: string,
  subscriptions: ShopifySubscription[],
) {
  const mine = subscriptions.find((s) => s.name === PLAN) ?? null;

  const data = mine
    ? {
        chargeId: mine.id,
        plan: mine.name,
        status: mine.status,
        isTest: mine.test,
        trialEndsAt: trialEnd(mine),
        currentPeriodEnd: asDate(mine.currentPeriodEnd),
      }
    : {
        /* Keep the chargeId: it is the receipt for a subscription that
           existed, and it is what a support conversation is conducted with. */
        plan: PLAN,
        status: "NONE",
        trialEndsAt: null,
        currentPeriodEnd: null,
      };

  return prisma.subscription.upsert({
    where: { shopId },
    update: data,
    create: { shopId, ...data },
  });
}

/**
 * The `app_subscriptions/update` payload.
 *
 * It carries the status and little else — no trial length, no period end — so
 * this updates only what it actually knows. Overwriting the dates with nulls
 * from a payload that never contained them would make the pricing screen
 * forget a trial that is still running.
 */
type SubscriptionWebhook = {
  app_subscription?: {
    admin_graphql_api_id?: string;
    name?: string;
    status?: string;
    test?: boolean;
  };
};

export async function syncFromWebhook(
  prisma: PrismaClient,
  shopDomain: string,
  payload: SubscriptionWebhook,
) {
  const sub = payload?.app_subscription;
  if (!sub?.status) return null;

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return null;

  /* Shopify sends the status in lower case here and in upper case from the
     GraphQL API. One vocabulary, or `status !== "ACTIVE"` is true for a shop
     that is paying. */
  const status = String(sub.status).toUpperCase();

  const data = {
    plan: sub.name ?? PLAN,
    status,
    ...(sub.admin_graphql_api_id ? { chargeId: sub.admin_graphql_api_id } : {}),
    ...(typeof sub.test === "boolean" ? { isTest: sub.test } : {}),
    /* A subscription that has stopped has no period left to run. Clearing it
       is what keeps the pricing screen from offering to cancel a charge that
       Shopify has already ended. */
    ...(status === ACTIVE ? {} : { currentPeriodEnd: null }),
  };

  return prisma.subscription.upsert({
    where: { shopId: shop.id },
    update: data,
    create: { shopId: shop.id, ...data },
  });
}

/** The stored copy, in the shape the display rules in plans.ts expect. */
export async function readSubscription(prisma: PrismaClient, shopId: string) {
  return prisma.subscription.findUnique({ where: { shopId } });
}
