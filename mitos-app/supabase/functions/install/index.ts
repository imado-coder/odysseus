/**
 * POST /functions/v1/install — putting a second store on the system.
 *
 * ── Why this is an edge function and not a route ─────────────────────────
 *
 * `app/routes/api.admin.bootstrap.tsx` already writes most of these rows, but
 * it lives in the React Router app, and that app is not deployed: it needs
 * Vercel environment variables that cannot be committed. So the one path that
 * onboards a store was unreachable from anywhere. This runs beside `cod`,
 * `admin` and `carriers`, on infrastructure that needs no secret handed to it
 * — the database URL is injected by the platform.
 *
 * ── The currency is asked for, never assumed ─────────────────────────────
 *
 * The bootstrap route defaults `currency` to "DZD". That is right for the
 * shop this was built for and wrong for the next one, and the failure is
 * quiet: the storefront quotes and the order both come out in a currency the
 * merchant does not sell in, and nobody notices until a customer is asked for
 * the wrong amount. So the currency is read from Shopify itself, and an
 * install whose token cannot answer that question does not proceed.
 *
 * That doubles as the token check. A token that cannot read `shop` cannot
 * create an order either, and finding that out now — while a person is
 * watching — is much cheaper than finding it out on a customer's order.
 *
 * ── Safe to run twice ────────────────────────────────────────────────────
 *
 * Every write is an upsert, and nothing the merchant has since changed is
 * overwritten: rates and settings are only seeded when the shop has none, so
 * re-running after a token rotation replaces the token and touches nothing
 * else.
 */

import postgres from "npm:postgres@3.4.5";

const SHOPIFY_API_VERSION = "2026-10";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false,
  max: 2,
  idle_timeout: 20,
});

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-mitos-key",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      /* Carries a freshly minted dashboard token. Never cached. */
      "Cache-Control": "no-store, private",
      ...CORS,
    },
  });
}

/**
 * The 58 wilayas, so a database that has never been seeded can be brought up
 * by this call alone.
 *
 * This is a copy of `app/lib/wilayas.server.ts`, which is the canonical list.
 * A copy is a thing that drifts, so `npm run test:install` fails if the two
 * ever stop matching — that test is the only reason this duplication is
 * allowed to exist.
 *
 * The 1,541 communes are deliberately not here: no query path reads one, the
 * storefront submits the commune as text from its own copy, and carrying them
 * would add 50 kB to every cold start. They load separately through
 * `POST /admin/communes`.
 */
const WILAYAS: [string, string, string][] = [
  ["01","Adrar","أدرار"],
  ["02","Chlef"," الشلف"],
  ["03","Laghouat","الأغواط"],
  ["04","Oum El Bouaghi","أم البواقي"],
  ["05","Batna","باتنة"],
  ["06","Béjaïa"," بجاية"],
  ["07","Biskra","بسكرة"],
  ["08","Béchar","بشار"],
  ["09","Blida","البليدة"],
  ["10","Bouira","البويرة"],
  ["11","Tamanrasset","تمنراست"],
  ["12","Tébessa","تبسة"],
  ["13","Tlemcen","تلمسان"],
  ["14","Tiaret","تيارت"],
  ["15","Tizi Ouzou","تيزي وزو"],
  ["16","Alger","الجزائر"],
  ["17","Djelfa","الجلفة"],
  ["18","Jijel","جيجل"],
  ["19","Sétif","سطيف"],
  ["20","Saïda","سعيدة"],
  ["21","Skikda","سكيكدة"],
  ["22","Sidi Bel Abbès","سيدي بلعباس"],
  ["23","Annaba","عنابة"],
  ["24","Guelma","قالمة"],
  ["25","Constantine","قسنطينة"],
  ["26","Médéa","المدية"],
  ["27","Mostaganem","مستغانم"],
  ["28","M'Sila","المسيلة"],
  ["29","Mascara","معسكر"],
  ["30","Ouargla","ورقلة"],
  ["31","Oran","وهران"],
  ["32","El Bayadh","البيض"],
  ["33","Illizi","إليزي"],
  ["34","Bordj Bou Arreridj","برج بوعريريج"],
  ["35","Boumerdès","بومرداس"],
  ["36","El Tarf","الطارف"],
  ["37","Tindouf","تندوف"],
  ["38","Tissemsilt","تيسمسيلت"],
  ["39","El Oued","الوادي"],
  ["40","Khenchela","خنشلة"],
  ["41","Souk Ahras","سوق أهراس"],
  ["42","Tipaza","تيبازة"],
  ["43","Mila","ميلة"],
  ["44","Aïn Defla","عين الدفلة"],
  ["45","Naâma","النعامة"],
  ["46","Aïn Témouchent","عين تيموشنت"],
  ["47","Ghardaïa","غرداية"],
  ["48","Relizane","غليزان"],
  ["49","Timimoun","تيميمون"],
  ["50","Bordj Badji Mokhtar","برج باجي مختار"],
  ["51","Ouled Djellal","أولاد جلال"],
  ["52","Béni Abbès","بني عباس"],
  ["53","In Salah","عين صالح"],
  ["54","In Guezzam","عين قزام"],
  ["55","Touggourt","تقرت"],
  ["56","Djanet","جانت"],
  ["57","El Meghaier","المغير"],
  ["58","El Menia","المنيعة"],
];

