/**
 * The install function's copy of the wilaya table must not drift.
 *
 * Run: npm run test:install
 *
 * `supabase/functions/install/index.ts` carries its own copy of the 58
 * wilayas, because an edge function cannot import from `app/lib/`. A copy is
 * a thing that drifts, and this repository has already been bitten once by
 * two implementations of the same data going out of step. This test is the
 * only reason that duplication is allowed to exist: if the two lists stop
 * matching — a renamed wilaya, a fixed accent, a new code — it fails here
 * rather than seeding a second store with names that disagree with the
 * storefront's own list.
 *
 * It also checks the storefront's third copy, `dz-locations.js`, agrees on
 * the set of codes. The names there are allowed to differ (that file carries
 * communes and its own spellings); the codes are what the order endpoint
 * joins on, so those must be identical.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const THEME = path.join(ROOT, "..", "shopify-theme");

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

/** Pulls [code, fr, ar] triples out of a TS source file. */
function triples(src) {
  return [...src.matchAll(/\["(\d{2})","([^"]*)","([^"]*)"\]/g)]
    .map((m) => [m[1], m[2], m[3]]);
}

const canonical = triples(
  fs.readFileSync(path.join(ROOT, "app/lib/wilayas.server.ts"), "utf8"),
);
const embedded = triples(
  fs.readFileSync(path.join(ROOT, "supabase/functions/install/index.ts"), "utf8"),
);

console.log("\n1. The install function's copy matches the canonical list");
ok("canonical list has 58 wilayas", canonical.length === 58, `got ${canonical.length}`);
ok("embedded copy has 58 wilayas", embedded.length === 58, `got ${embedded.length}`);

const diffs = [];
for (let i = 0; i < Math.max(canonical.length, embedded.length); i++) {
  const a = canonical[i];
  const b = embedded[i];
  if (!a || !b || a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2]) {
    diffs.push(`#${i}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
}
ok("every row is identical — code, French name, Arabic name",
   diffs.length === 0, diffs.slice(0, 3).join(" | "));

console.log("\n2. The codes are 01..58 with no gaps");
const codes = embedded.map((w) => w[0]);
const expected = Array.from({ length: 58 }, (_, i) => String(i + 1).padStart(2, "0"));
ok("codes run 01 to 58 in order", JSON.stringify(codes) === JSON.stringify(expected));
ok("no duplicate codes", new Set(codes).size === 58);

console.log("\n3. The storefront agrees on the codes it will submit");
{
  const dz = fs.readFileSync(path.join(THEME, "assets/dz-locations.js"), "utf8");
  const themeCodes = [...dz.matchAll(/"c":"(\d{2})"/g)].map((m) => m[1]);
  ok("theme ships 58 wilayas", themeCodes.length === 58, `got ${themeCodes.length}`);
  ok("the theme's codes are exactly the ones install seeds",
     JSON.stringify([...themeCodes].sort()) === JSON.stringify([...codes].sort()));
}

console.log("\n4. The function's own shape");
{
  const src = fs.readFileSync(
    path.join(ROOT, "supabase/functions/install/index.ts"), "utf8",
  );
  ok("currency is read from Shopify, not defaulted",
     /currencyCode/.test(src) && !/currency.*\|\|\s*["']DZD["']/.test(src));
  ok("refuses to write anything if Shopify will not answer",
     src.indexOf("shopify_unreachable") < src.indexOf("await sql.begin"));
  ok("inert unless an operator key is configured", /MITOS_INSTALL_KEY/.test(src));
  /* Matching on returned status codes, not on any occurrence of "401" — the
     Shopify-refusal comment mentions 401 and is not a status we send. */
  ok("a missing or wrong key answers 404, and we never return 401",
     !/,\s*401\s*\)/.test(src) && /"Not Found", \{ status: 404/.test(src));
  ok("every shop-scoped write carries shopId", (src.match(/\$\{shopId\}/g) || []).length >= 6);
  ok("the rate upsert names the index that exists",
     src.includes(`ON CONFLICT ("shopId", COALESCE("carrierId", ''), "wilayaCode")`));
  ok("the default carrier needs no credentials", /'MANUAL'::"CarrierProvider"/.test(src));
  ok("settings are never overwritten on a re-run",
     /ON CONFLICT \("shopId"\) DO NOTHING/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
