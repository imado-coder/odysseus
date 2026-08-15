#!/usr/bin/env node
/**
 * Which phone format does Shopify accept on an order?
 *
 * A live store rejected the local Algerian form (0551234567) with
 * "Order Phone is invalid", which would have failed every cash-on-delivery
 * order. This finds the format that works, and whether the order-level phone
 * and the address phone have the same rule.
 *
 *   SHOPIFY_STORE=… SHOPIFY_ADMIN_TOKEN=… node scripts/shopify-phone-probe.mjs --confirm
 *
 * Every order it manages to create is tagged MITOS-PROBE and deleted again.
 */

const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2026-10";

if (!store || !token) {
  console.error("Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN first.");
  process.exit(2);
}
if (!process.argv.includes("--confirm")) {
  console.error("This creates and deletes real orders. Re-run with --confirm.");
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
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

const info = await gql(`
  query {
    shop { currencyCode }
    productVariants(first: 1) { nodes { id } }
  }
`);
const currency = info.shop.currencyCode;
const variantId = info.productVariants.nodes[0].id;

const ORDER_CREATE = `
  mutation P($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id name displayFinancialStatus
        phone
        totalPriceSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount } }
        shippingAddress { city province provinceCode countryCodeV2 phone }
        shippingLines(first: 5) { nodes { title } }
      }
      userErrors { field message }
    }
  }
`;

const ORDER_DELETE = `
  mutation D($orderId: ID!) {
    orderDelete(orderId: $orderId) { deletedId userErrors { field message } }
  }
`;

function draft({ orderPhone, addressPhone, province }) {
  const address = {
    firstName: "Yacine",
    lastName: "Benali",
    address1: "Cité 8 Mai 1945, Bt 4",
    city: "Bab Ezzouar",
    countryCode: "DZ",
    ...(addressPhone === null ? {} : { phone: addressPhone }),
    ...province,
  };
  return {
    order: {
      currency,
      ...(orderPhone === null ? {} : { phone: orderPhone }),
      tags: ["MITOS-PROBE"],
      billingAddress: address,
      shippingAddress: address,
      lineItems: [{ variantId, quantity: 1 }],
      shippingLines: [
        { title: "Livraison", priceSet: { shopMoney: { amount: 350, currencyCode: currency } } },
      ],
    },
    options: { sendReceipt: false, sendFulfillmentReceipt: false },
  };
}

const created = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Shopify throttles order creation hard ("Too many attempts"), which is
   itself worth knowing: a burst of real orders can hit it. Back off and
   retry rather than reading the throttle as a rejection. */
async function attempt(label, cfg, tries = 4) {
  let out;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(15000 * i);
    try {
      out = (await gql(ORDER_CREATE, draft(cfg))).orderCreate;
    } catch (e) {
      console.log(`  FAIL  ${label} — ${e.message}`);
      return null;
    }
    const throttled = out.userErrors.some((e) => /too many attempts/i.test(e.message));
    if (!throttled) break;
    if (i === tries - 1) {
      console.log(`  FAIL  ${label} — still throttled after ${tries} tries`);
      return null;
    }
  }
  if (!out.order) {
    console.log(`  FAIL  ${label} — ${out.userErrors.map((e) => e.message).join("; ")}`);
    return null;
  }
  created.push(out.order.id);
  console.log(`  OK    ${label} — stored as ${JSON.stringify(out.order.phone)}`);
  return out.order;
}

const LOCAL = "0551234567";
const E164 = "+213551234567";

const provinceOnly = process.argv.includes("--province-only");

if (!provinceOnly) {
console.log("\n1. order-level phone format (address phone omitted)");
await attempt("local 0551234567 ", { orderPhone: LOCAL, addressPhone: null, province: {} });
await attempt("E.164 +213551234567", { orderPhone: E164, addressPhone: null, province: {} });
await attempt("no phone at all   ", { orderPhone: null, addressPhone: null, province: {} });

console.log("\n2. address-level phone format (order phone omitted)");
await attempt("address local     ", { orderPhone: null, addressPhone: LOCAL, province: {} });
await attempt("address E.164     ", { orderPhone: null, addressPhone: E164, province: {} });
}

console.log("\n3. province: does Shopify carry DZ subdivisions?");
const byCode = await attempt("provinceCode '16' ", {
  orderPhone: E164, addressPhone: E164, province: { provinceCode: "16" },
});
const byName = await attempt("province 'Alger'  ", {
  orderPhone: E164, addressPhone: E164, province: { province: "Alger" },
});

const winner = byCode || byName;
if (winner) {
  console.log("\nfull order shape:");
  console.log("  financial :", winner.displayFinancialStatus);
  console.log("  total     :", winner.totalPriceSet.shopMoney.amount, winner.totalPriceSet.shopMoney.currencyCode);
  console.log("  shipping  :", winner.totalShippingPriceSet.shopMoney.amount);
  console.log("  ship lines:", JSON.stringify(winner.shippingLines.nodes));
  console.log("  address   :", JSON.stringify(winner.shippingAddress));
}

console.log(`\ncleaning up ${created.length} probe order(s)`);
for (const id of created) {
  const del = await gql(ORDER_DELETE, { orderId: id });
  const errs = del.orderDelete.userErrors;
  console.log(`  ${errs.length ? "FAILED " + JSON.stringify(errs) : "deleted"} ${id}`);
}