/** Length-independent comparison, so a wrong key leaks nothing by timing. */
function keyMatches(given: string, expected: string) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

Deno.serve(async (request: Request) => {
  try {
    return await handle(request);
  } catch (e) {
    console.error("install", e);
    return json({ error: "server_error", detail: msg(e) }, 500);
  }
});

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  /* Inert until an operator key is configured. An unconfigured deployment
     does not advertise that this endpoint exists — a 404 is what a wrong
     address looks like, and this is the one endpoint that can create a
     store. */
  const expected = Deno.env.get("MITOS_INSTALL_KEY") ?? "";
  if (!expected) {
    return new Response("Not Found", { status: 404, headers: CORS });
  }

  const url = new URL(request.url);
  const given = request.headers.get("x-mitos-key") ??
    url.searchParams.get("k") ?? "";
  if (!keyMatches(given, expected)) {
    return new Response("Not Found", { status: 404, headers: CORS });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  return await install(body);
}

/** Asks the store who it is. Also proves the token works before anything is written. */
async function shopFacts(domain: string, token: string) {
  const res = await fetch(
    `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `#graphql
          query ShopFacts {
            shop { name email currencyCode ianaTimezone }
          }`,
      }),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    /* 401/403 is the ordinary case: the token is wrong, revoked, or belongs
       to another store. Say which, because the merchant can act on it. */
    throw new Error(
      `shopify refused the token (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`shopify returned non-JSON: ${text.slice(0, 200)}`);
  }

  const shop = parsed?.data?.shop;
  if (!shop?.currencyCode) {
    throw new Error(
      `shopify returned no currency: ${JSON.stringify(parsed?.errors ?? parsed).slice(0, 300)}`,
    );
  }
  return shop as {
    name: string | null;
    email: string | null;
    currencyCode: string;
    ianaTimezone: string | null;
  };
}

