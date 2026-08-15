#!/usr/bin/env node
/**
 * Preflight against a real store, before anything is uploaded or created.
 *
 *   SHOPIFY_STORE=xxx.myshopify.com SHOPIFY_ADMIN_TOKEN=shpat_… \
 *     node scripts/shopify-preflight.mjs
 *
 * Answers, in order: does the token work, which scopes did it actually get,
 * what themes exist, and — the question no amount of local testing could
 * settle — does Shopify accept an ISO wilaya code as a provinceCode for
 * Algeria. Nothing here writes to the store.
 */

const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2026-10";

if (!store || !token) {
  console.error("Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN first.");
  process.exit(2);
}

const endpoint = `https://${store.replace(/^https?:\/\//, "")}/admin/api/${version}/graphql.json`;

async function gql(query, variables) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (body.errors) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

/* 1 — is the token live at all */
const shop = await gql(`
  query { shop { name myshopifyDomain currencyCode plan { publicDisplayName } } }
`);
console.log("shop:", shop.shop.name, "|", shop.shop.myshopifyDomain);
console.log("currency:", shop.shop.currencyCode, "| plan:", shop.shop.plan.publicDisplayName);

/* 2 — what the token may actually do. A scope the merchant forgot to tick is
   the most likely reason a later step fails, so it is checked up front. */
const scopes = await gql(`
  query { currentAppInstallation { accessScopes { handle } } }
`);
const granted = scopes.currentAppInstallation.accessScopes
  .map((s) => s.handle)
  .sort();
console.log("scopes:", granted.join(", "));

for (const need of ["read_themes", "write_themes", "write_orders", "read_orders", "read_products"]) {
  console.log(`  ${granted.includes(need) ? "ok  " : "MISSING"} ${need}`);
}

/* 3 — what is already on the store, so nothing published gets touched */
const themes = await gql(`
  query { themes(first: 20) { nodes { id name role } } }
`);
console.log("\nthemes:");
for (const t of themes.themes.nodes) {
  console.log(`  ${t.role.padEnd(11)} ${t.name}  ${t.id}`);
}

/* 4 — is there anything to build an order out of */
const variants = await gql(`
  query { productVariants(first: 1) { nodes { id title price product { title } } } }
`).catch((e) => ({ error: e.message }));

if (variants.error) {
  console.log("\nproducts: unreadable —", variants.error);
} else {
  const v = variants.productVariants.nodes[0];
  console.log(
    "\nproducts:",
    v ? `${v.product.title} / ${v.title} @ ${v.price}` : "none on this store yet",
  );
}

console.log(
  "\nNext: scripts/shopify-order-probe.mjs --confirm creates ONE test order and\n" +
  "settles provinceCode, the unpaid status and the separate shipping line.",
);
