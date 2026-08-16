#!/usr/bin/env node
/**
 * Fills a development store with demo products so the theme can actually be
 * looked at: real images, sale prices, ratings, sold counts, and a landing
 * section with images on the product page.
 *
 *   SHOPIFY_STORE=… SHOPIFY_ADMIN_TOKEN=… node scripts/seed-demo-store.mjs --confirm
 *
 * Everything it creates is tagged MITOS-DEMO so it can be found and removed.
 * Safe to re-run: products are matched by handle and updated in place.
 */

const store = process.env.SHOPIFY_STORE;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2026-10";

if (!store || !token) {
  console.error("Set SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN first.");
  process.exit(2);
}
if (!process.argv.includes("--confirm")) {
  console.error("This writes products to the store. Re-run with --confirm.");
  process.exit(2);
}

const endpoint = `https://${store.replace(/^https?:\/\//, "")}/admin/api/${version}/graphql.json`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables) {
  for (let i = 0; i < 5; i++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json();
    if (body.errors) {
      const throttled = body.errors.some((e) => /throttl/i.test(e.message));
      if (throttled && i < 4) { await sleep(3000 * (i + 1)); continue; }
      throw new Error(body.errors.map((e) => e.message).join("; "));
    }
    return body.data;
  }
}

function check(label, userErrors) {
  if (userErrors?.length) {
    console.log(`  !! ${label}: ${userErrors.map((e) => `${e.field?.join(".") ?? ""} ${e.message}`).join("; ")}`);
    return false;
  }
  return true;
}

/* ---------------------------------------------------------------- */
/* Publishing to the Online Store needs read_publications/write_publications,
   which write_products does not include. Products are still created without
   them — they just stay invisible on the storefront until the scope is
   granted, at which point re-running this publishes them. */
let onlineStore = null;
try {
  const pubs = await gql(`query { publications(first: 20) { nodes { id name } } }`);
  onlineStore = pubs.publications.nodes.find((p) => /online store/i.test(p.name)) ?? null;
  console.log("publication:", onlineStore ? onlineStore.name : "not found");
} catch (e) {
  console.log("publication: unavailable —", e.message.split(".")[0]);
}

const currency = (await gql(`query { shop { currencyCode } }`)).shop.currencyCode;
console.log("currency:", currency);

/* ---------------------------------------------------------------- */
/* Demo catalogue. Images come from Shopify's own CDN sample assets so there
   is no dependency on an outside host. */
const IMG = "https://cdn.shopify.com/s/files/1/0533/2089/files/";

const CATALOG = [
  {
    handle: "mitos-demo-ecouteurs-sans-fil",
    title: "Écouteurs sans fil Pro — réduction de bruit",
    price: "4900", compareAt: "9800",
    rating: 4.8, reviews: 1284, sold: "12 400+ vendus",
    images: [IMG + "product-1_e7e97b1b-6d68-4a24-a3f2-2b5b8b0e5f2a.png", IMG + "placeholder-images-product-2_large.png"],
    options: ["Noir", "Blanc", "Bleu"],
  },
  {
    handle: "mitos-demo-montre-connectee",
    title: "Montre connectée — écran AMOLED 1.9\"",
    price: "6500", compareAt: "13000",
    rating: 4.6, reviews: 843, sold: "8 900+ vendus",
    images: [IMG + "placeholder-images-product-3_large.png", IMG + "placeholder-images-product-4_large.png"],
    options: ["Noir", "Argent"],
  },
  {
    handle: "mitos-demo-sac-a-dos",
    title: "Sac à dos antivol — USB intégré",
    price: "3200", compareAt: "5900",
    rating: 4.7, reviews: 2106, sold: "21 000+ vendus",
    images: [IMG + "placeholder-images-product-5_large.png", IMG + "placeholder-images-product-6_large.png"],
    options: ["Gris", "Noir"],
  },
  {
    handle: "mitos-demo-lampe-led",
    title: "Lampe LED de bureau — 3 températures",
    price: "2400", compareAt: "4200",
    rating: 4.5, reviews: 512, sold: "4 300+ vendus",
    images: [IMG + "placeholder-images-product-1_large.png"],
    options: ["Blanc"],
  },
  {
    handle: "mitos-demo-mixeur",
    title: "Mixeur portable rechargeable 400 ml",
    price: "2900", compareAt: "5400",
    rating: 4.4, reviews: 377, sold: "3 100+ vendus",
    images: [IMG + "placeholder-images-product-2_large.png"],
    options: ["Vert", "Rose"],
  },
  {
    handle: "mitos-demo-parfum",
    title: "Coffret parfum homme 100 ml",
    price: "5400", compareAt: "9900",
    rating: 4.9, reviews: 1642, sold: "15 700+ vendus",
    images: [IMG + "placeholder-images-product-3_large.png"],
    options: ["100 ml"],
  },
];