async function install(body: Record<string, any>) {
  const domain = String(body.shop ?? "").toLowerCase().trim();
  if (!domain.endsWith(".myshopify.com")) {
    return json({ error: "shop_must_be_myshopify_domain" }, 422);
  }

  const accessToken = String(body.accessToken ?? "").trim();
  if (!accessToken) return json({ error: "access_token_required" }, 422);

  /* The session library compares this against what the app asks for; recording
     anything else sends a working install back through OAuth. */
  const scope = String(body.scope ?? "write_orders,read_orders,read_products");

  /* Before writing anything. An install that half-succeeds and then discovers
     the token is dead leaves a shop row that the order endpoint will accept
     orders for and never be able to fulfil. */
  let facts;
  try {
    facts = await shopFacts(domain, accessToken);
  } catch (e) {
    return json({ error: "shopify_unreachable", detail: msg(e) }, 502);
  }

  const seeded = { wilayas: 0, rates: 0, carrier: null as string | null };
  let shopId = "";
  let dashboardToken = "";

  await sql.begin(async (tx) => {
    /* Reference data, shared by every shop — no shopId on these rows. Upsert
       so a database that already has them is untouched. */
    for (const [code, nameFr, nameAr] of WILAYAS) {
      await tx`
        INSERT INTO "Wilaya" (code, "nameFr", "nameAr")
        VALUES (${code}, ${nameFr}, ${nameAr})
        ON CONFLICT (code) DO UPDATE SET "nameFr" = EXCLUDED."nameFr",
                                         "nameAr" = EXCLUDED."nameAr"
      `;
    }
    const [{ n: wilayaCount }] = await tx`SELECT count(*)::int AS n FROM "Wilaya"`;
    seeded.wilayas = wilayaCount;

    /* The currency comes from Shopify, never from a default. A reinstall
       refreshes it, because a merchant can change it in Shopify. */
    const [shop] = await tx`
      INSERT INTO "Shop" (id, domain, name, email, currency, "installedAt", "uninstalledAt")
      VALUES (gen_random_uuid()::text, ${domain}, ${facts.name}, ${facts.email},
              ${facts.currencyCode}, now(), NULL)
      ON CONFLICT (domain) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        currency = EXCLUDED.currency,
        "uninstalledAt" = NULL
      RETURNING id
    `;
    shopId = shop.id;

    /* Settings are created once and never overwritten: they hold the
       merchant's own default rates and order tag by the second run. */
    await tx`
      INSERT INTO "ShopSettings" (id, "shopId", "dashboardToken", "updatedAt")
      VALUES (gen_random_uuid()::text, ${shopId}, encode(gen_random_bytes(20), 'hex'), now())
      ON CONFLICT ("shopId") DO NOTHING
    `;
    /* Issue a token if an older row predates the column being filled, so the
       call list is always reachable after an install. */
    await tx`
      UPDATE "ShopSettings"
         SET "dashboardToken" = encode(gen_random_bytes(20), 'hex'), "updatedAt" = now()
       WHERE "shopId" = ${shopId} AND "dashboardToken" IS NULL
    `;
    const [settings] = await tx`
      SELECT "dashboardToken", "defaultHomeRate", "defaultDeskRate"
        FROM "ShopSettings" WHERE "shopId" = ${shopId}
    `;
    dashboardToken = settings.dashboardToken;

    /* `offline_<domain>` is the id the Shopify session library derives for an
       offline session; any other id will never be found. */
    const sessionId = `offline_${domain}`;
    await tx`
      INSERT INTO "Session" (id, shop, state, "isOnline", "accessToken", scope)
      VALUES (${sessionId}, ${domain}, '', false, ${accessToken}, ${scope})
      ON CONFLICT (id) DO UPDATE SET
        "accessToken" = EXCLUDED."accessToken",
        scope = EXCLUDED.scope,
        shop = EXCLUDED.shop,
        "isOnline" = false,
        state = ''
    `;

    /* A default carrier so the shipping screen is not empty on day one.
       MANUAL on purpose: it asks for no credentials, so every merchant gets a
       working carrier immediately and links a real one when they have its API
       token. Only created when the shop has none — never replacing a carrier
       the merchant has already configured. */
    const [{ n: carrierCount }] = await tx`
      SELECT count(*)::int AS n FROM "Carrier" WHERE "shopId" = ${shopId}
    `;
    if (carrierCount === 0) {
      const [carrier] = await tx`
        INSERT INTO "Carrier" (id, "shopId", provider, name, enabled, "isDefault", "autoPush", "updatedAt")
        VALUES (gen_random_uuid()::text, ${shopId}, 'MANUAL'::"CarrierProvider",
                'Manuel', true, true, false, now())
        RETURNING id, name
      `;
      seeded.carrier = carrier.name;
    }

    /* The shipping table, seeded from the shop's own defaults so the
       storefront can quote from the first minute. Skipped entirely once the
       merchant has priced anything — their table is the source of truth. */
    const [{ n: rateCount }] = await tx`
      SELECT count(*)::int AS n FROM "ShippingRate" WHERE "shopId" = ${shopId}
    `;
    if (rateCount === 0) {
      for (const [code] of WILAYAS) {
        await tx`
          INSERT INTO "ShippingRate" (id, "shopId", "carrierId", "wilayaCode", "homeRate", "deskRate", enabled)
          VALUES (gen_random_uuid()::text, ${shopId}, NULL, ${code},
                  ${settings.defaultHomeRate}, ${settings.defaultDeskRate}, true)
          ON CONFLICT ("shopId", COALESCE("carrierId", ''), "wilayaCode") DO NOTHING
        `;
      }
      const [{ n }] = await tx`
        SELECT count(*)::int AS n FROM "ShippingRate" WHERE "shopId" = ${shopId}
      `;
      seeded.rates = n;
    } else {
      seeded.rates = rateCount;
    }
  });

  const base = new URL(Deno.env.get("SUPABASE_URL") ?? "https://example.invalid")
    .origin;

  return json({
    ok: true,
    shop: {
      id: shopId,
      domain,
      name: facts.name,
      /* Echoed back so the operator can see it was read, not guessed. */
      currency: facts.currencyCode,
      timezone: facts.ianaTimezone,
    },
    seeded,
    /* What the merchant does next, in the order they do it. */
    next: [
      {
        step: "Ouvrir la liste d'appels",
        url: "https://mitos-commandes.vercel.app",
        detail:
          "À la première visite elle demande la clé ci-dessous ; le navigateur la retient ensuite.",
        key: dashboardToken,
      },
      {
        step: "Vérifier les tarifs de livraison",
        detail:
          `Les 58 wilayas sont créées au tarif par défaut de la boutique. Onglet « Livraison » de la liste d'appels.`,
      },
      {
        step: "Relier un transporteur",
        detail:
          "Onglet « Transporteurs ». Le transporteur « Manuel » fonctionne sans compte : vous saisissez le numéro de suivi vous-même. Pour un transporteur avec API, ajoutez-le et appuyez sur « Tester ».",
      },
      {
        step: "Brancher le formulaire de commande",
        detail:
          `Thème → Personnaliser → Ajouter un bloc → Applications → Formulaire COD. L'adresse de l'application est déjà renseignée : ${base}/functions/v1/cod`,
      },
    ],
  });
}
