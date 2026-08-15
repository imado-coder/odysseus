#!/usr/bin/env node
/**
 * Creates ONE real order on a development store to settle what local testing
 * cannot: whether Shopify accepts an Algerian wilaya as a provinceCode, whether
 * an order with no transaction really reports as unpaid, and whether the
 * shipping line stays separate from the goods.
 *
 *   SHOPIFY_STORE=… SHOPIFY_ADMIN_TOKEN=… node scripts/shopify-order-probe.mjs --confirm
 *
 * It writes to the store, so it refuses to run without --confirm. Use a
 * development store only.
 */

const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2026-10";

if (!store || !token) {
  console.error("Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN first.");
  process.exit(2);
}
if (!process.argv.includes("--confirm")) {
  console.error("This creates a real order. Re-run with --confirm.");
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

/* Any variant will do — this is about the order, not the product. */
const found = await gql(`
  query { productVariants(first: 1) { nodes { id title price product { title } } } }
`);
const variant = found.productVariants.nodes[0];
if (!variant) {
  console.error("No products on the store. Add one, then re-run.");
  process.exit(1);
}
console.log("using variant:", variant.product.title, "/", variant.title, "@", variant.price);

const ORDER_CREATE = `
  mutation CreateCodOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
        displayFinancialStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount } }
        shippingAddress { address1 city province provinceCode country countryCodeV2 phone }
        shippingLines(first: 5) { nodes { title originalPriceSet { shopMoney { amount } } } }
        lineItems(first: 5) { nodes { title quantity } }
        tags
      }
      userErrors { field message }
    }
  }
`;

function draft(addressExtra) {
  const address = {
    firstName: "Yacine",
    lastName: "Benali",
    address1: "Cité 8 Mai 1945, Bt 4",
    city: "Bab Ezzouar",
    countryCode: "DZ",
    phone: "0551234567",
    ...addressExtra,
  };
  return {
    order: {
      currency: "DZD",
      phone: "0551234567",
      tags: ["MITOS-COD", "MITOS-PROBE"],
      note: "MITOS probe — safe to delete",
      billingAddress: address,
      shippingAddress: address,
      lineItems: [{ variantId: variant.id, quantity: 2 }],
      shippingLines: [
        {
          title: "Livraison",
          priceSet: { shopMoney: { amount: 350, currencyCode: "DZD" } },
        },
      ],
    },
    options: { sendReceipt: false, sendFulfillmentReceipt: false },
  };
}

console.log("\n--- attempt 1: provinceCode '16' (ISO 3166-2:DZ for Alger) ---");
let res = await gql(ORDER_CREATE, draft({ provinceCode: "16" }));
let out = res.orderCreate;

if (!out.order) {
  console.log("rejected:", JSON.stringify(out.userErrors));
  console.log("\n--- attempt 2: province 'Alger' (free text) ---");
  res = await gql(ORDER_CREATE, draft({ province: "Alger" }));
  out = res.orderCreate;
  if (!out.order) {
    console.log("also rejected:", JSON.stringify(out.userErrors));
    process.exit(1);
  }
  console.log("VERDICT: Shopify does NOT carry DZ subdivisions — the name fallback is required.");
} else {
  console.log("VERDICT: Shopify DOES accept the wilaya code — the fallback is dead code.");
}

const o = out.order;
console.log("\norder:      ", o.name, o.id);
console.log("financial:  ", o.displayFinancialStatus, "(want PENDING / unpaid)");
console.log("total:      ", o.totalPriceSet.shopMoney.amount, o.totalPriceSet.shopMoney.currencyCode);
console.log("shipping:   ", o.totalShippingPriceSet.shopMoney.amount);
console.log("ship lines: ", JSON.stringify(o.shippingLines.nodes));
console.log("line items: ", JSON.stringify(o.lineItems.nodes));
console.log("address:    ", JSON.stringify(o.shippingAddress));
console.log("tags:       ", o.tags.join(", "));
console.log(
  "\nDelete it from the admin when you are done looking, or leave it — it is\n" +
  "tagged MITOS-PROBE.",
);
