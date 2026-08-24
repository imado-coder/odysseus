/**
 * How a product's record after the call is read.
 *
 * Run: npm run test:products
 *
 * The screen cannot be run from here, and the SQL needs a database. What can
 * be tested is the part that turns counts into a claim, and that is the part
 * worth testing: this number is what a merchant uses to decide whether to keep
 * selling something. Getting it wrong in either direction costs them money —
 * dropping a good product, or keeping one that is bleeding return fees.
 *
 * The SQL itself was run against the live database before shipping; what it
 * cannot express — "is this rate worth believing yet" — is here.
 */

import {
  EMPTY_STATS,
  lossRate,
  lossTone,
  MIN_DECIDED,
  type ProductStats,
} from "../app/lib/products";

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

const s = (over: Partial<ProductStats> = {}): ProductStats => ({
  ...EMPTY_STATS,
  ...over,
});

console.log("\n1. A product nobody has decided on yet has no rate");
{
  ok("a brand new product has no rate", lossRate(EMPTY_STATS) === null);
  ok("orders that are all still pending have no rate",
     lossRate(s({ orders: 9, pending: 9 })) === null);
  ok("confirmed but not yet delivered is still undecided",
     lossRate(s({ orders: 4, confirmed: 4 })) === null);
  /* 0 % would be a claim, and we cannot make it from nothing. */
  ok("undecided reads as neutral, never as good news",
     lossTone(s({ orders: 9, pending: 9 })) === "neutral");
}

console.log("\n2. The rate counts decided orders only");
{
  ok("half of the decided ones lost is 50 %",
     lossRate(s({ delivered: 5, lost: 5 })) === 0.5);
  ok("pending orders do not dilute the rate",
     lossRate(s({ delivered: 5, lost: 5, pending: 90 })) === 0.5);
  ok("nothing lost is 0 %", lossRate(s({ delivered: 7 })) === 0);
  ok("everything lost is 100 %", lossRate(s({ lost: 4 })) === 1);
}

console.log("\n3. A rate is only flagged once there is enough behind it");
{
  /* One refusal out of one is 100 %, and means nothing at all. */
  ok("a single loss out of one does not raise an alarm",
     lossTone(s({ lost: 1 })) === "neutral");
  ok("two out of two still does not", lossTone(s({ lost: 2 })) === "neutral");
  ok(`${MIN_DECIDED} decided is the floor where it starts speaking`,
     lossTone(s({ lost: 3 })) === "critical");
  ok("the floor is three", MIN_DECIDED === 3);
}

console.log("\n4. The thresholds");
{
  ok("40 % of decided orders lost is critical",
     lossTone(s({ delivered: 6, lost: 4 })) === "critical");
  ok("20 % is a warning", lossTone(s({ delivered: 8, lost: 2 })) === "warning");
  ok("just under 20 % is quiet",
     lossTone(s({ delivered: 90, lost: 10 })) === "neutral");
  ok("just under 40 % warns rather than alarms",
     lossTone(s({ delivered: 65, lost: 35 })) === "warning");
  ok("a healthy product says nothing",
     lossTone(s({ delivered: 50, lost: 1 })) === "neutral");
}

console.log("\n5. The empty shape");
{
  ok("every field starts at zero",
     Object.values(EMPTY_STATS).every((v) => v === 0));
  ok("it carries every field the screen reads",
     ["orders", "pending", "confirmed", "delivered", "lost", "deliveredValue"]
       .every((k) => k in EMPTY_STATS));
}

console.log("\n6. The rate never lies about direction");
{
  /* Whatever else changes, more losses can never lower the rate and more
     deliveries can never raise it. */
  let monotonic = true;
  let prev = -1;
  for (let lost = 0; lost <= 20; lost++) {
    const r = lossRate(s({ delivered: 20, lost })) ?? 0;
    if (r < prev) monotonic = false;
    prev = r;
  }
  ok("more losses never reads as a better product", monotonic);

  let falling = true;
  prev = 2;
  for (let delivered = 0; delivered <= 20; delivered++) {
    const r = lossRate(s({ delivered, lost: 20 })) ?? 0;
    if (r > prev) falling = false;
    prev = r;
  }
  ok("more deliveries never reads as a worse product", falling);

  let inRange = true;
  for (let d = 0; d <= 30; d++) {
    for (let l = 0; l <= 30; l++) {
      const r = lossRate(s({ delivered: d, lost: l }));
      if (r != null && (r < 0 || r > 1 || Number.isNaN(r))) inRange = false;
    }
  }
  ok("the rate is always between 0 and 1, never NaN", inRange);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
