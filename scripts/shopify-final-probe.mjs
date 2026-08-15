#!/usr/bin/env node
/**
 * Final live check of the exact order MITOS creates.
 *
 * Two questions left after the phone probe:
 *   1. provinceCode "16" was accepted, but stored as province "16" with a null
 *      provinceCode — meaning Shopify has no subdivisions for Algeria and the
 *      code just becomes an unreadable string on the packing slip. Does the
 *      name store any better?
 *   2. orderCreate returned displayFinancialStatus null rather than PENDING.
 *      What does the order actually look like once it settles?
 *
 *   SHOPIFY_STORE=… SHOPIFY_ADMIN_TOKEN=… node scripts/shopify-final-probe.mjs --confirm
 */

const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2026-10";

if (!store || !token) {
  console.error("Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN first.");
  process.exit(2);
}
if (!process.argv.includes("--confirm")) {
  console.error("This creates and deletes a real order. Re-run with --confirm.");
  process.exit(2);
}

const endpoint = `https://${store.replace(/^https?:\/\//, "")}/admin/api/${version}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data;
}

const info = await gql(`
  query { shop { currencyCode } productVariants(first: 1) { nodes { id price } } }
`);
const currency = info.shop.currencyCode;
const variant = info.productVariants.nodes[0];

const CREATE = `
  mutation P($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order { id name }
      userErrors { field message }
    }
  }
`;

const READ = `
  query R($id: ID!) {
    order(id: $id) {
      name
      displayFinancialStatus
      displayFulfillmentStatus
      unpaid
      fullyPaid
      cancelledAt
      phone
      totalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount } }
      shippingLines(first: 5) { nodes { title originalPriceSet { shopMoney { amount } } } }
      lineItems(first: 5) { nodes { title quantity originalTotalSet { shopMoney { amount } } } }
      shippingAddress { address1 city province provinceCode country countryCodeV2 phone formatted }
      tags
      note
    }
  }
`;

const DELETE = `mutation D($orderId: ID!) { orderDelete(orderId: $orderId) { deletedId userErrors { message } } }`;

function draft(province) {
  const address = {
    firstName: "Yacine",
    lastName: "Benali",
    address1: "Cité 8 Mai 1945, Bt 4",
    city: "Bab Ezzouar",
    countryCode: "DZ",
    phone: "+213551234567",
    ...province,
  };
  return {
    order: {
      currency,
      phone: "+213551234567",
      tags: ["MITOS-COD", "MITOS-PROBE"],
      note: "MITOS — bureau — Bab Ezzouar, Alger",
      billingAddress: address,
      shippingAddress: address,
      lineItems: [{ variantId: variant.id, quantity: 2 }],
      shippingLines: [
        { title: "Livraison", priceSet: { shopMoney: { amount: 350, currencyCode: currency } } },
      ],
    },
    options: { sendReceipt: false, sendFulfillmentReceipt: false },
  };
}

const created = [];

async function run(label, province) {
  let out;
  for (let i = 0; i < 5; i++) {
    if (i) await sleep(20000 * i);
    out = (await gql(CREATE, draft(province))).orderCreate;
    if (!out.userErrors.some((e) => /too many attempts/i.test(e.message))) break;
  }
  if (!out.order) {
    console.log(`${label}: REJECTED ${JSON.stringify(out.userErrors)}`);
    return null;
  }
  created.push(out.order.id);

  await sleep(2500);
  const { order } = await gql(READ, { id: out.order.id });

  console.log(`\n=== ${label} — ${order.name} ===`);
  console.log("  province stored :", JSON.stringify(order.shippingAddress.province));
  console.log("  provinceCode    :", JSON.stringify(order.shippingAddress.provinceCode));
  console.log("  formatted addr  :", JSON.stringify(order.shippingAddress.formatted));
  console.log("  financial status:", order.displayFinancialStatus);
  console.log("  fulfillment     :", order.displayFulfillmentStatus);
  console.log("  unpaid          :", order.unpaid, "| fullyPaid:", order.fullyPaid);
  console.log("  phone           :", order.phone);
  console.log("  total           :", order.totalPriceSet.shopMoney.amount, order.totalPriceSet.shopMoney.currencyCode);
  console.log("  shipping total  :", order.totalShippingPriceSet.shopMoney.amount);
  console.log("  shipping lines  :", JSON.stringify(order.shippingLines.nodes));
  console.log("  line items      :", JSON.stringify(order.lineItems.nodes));
  console.log("  tags            :", order.tags.join(", "));
  return order;
}

/* The wilaya is essential for an Algerian courier, but Shopify's DZ address
   format drops the province from `formatted`. Does address2 survive it? */
await run("C: province + address2 wilaya", {
  province: "Alger",
  address2: "Wilaya 16 — Alger",
});

console.log(`\ncleaning up ${created.length} order(s)`);
for (const id of created) {
  const d = await gql(DELETE, { orderId: id });
  console.log(" ", d.orderDelete.userErrors.length ? JSON.stringify(d.orderDelete.userErrors) : `deleted ${id}`);
}
