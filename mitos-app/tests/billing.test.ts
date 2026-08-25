/**
 * Who may use the app, and who may not.
 *
 * Run: npm run test:billing
 *
 * This is the only decision in the codebase where being wrong in one direction
 * gives the app away for free and being wrong in the other locks a paying
 * merchant out of their own order list mid-shift. Neither is discoverable by
 * reading it — every branch here was written because it is a status Shopify
 * really sends.
 *
 * The Prisma writes are not tested here; they are one upsert each. What is
 * tested is the reading of Shopify's answer, which is where the judgement is.
 */

import {
  ACTIVE,
  INCLUDED,
  PLAN,
  PRICE,
  TRIAL_DAYS,
  entitlementOf,
  isEntitled,
  priceLabel,
  trialDaysLeft,
  type StoredSubscription,
} from "../app/lib/plans";

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

const NOW = new Date("2026-08-25T12:00:00Z");
const inDays = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString();

const sub = (over: Partial<NonNullable<StoredSubscription>> = {}) => ({
  plan: PLAN,
  status: ACTIVE,
  trialEndsAt: null,
  currentPeriodEnd: null,
  ...over,
});

console.log("\n1. No subscription is no access");
{
  ok("a shop that never subscribed is out", !isEntitled(null, NOW));
  ok("NONE is out", !isEntitled(sub({ status: "NONE" }), NOW));
  ok("the state says so plainly", entitlementOf(null, NOW).state === "none");
}

console.log("\n2. Only ACTIVE is access");
{
  ok("ACTIVE is in", isEntitled(sub(), NOW));

  /* Every one of these is a status Shopify really sends, and every one of
     them means we are not being paid. */
  for (const status of [
    "CANCELLED",
    "EXPIRED",
    "DECLINED",
    "PENDING",
    "ACCEPTED",
    "FROZEN",
  ]) {
    ok(`${status} is out`, !isEntitled(sub({ status }), NOW));
  }

  /* FROZEN is the one worth naming: the merchant's own Shopify bill is
     unpaid, Shopify has suspended our charge, and treating it as access is a
     shop running on the app for free for as long as they like. */
  ok("FROZEN is not a temporary courtesy", !isEntitled(sub({ status: "FROZEN" }), NOW));

  /* Shopify sends lower case over the webhook and upper case over GraphQL.
     billing.server.ts upper-cases on the way in; if that is ever removed,
     this is the assertion that fails rather than a paying shop being locked
     out silently. */
  ok("lower case is not ACTIVE — it must be normalised on the way in",
     !isEntitled(sub({ status: "active" }), NOW));
}

console.log("\n3. The trial countdown");
{
  ok("no trial date is zero days", trialDaysLeft(sub(), NOW) === 0);
  ok("a trial ending in 14 days reads 14",
     trialDaysLeft(sub({ trialEndsAt: inDays(14) }), NOW) === 14);
  ok("a past trial never goes negative",
     trialDaysLeft(sub({ trialEndsAt: inDays(-3) }), NOW) === 0);
  ok("garbage in the column does not produce NaN",
     trialDaysLeft(sub({ trialEndsAt: "not a date" }), NOW) === 0);

  /* Floored, not rounded. "1 jour restant" on a subscription that charges in
     eleven hours reads as tomorrow-plus, and the invoice is a surprise. */
  ok("eleven hours left reads as 0, not 1",
     trialDaysLeft(sub({ trialEndsAt: new Date(NOW.getTime() + 11 * 3_600_000).toISOString() }), NOW) === 0);
  ok("47 hours left reads as 1, not 2",
     trialDaysLeft(sub({ trialEndsAt: new Date(NOW.getTime() + 47 * 3_600_000).toISOString() }), NOW) === 1);

  /* A Date and its ISO string are the same instant — the loader serialises,
     the webhook does not, and both reach this function. */
  ok("a Date object reads the same as its string",
     trialDaysLeft(sub({ trialEndsAt: new Date(inDays(9)) }), NOW) ===
     trialDaysLeft(sub({ trialEndsAt: inDays(9) }), NOW));
}

console.log("\n4. A trial that has run out is still an active subscription");
{
  /* Shopify keeps charging after the trial ends — the trial ending is not the
     subscription ending, and confusing the two would cut off every paying
     merchant on day fifteen. */
  const paying = sub({ trialEndsAt: inDays(-30), currentPeriodEnd: inDays(12) });
  ok("day fifteen is not an eviction", isEntitled(paying, NOW));
  const e = entitlementOf(paying, NOW);
  ok("and it stops advertising a trial", e.state === "active" && e.trialDaysLeft === 0);
}

console.log("\n5. A cancelled subscription inside its paid period");
{
  /* Deliberate: Shopify reports CANCELLED the moment the merchant cancels,
     while the period they paid for may still have days on it. We follow
     Shopify — it is the one deciding what it will pay us for, and the
     alternative is this app inventing an entitlement Shopify does not
     recognise. */
  ok("we follow Shopify, not the paid-through date",
     !isEntitled(sub({ status: "CANCELLED", currentPeriodEnd: inDays(12) }), NOW));
}

console.log("\n6. The plan a merchant is being sold");
{
  ok("there is exactly one price", typeof PRICE.amount === "number");
  ok("it is a currency Shopify settles in", PRICE.currencyCode === "USD");
  ok("the price on the screen is the price in the config",
     priceLabel() === `${PRICE.amount} ${PRICE.currencyCode} / mois`);
  ok("the trial is a whole number of days",
     Number.isInteger(TRIAL_DAYS) && TRIAL_DAYS > 0);

  /* The key is what Shopify prints on the merchant's invoice and what
     billing.check matches on — renaming it orphans every live subscription. */
  ok("the plan name is human-readable", /^[A-Z][A-Za-zÀ-ÿ ]+$/.test(PLAN));
  ok("something is listed as included", INCLUDED.length > 0);
  ok("nothing included is an empty string",
     INCLUDED.every((l) => l.trim().length > 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