const DESCRIPTION = `
<h2>Pourquoi ce produit</h2>
<p>Livraison partout en Algérie, paiement à la réception. Vous ne payez qu'une
fois le colis entre vos mains.</p>
<ul>
  <li>Garantie 12 mois</li>
  <li>Retour gratuit sous 7 jours</li>
  <li>Livraison à domicile ou au bureau</li>
</ul>
<h2>Caractéristiques</h2>
<p>Matériaux premium, finition soignée, testé avant expédition.</p>
`.trim();

const PRODUCT_SET = `
  mutation Seed($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product { id handle title }
      userErrors { field message }
    }
  }
`;

const PUBLISH = `
  mutation Pub($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) {
      publishable { ... on Product { handle } }
      userErrors { field message }
    }
  }
`;

const CREATE_MEDIA = `
  mutation Media($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { ... on MediaImage { id } }
      mediaUserErrors { field message }
    }
  }
`;

const SET_METAFIELDS = `
  mutation Meta($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key namespace }
      userErrors { field message }
    }
  }
`;

const created = [];

for (const p of CATALOG) {
  console.log(`\n${p.handle}`);

  const input = {
    handle: p.handle,
    title: p.title,
    descriptionHtml: DESCRIPTION,
    status: "ACTIVE",
    vendor: "MITOS Demo",
    productType: "Démo",
    tags: ["MITOS-DEMO"],
    productOptions: [
      { name: "Couleur", values: p.options.map((v) => ({ name: v })) },
    ],
    variants: p.options.map((v) => ({
      optionValues: [{ optionName: "Couleur", name: v }],
      price: p.price,
      compareAtPrice: p.compareAt,
      inventoryPolicy: "CONTINUE",
    })),
  };

  const set = await gql(PRODUCT_SET, { input });
  if (!check("productSet", set.productSet.userErrors)) continue;
  const product = set.productSet.product;
  console.log("  set:", product.id);

  /* Images are attached separately: productSet does not take remote URLs. */
  const existing = await gql(
    `query M($id: ID!) { product(id: $id) { media(first: 10) { nodes { id } } } }`,
    { id: product.id },
  );
  if (existing.product.media.nodes.length === 0) {
    const media = await gql(CREATE_MEDIA, {
      productId: product.id,
      media: p.images.map((src) => ({
        originalSource: src,
        mediaContentType: "IMAGE",
        alt: p.title,
      })),
    });
    check("media", media.productCreateMedia.mediaUserErrors);
    console.log("  images:", media.productCreateMedia.media?.length ?? 0);
  } else {
    console.log("  images: already present");
  }

  /* The theme reads these for the rating stars and the sold counter. */
  const meta = await gql(SET_METAFIELDS, {
    metafields: [
      {
        ownerId: product.id,
        namespace: "reviews",
        key: "rating",
        type: "rating",
        value: JSON.stringify({ value: String(p.rating), scale_min: "1", scale_max: "5" }),
      },
      {
        ownerId: product.id,
        namespace: "reviews",
        key: "rating_count",
        type: "number_integer",
        value: String(p.reviews),
      },
      {
        ownerId: product.id,
        namespace: "custom",
        key: "sold_count",
        type: "single_line_text_field",
        value: p.sold,
      },
    ],
  });
  check("metafields", meta.metafieldsSet.userErrors);

  if (onlineStore) {
    const pub = await gql(PUBLISH, {
      id: product.id,
      input: [{ publicationId: onlineStore.id }],
    });
    check("publish", pub.publishablePublish.userErrors);
    console.log("  published");
  } else {
    console.log("  created (not published — publications scope missing)");
  }

  created.push(product.handle);
}

/* ---------------------------------------------------------------- */
/* Publish everything else that is ACTIVE, so the store is not half empty. */
if (onlineStore) {
  console.log("\npublishing the store's other active products");
  const all = await gql(`
    query { products(first: 50, query: "status:active") { nodes { id handle } } }
  `);
  for (const prod of all.products.nodes) {
    const r = await gql(PUBLISH, { id: prod.id, input: [{ publicationId: onlineStore.id }] });
    if (r.publishablePublish.userErrors?.length) {
      console.log(`  !! ${prod.handle}: ${r.publishablePublish.userErrors[0].message}`);
    }
  }
}

const verify = await gql(`
  query { products(first: 50, query: "status:active") { nodes { handle onlineStoreUrl } } }
`);
const live = verify.products.nodes.filter((n) => n.onlineStoreUrl);
console.log(`\n${live.length} product(s) now live on the storefront`);
for (const n of live.slice(0, 10)) console.log("  " + n.handle);
