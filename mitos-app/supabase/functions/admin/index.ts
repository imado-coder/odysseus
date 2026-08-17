/**
 * The merchant's call list, as an API.
 *
 * A cash-on-delivery merchant's day is a call list: ring the customer,
 * confirm, hand to the courier. They do it from a phone, standing up, not
 * from a desk with the Shopify admin open. This serves exactly that data,
 * and nothing else.
 *
 * It exists because the embedded dashboard in app/routes/app._index.tsx
 * needs Vercel, and Vercel needs environment variables that cannot be set
 * from here. This needs none: the database URL is injected by the platform
 * and the merchant's own secret is read from the database. When the
 * embedded app is running, this can stay or go — nothing depends on it.
 *
 * The interface is a static page hosted elsewhere, because Supabase's
 * gateway rewrites every response from a function to text/plain under a
 * sandbox policy — HTML returned from here reaches the merchant as source
 * code. So this speaks JSON and is called cross-origin.
 *
 * Authentication is one secret per shop, held in ShopSettings.dashboardToken,
 * sent as the x-mitos-key header. It is a bearer secret, not a cookie, so a
 * cross-origin request carries no ambient authority and CORS can stay open.
 */

import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false,
  max: 2,
  idle_timeout: 20,
});

/* The interface is a static page on another origin and carries the secret as
   a bearer header, so there is no ambient credential for an open policy to
   expose. */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-mitos-key",
};

/* Only these can be written from the call list — the status set is closed,
   so a crafted request cannot invent one. */
const SETTABLE = new Set([
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "NO_ANSWER",
]);

/** Length-independent comparison, so a wrong token leaks nothing by timing. */
function tokenMatches(given: string, expected: string) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function shopFor(token: string) {
  if (!token) return null;
  const [row] = await sql`
    SELECT sh.id, sh.domain, sh.currency, s."dashboardToken"
      FROM "ShopSettings" s
      JOIN "Shop" sh ON sh.id = s."shopId"
     WHERE s."dashboardToken" = ${token}
  `;
  /* The lookup already matched on the token, but comparing it again in
     constant time keeps the one code path that decides access honest. */
  return row && tokenMatches(token, row.dashboardToken) ? row : null;
}

Deno.serve(async (request: Request) => {
  try {
    return await handle(request);
  } catch (e) {
    console.error("admin", e);
    return new Response("Erreur serveur", { status: 500 });
  }
});

async function handle(request: Request) {
  /* The interface is served from another origin, so every answer needs the
     headers — including the failures, or the page cannot read why. */
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const token = request.headers.get("x-mitos-key") ??
    url.searchParams.get("k") ?? "";
  const shop = await shopFor(token);

  /* A wrong or missing secret is indistinguishable from a wrong address. */
  if (!shop) return new Response("Not Found", { status: 404, headers: CORS });

  if (request.method === "POST" && url.pathname.endsWith("/communes")) {
    return await seedCommunes(request);
  }

  if (request.method === "POST") return await setStatus(request, shop);
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  return await list(url, shop);
}

// deno-lint-ignore no-explicit-any
async function setStatus(request: Request, shop: any) {
  let body: { id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const status = String(body.status ?? "");
  if (!SETTABLE.has(status)) return json({ error: "unknown_status" }, 400);

  /* The timestamp columns are set by CASE rather than by splicing a column
     name into the statement: the set of names is fixed and visible here, and
     nothing from the request can reach the SQL text.

     Scoped by shopId as well as id, because an id alone would let one
     merchant update another's order by guessing. */
  const done = await sql`
    UPDATE "CodOrder"
       SET status        = ${status}::"CodStatus",
           "updatedAt"   = now(),
           "confirmedAt" = CASE WHEN ${status} = 'CONFIRMED' THEN now() ELSE "confirmedAt" END,
           "shippedAt"   = CASE WHEN ${status} = 'SHIPPED'   THEN now() ELSE "shippedAt"   END,
           "deliveredAt" = CASE WHEN ${status} = 'DELIVERED' THEN now() ELSE "deliveredAt" END,
           "cancelledAt" = CASE WHEN ${status} = 'CANCELLED' THEN now() ELSE "cancelledAt" END
     WHERE id = ${String(body.id ?? "")} AND "shopId" = ${shop.id}
     RETURNING id
  `;

  if (!done.length) return json({ error: "not_found" }, 404);
  return json({ ok: true, status });
}

/**
 * Loads the 1,541 communes, sent as the request body.
 *
 * They are reference data shared by every shop, and they are not in this
 * function's own source: nothing a customer's request reads needs them, so
 * carrying them would add 50 kB to every cold start. They travel here once,
 * from the file that the seed script uses, so both paths load the same list.
 */
async function seedCommunes(request: Request) {
  let data: { c: string; m: [string, string][] }[];
  try {
    data = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!Array.isArray(data) || !data.length) {
    return json({ error: "expected_wilaya_array" }, 400);
  }

  const rows = data.flatMap((w) =>
    (w.m ?? []).map((m) => ({
      wilayaCode: String(w.c),
      nameAr: String(m[0]),
      nameFr: String(m[1]),
    }))
  );

  /* Replaced wholesale rather than diffed: the list changes only when the
     source dataset does, and a rebuild is cheaper than reconciling. */
  await sql.begin(async (tx) => {
    await tx`DELETE FROM "Commune"`;
    for (let i = 0; i < rows.length; i += 500) {
      await tx`INSERT INTO "Commune" ${
        tx(rows.slice(i, i + 500), "wilayaCode", "nameAr", "nameFr")
      }`;
    }
  });

  const [{ n }] = await sql`SELECT count(*)::int AS n FROM "Commune"`;
  return json({ ok: true, communes: n });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      /* Customer phone numbers — never cached by anything in between. */
      "Cache-Control": "no-store, private",
      ...CORS,
    },
  });
}

/**
 * The order list, as data.
 *
 * It is data rather than a rendered page because Supabase's gateway rewrites
 * every function response to text/plain with `nosniff` and a
 * `default-src 'none'; sandbox` policy — deliberate hardening so that nobody
 * can serve a page from a supabase.co address. HTML returned from here is
 * shown to the merchant as source code. The interface therefore lives in a
 * static page hosted elsewhere, and this stays an API.
 */
// deno-lint-ignore no-explicit-any
async function list(url: URL, shop: any) {
  const filter = url.searchParams.get("s") ?? "";
  const only = SETTABLE.has(filter) ? filter : null;

  const orders = await sql`
    SELECT o.id, o.status, o."shopifyName", o."createFailed", o."createError",
           o."createdAt",
           l."firstName", l."lastName", l.phone, l.commune, l."wilayaName",
           l.delivery, l.total, l."pricesVerified", l.address, l.items
      FROM "CodOrder" o
      JOIN "Lead" l ON l.id = o."leadId"
     WHERE o."shopId" = ${shop.id}
       ${only ? sql`AND o.status = ${only}::"CodStatus"` : sql``}
     ORDER BY o."createdAt" DESC
     LIMIT 200
  `;

  const counts = await sql`
    SELECT status::text AS status, count(*)::int AS n
      FROM "CodOrder" WHERE "shopId" = ${shop.id} GROUP BY status
  `;

  return json({
    ok: true,
    shop: { domain: shop.domain, currency: shop.currency },
    counts: Object.fromEntries(
      counts.map((c: { status: string; n: number }) => [c.status, c.n]),
    ),
    orders,
  });
}
