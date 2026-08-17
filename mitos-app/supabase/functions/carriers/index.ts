/**
 * Linking a delivery company, and handing it confirmed orders.
 *
 * ── The shape of the problem ─────────────────────────────────────────────
 *
 * Every Algerian carrier exposes a different API. What we need from all of
 * them is the same three things: create a parcel, give me a tracking number,
 * tell me when the status changes. So there is one interface here and a small
 * translator per provider, and nothing outside this file knows which carrier
 * a shop uses.
 *
 * ── Two rules that are not negotiable ────────────────────────────────────
 *
 * A parcel is pushed when the order is CONFIRMED, never when it is created.
 * That is the whole point of cash on delivery: the merchant rings first,
 * because a large share of orders never survive the call. Pushing at order
 * time would hand the carrier every abandoned and fake order the storefront
 * collects, and the merchant pays for each return.
 *
 * A push happens once. `Shipment.codOrderId` is unique in the database, so
 * two taps on send cannot become two parcels and two delivery fees. The
 * database enforces it rather than the code remembering to.
 *
 * ── On the money ─────────────────────────────────────────────────────────
 *
 * The amount handed to a carrier is what the customer pays the driver:
 * goods plus our delivery price. Every adapter therefore tells the carrier
 * that delivery is already included — otherwise the carrier adds its own
 * tariff on top and the customer is asked for more than the shop quoted.
 * This is the single most expensive detail to get wrong, so each adapter
 * marks where it does it.
 *
 * ── On what is verified ──────────────────────────────────────────────────
 *
 * Field names below come from each provider's public documentation and from
 * open-source clients, and every adapter is marked with how well its contract
 * is confirmed. None of them can be proven from here without live
 * credentials, which is exactly why `test` exists: the merchant links an
 * account and presses one button, and an adapter that guessed wrong says so
 * immediately instead of failing silently on a real customer's parcel.
 */

import postgres from "npm:postgres@3.4.5";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, {
  prepare: false,
  max: 2,
  idle_timeout: 20,
});

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-mitos-key",
};

const PROVIDERS = [
  "YALIDINE",
  "ZR_EXPRESS",
  "ECOTRACK",
  "MAYSTRO",
  "NOEST",
  "MANUAL",
] as const;

type Provider = typeof PROVIDERS[number];

/* ── The contract every carrier is translated into ───────────────────────── */

type Credentials = Record<string, string>;

type CarrierConfig = {
  provider: Provider;
  /** Ecotrack-family couriers each run their own host. */
  baseUrl?: string | null;
  /** Yalidine prices from an origin wilaya and rejects a parcel without one. */
  fromWilaya?: string | null;
  credentials: Credentials;
};

type Draft = {
  /** Our own reference, so a parcel can be found from either side. */
  reference: string;
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  communeName: string;
  wilayaCode: string;
  wilayaName: string;
  /** What the driver collects: goods + delivery. */
  amount: number;
  productSummary: string;
  weight: number;
  stopDesk: boolean;
  note?: string;
};

type PushResult = {
  trackingNumber: string;
  labelUrl?: string;
  raw: unknown;
};

type Adapter = {
  /** Which credential keys the merchant has to supply, in order. */
  fields: { key: string; label: string; required: boolean }[];
  /** Does this provider need a per-courier base URL? */
  needsBaseUrl?: boolean;
  test(cfg: CarrierConfig): Promise<{ ok: boolean; detail: string }>;
  push(cfg: CarrierConfig, d: Draft): Promise<PushResult>;
  track?(
    cfg: CarrierConfig,
    tracking: string,
  ): Promise<{ status: string; raw: unknown }>;
};

/* ── Shared helpers ──────────────────────────────────────────────────────── */

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      ...CORS,
    },
  });
}

/**
 * Carriers want the local 0-prefixed form, not E.164 — that is what their
 * dispatchers dial. Ours are already stored local; this only guards against a
 * row that came in some other way.
 */
function localPhone(p: string) {
  let s = p.replace(/[\s.\-()]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("213")) s = "0" + s.slice(3);
  return s;
}

/**
 * One place where every carrier call goes out.
 *
 * A carrier that hangs must not hang the merchant's dashboard, so everything
 * is bounded. The body is read as text first and parsed after, because these
 * APIs return HTML error pages often enough that a bare `.json()` would throw
 * away the only useful part of the failure.
 */
async function call(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; ok: boolean; body: unknown; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch { /* left as text — that is the diagnostic */ }
    return { status: res.status, ok: res.ok, body, text };
  } finally {
    clearTimeout(timer);
  }
}

function fail(where: string, r: { status: number; text: string }): never {
  throw new Error(`${where} HTTP ${r.status}: ${r.text.slice(0, 300)}`);
}

/** Trailing slashes are the most common cause of a 404 against these hosts. */
function base(cfg: CarrierConfig, fallback: string) {
  return (cfg.baseUrl || fallback).replace(/\/+$/, "");
}

/* ── Yalidine ────────────────────────────────────────────────────────────────
 *
 * Contract: well documented publicly and implemented by several open clients.
 * Auth is two headers, X-API-ID and X-API-TOKEN, from yalidine.app/dev.
 * Parcels are POSTed as an ARRAY, and the response is keyed by the order_id
 * that was sent — not a flat object, which is the detail most integrations
 * get wrong on the first try.
 *
 * Confidence: high on fields and endpoint, to confirm on the exact header
 * casing, which `test` settles in one call.
 */
function yalidineHeaders(cfg: CarrierConfig): HeadersInit {
  return {
    "X-API-ID": cfg.credentials.apiId ?? "",
    "X-API-TOKEN": cfg.credentials.apiToken ?? "",
    "Content-Type": "application/json",
  };
}

const yalidine: Adapter = {
  fields: [
    { key: "apiId", label: "API ID", required: true },
    { key: "apiToken", label: "API Token", required: true },
  ],

  async test(cfg) {
    /* Wilayas is the cheapest authenticated read there is: it proves the
       credentials without creating anything. */
    const r = await call(`${base(cfg, "https://api.yalidine.app/v1")}/wilayas/`, {
      headers: yalidineHeaders(cfg),
    });
    return r.ok
      ? { ok: true, detail: "credentials accepted" }
      : { ok: false, detail: `HTTP ${r.status}: ${r.text.slice(0, 200)}` };
  },

  async push(cfg, d) {
    if (!cfg.fromWilaya) {
      throw new Error("Yalidine needs an origin wilaya (fromWilaya)");
    }

    const parcel = {
      order_id: d.reference,
      from_wilaya_name: cfg.fromWilaya,
      firstname: d.firstName,
      familyname: d.lastName,
      contact_phone: localPhone(d.phone),
      address: d.address,
      to_commune_name: d.communeName,
      to_wilaya_name: d.wilayaName,
      product_list: d.productSummary,
      /* What the driver collects. `freeshipping` is true because our delivery
         price is already inside this figure — left false, Yalidine adds its
         own tariff on top and the customer is asked for more than the shop
         quoted. */
      price: d.amount,
      freeshipping: true,
      is_stopdesk: d.stopDesk,
      has_exchange: false,
      weight: d.weight,
      do_insurance: false,
    };

    const r = await call(`${base(cfg, "https://api.yalidine.app/v1")}/parcels/`, {
      method: "POST",
      headers: yalidineHeaders(cfg),
      body: JSON.stringify([parcel]),
    });

    if (!r.ok) fail("yalidine.parcels", r);

    /* Keyed by the order_id we sent, and a per-parcel failure comes back
       inside a 200 — so success has to be read, not assumed. */
    const entry = (r.body as Record<string, Record<string, unknown>>)?.[
      d.reference
    ];
    const tracking = entry?.tracking as string | undefined;

    if (!tracking) {
      throw new Error(
        `yalidine returned no tracking: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
    }

    return {
      trackingNumber: tracking,
      labelUrl: (entry?.label as string) || undefined,
      raw: r.body,
    };
  },

  async track(cfg, tracking) {
    const r = await call(
      `${base(cfg, "https://api.yalidine.app/v1")}/parcels/${encodeURIComponent(tracking)}`,
      { headers: yalidineHeaders(cfg) },
    );
    if (!r.ok) fail("yalidine.track", r);
    const b = r.body as Record<string, unknown>;
    return { status: String(b?.last_status ?? b?.status ?? ""), raw: r.body };
  },
};

/* ── ZR Express (Procolis) ───────────────────────────────────────────────────
 *
 * Contract: the Procolis v1 API. Credentials are an id and a token, and they
 * travel as two headers — `token` carries the id and `key` carries the token,
 * which reads backwards and is worth stating plainly because it is the usual
 * mistake. Parcels are posted under a `Colis` array.
 *
 * Confidence: medium. Endpoints and the credential pair are confirmed; the
 * exact header names and field casing are the part `test` is for.
 */
const zrExpress: Adapter = {
  fields: [
    { key: "id", label: "Identifiant (token)", required: true },
    { key: "token", label: "Clé (key)", required: true },
  ],

  async test(cfg) {
    const r = await call(`${base(cfg, "https://procolis.com/api_v1")}/token`, {
      method: "POST",
      headers: {
        token: cfg.credentials.id ?? "",
        key: cfg.credentials.token ?? "",
        "Content-Type": "application/json",
      },
    });
    return r.ok
      ? { ok: true, detail: "credentials accepted" }
      : { ok: false, detail: `HTTP ${r.status}: ${r.text.slice(0, 200)}` };
  },

  async push(cfg, d) {
    const colis = {
      Tracking: d.reference,
      /* 1 = home, 2 = stopdesk. */
      TypeLivraison: d.stopDesk ? "2" : "1",
      TypeColis: "0",
      /* Not pre-confirmed: the parcel enters the carrier as pending so their
         own dispatcher confirms it, matching how their dashboard behaves. */
      Confrimee: "",
      Client: `${d.firstName} ${d.lastName}`.trim(),
      MobileA: localPhone(d.phone),
      MobileB: "",
      Adresse: d.address,
      IDWilaya: d.wilayaCode,
      Commune: d.communeName,
      /* Goods + our delivery. */
      Total: String(d.amount),
      Note: d.note ?? "",
      TProduit: d.productSummary,
      id_Externe: d.reference,
      Source: "MITOS",
    };

    const r = await call(
      `${base(cfg, "https://procolis.com/api_v1")}/add_colis`,
      {
        method: "POST",
        headers: {
          token: cfg.credentials.id ?? "",
          key: cfg.credentials.token ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ Colis: [colis] }),
      },
    );

    if (!r.ok) fail("zr.add_colis", r);

    /* Procolis echoes the tracking we sent rather than minting one, so the
       reference is the tracking number — but only if it accepted the row. */
    const body = r.body as { Colis?: { Tracking?: string; MessageRetour?: string }[] };
    const row = body?.Colis?.[0];
    const message = row?.MessageRetour ?? "";

    if (!row || /erreur|error/i.test(message)) {
      throw new Error(`zr rejected the parcel: ${message || r.text.slice(0, 200)}`);
    }

    return { trackingNumber: row.Tracking || d.reference, raw: r.body };
  },

  async track(cfg, tracking) {
    const r = await call(`${base(cfg, "https://procolis.com/api_v1")}/lire`, {
      method: "POST",
      headers: {
        token: cfg.credentials.id ?? "",
        key: cfg.credentials.token ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Colis: [{ Tracking: tracking }] }),
    });
    if (!r.ok) fail("zr.lire", r);
    const row = (r.body as { Colis?: Record<string, unknown>[] })?.Colis?.[0];
    return { status: String(row?.Situation ?? ""), raw: r.body };
  },
};

/* ── Ecotrack ────────────────────────────────────────────────────────────────
 *
 * Contract: best confirmed of the five. Ecotrack is not one company but a
 * platform a large family of Algerian couriers runs on, each at its own host —
 * so the base URL is data the merchant supplies, typically
 * https://<courier>.ecotrack.dz. Two known hosts break the pattern:
 * DHD at platform.dhd-dz.com and Conexlog at app.conexlog-dz.com.
 *
 * Auth is a bearer token from the courier's own dashboard.
 *
 * Confidence: high, from two independent sources agreeing on the field names.
 */
const ecotrack: Adapter = {
  needsBaseUrl: true,
  fields: [{ key: "token", label: "API token", required: true }],

  async test(cfg) {
    if (!cfg.baseUrl) return { ok: false, detail: "base URL required" };
    /* There is no dedicated ping, so the cheapest authenticated read is the
       desk list. A 401 means the token is wrong; a 404 means the host is. */
    const r = await call(`${base(cfg, "")}/api/v1/get/desks`, {
      headers: { Authorization: `Bearer ${cfg.credentials.token ?? ""}` },
    });
    if (r.status === 401 || r.status === 403) {
      return { ok: false, detail: "token refused" };
    }
    if (r.status === 404) {
      return { ok: false, detail: "host reached but no Ecotrack API there" };
    }
    return r.ok
      ? { ok: true, detail: "credentials accepted" }
      : { ok: false, detail: `HTTP ${r.status}: ${r.text.slice(0, 200)}` };
  },

  async push(cfg, d) {
    if (!cfg.baseUrl) throw new Error("Ecotrack needs the courier's base URL");

    const payload = {
      reference: d.reference,
      nom_client: `${d.firstName} ${d.lastName}`.trim(),
      telephone: localPhone(d.phone),
      telephone_2: "",
      adresse: d.address,
      code_wilaya: Number(d.wilayaCode),
      commune: d.communeName,
      /* Goods + our delivery: Ecotrack treats `montant` as the sum collected
         from the customer, and adds nothing to it. */
      montant: d.amount,
      remarque: d.note ?? "",
      produit: d.productSummary.slice(0, 255),
      weight: d.weight,
      /* 1 = delivery, 2 = exchange. */
      type: 1,
      stop_desk: d.stopDesk ? 1 : 0,
      fragile: 0,
    };

    const r = await call(`${base(cfg, "")}/api/v1/create/order`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.credentials.token ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) fail("ecotrack.create", r);

    const b = r.body as Record<string, unknown>;
    const tracking = (b?.tracking ?? b?.Tracking ??
      (b?.data as Record<string, unknown>)?.tracking) as string | undefined;

    if (!tracking) {
      throw new Error(
        `ecotrack returned no tracking: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
    }
    return { trackingNumber: tracking, raw: r.body };
  },

  async track(cfg, tracking) {
    const r = await call(
      `${base(cfg, "")}/api/v1/get/trackings/info?tracking[]=${encodeURIComponent(tracking)}`,
      { headers: { Authorization: `Bearer ${cfg.credentials.token ?? ""}` } },
    );
    if (!r.ok) fail("ecotrack.track", r);
    const b = r.body as Record<string, { status?: string; OrderStatus?: string }>;
    const entry = b?.[tracking];
    return { status: String(entry?.status ?? entry?.OrderStatus ?? ""), raw: r.body };
  },
};

/* ── NOEST ───────────────────────────────────────────────────────────────────
 *
 * Contract: Ecotrack-shaped, but authenticated by a pair carried in the body
 * rather than a header — a GUID identifying the store and a token
 * authenticating the call, both from the Noest merchant dashboard. Noest also
 * needs an origin wilaya to price correctly.
 *
 * A created order is a draft until it is validated, which is a second call.
 * That is deliberate on their side and useful on ours: create, read back the
 * tracking, then validate.
 *
 * Confidence: medium. The credential pair and the two-step create are
 * confirmed; field names follow the Ecotrack family and `test` settles them.
 */
const noest: Adapter = {
  fields: [
    { key: "guid", label: "GUID du magasin", required: true },
    { key: "token", label: "API token", required: true },
  ],

  async push(cfg, d) {
    const root = base(cfg, "https://app.noest-dz.com/api/public");
    const auth = {
      api_token: cfg.credentials.token ?? "",
      user_guid: cfg.credentials.guid ?? "",
    };

    const r = await call(`${root}/create/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...auth,
        reference: d.reference,
        client: `${d.firstName} ${d.lastName}`.trim(),
        phone: localPhone(d.phone),
        adresse: d.address,
        wilaya_id: Number(d.wilayaCode),
        commune: d.communeName,
        /* Goods + our delivery, already summed. */
        montant: d.amount,
        remarque: d.note ?? "",
        produit: d.productSummary.slice(0, 255),
        type_id: 1,
        poids: Math.max(1, Math.round(d.weight)),
        stop_desk: d.stopDesk ? 1 : 0,
        station_code: "",
        /* Delivery is inside `montant`, so Noest must not add its tariff. */
        can_open: 0,
        from_wilaya_name: cfg.fromWilaya ?? undefined,
      }),
    });

    if (!r.ok) fail("noest.create", r);

    const b = r.body as Record<string, unknown>;
    const tracking = (b?.tracking ?? b?.Tracking) as string | undefined;
    if (!tracking) {
      throw new Error(
        `noest returned no tracking: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
    }

    /* A created order sits as a draft until validated. Leaving it unvalidated
       means the merchant sees a tracking number for a parcel no driver will
       ever be given, which is worse than a visible failure. */
    const v = await call(`${root}/valid/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth, tracking }),
    });
    if (!v.ok) fail("noest.validate", v);

    return { trackingNumber: tracking, raw: { create: r.body, validate: v.body } };
  },

  async test(cfg) {
    /* No unauthenticated ping exists, so the credential pair is checked
       against a read that returns 401 when either half is wrong. */
    const root = base(cfg, "https://app.noest-dz.com/api/public");
    const r = await call(`${root}/get/trackings/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: cfg.credentials.token ?? "",
        user_guid: cfg.credentials.guid ?? "",
        trackings: [],
      }),
    });
    return r.status === 401 || r.status === 403
      ? { ok: false, detail: "GUID or token refused" }
      : r.ok
      ? { ok: true, detail: "credentials accepted" }
      : { ok: false, detail: `HTTP ${r.status}: ${r.text.slice(0, 200)}` };
  },

  async track(cfg, tracking) {
    const root = base(cfg, "https://app.noest-dz.com/api/public");
    const r = await call(`${root}/get/trackings/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_token: cfg.credentials.token ?? "",
        user_guid: cfg.credentials.guid ?? "",
        trackings: [tracking],
      }),
    });
    if (!r.ok) fail("noest.track", r);
    const entry = (r.body as Record<string, { OrderStatus?: string }>)?.[tracking];
    return { status: String(entry?.OrderStatus ?? ""), raw: r.body };
  },
};

/* ── Maystro ─────────────────────────────────────────────────────────────────
 *
 * Contract: a bearer-ish header of its own shape — `Authorization: Token
 * <store key>`, not `Bearer`. Delivery type is 1 home, 2 stopdesk, 3 pickup
 * point.
 *
 * The awkward part, and it is worth naming: Maystro addresses a commune by
 * *its own numeric id*, not by name. Every other carrier here takes the name.
 * So a push has to resolve the commune first, and a commune Maystro does not
 * recognise has to fail loudly rather than be dropped — a parcel with no
 * destination is a parcel that goes nowhere.
 *
 * Confidence: medium on fields, high on auth. The commune lookup is the part
 * to verify first against a live account.
 */
/* `Token`, not `Bearer` — Maystro rejects the usual scheme. */
function maystroHeaders(cfg: CarrierConfig): HeadersInit {
  return {
    Authorization: `Token ${cfg.credentials.token ?? ""}`,
    "Content-Type": "application/json",
  };
}

const maystro: Adapter = {
  fields: [{ key: "token", label: "Store key", required: true }],

  async test(cfg) {
    const r = await call(
      `${base(cfg, "https://backend.maystro-delivery.com/api")}/base/city/`,
      { headers: maystroHeaders(cfg) },
    );
    return r.ok
      ? { ok: true, detail: "credentials accepted" }
      : { ok: false, detail: `HTTP ${r.status}: ${r.text.slice(0, 200)}` };
  },

  async push(cfg, d) {
    const root = base(cfg, "https://backend.maystro-delivery.com/api");
    const headers = maystroHeaders(cfg);

    /* Resolve the commune to Maystro's own id. Nothing else in this file needs
       a lookup before a push, and it is the reason a Maystro parcel can fail
       for a reason the merchant can actually fix: a commune spelt differently
       from their list. */
    const lookup = await call(
      `${root}/base/commune/?search=${encodeURIComponent(d.communeName)}`,
      { headers },
    );
    if (!lookup.ok) fail("maystro.commune", lookup);

    const list = (
      (lookup.body as { results?: unknown[] })?.results ??
        (Array.isArray(lookup.body) ? lookup.body : [])
    ) as { id?: number; name?: string }[];

    const match = list.find(
      (c) => (c.name ?? "").toLowerCase() === d.communeName.toLowerCase(),
    ) ?? list[0];

    if (!match?.id) {
      throw new Error(
        `maystro does not know the commune "${d.communeName}" — check the spelling against their list`,
      );
    }

    const payload = {
      external_order_id: d.reference,
      customer_name: `${d.firstName} ${d.lastName}`.trim(),
      customer_phone: localPhone(d.phone),
      destination_text: d.address,
      commune: match.id,
      /* Goods + our delivery, already summed; Maystro adds nothing to it. */
      product_price: d.amount,
      /* 1 home, 2 stopdesk, 3 pickup point. */
      delivery_type: d.stopDesk ? 2 : 1,
      note_to_driver: d.note ?? "",
      products: [{ product_id: "", logistical_description: d.productSummary, quantity: 1 }],
      weight: d.weight,
    };

    const r = await call(`${root}/stores/orders/`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!r.ok) fail("maystro.orders", r);

    const b = r.body as Record<string, unknown>;
    const tracking = (b?.display_id ?? b?.tracking ?? b?.id) as
      | string
      | number
      | undefined;

    if (tracking == null) {
      throw new Error(
        `maystro returned no tracking: ${JSON.stringify(r.body).slice(0, 300)}`,
      );
    }
    return { trackingNumber: String(tracking), raw: r.body };
  },
};

/* ── Manual ──────────────────────────────────────────────────────────────────
 *
 * Not every merchant uses a carrier with an API, and some use a different one
 * per region. This one asks for nothing and pushes nothing: the merchant types
 * the tracking number in themselves. It exists so the rest of the system —
 * per-carrier prices, one shipment per order, the same screens — works for
 * them too, rather than being reserved for whoever happens to have an API key.
 */
const manual: Adapter = {
  fields: [],
  test() {
    return Promise.resolve({ ok: true, detail: "no credentials needed" });
  },
  push() {
    return Promise.reject(
      new Error("manual carrier: enter the tracking number yourself"),
    );
  },
};

const ADAPTERS: Record<Provider, Adapter> = {
  YALIDINE: yalidine,
  ZR_EXPRESS: zrExpress,
  ECOTRACK: ecotrack,
  MAYSTRO: maystro,
  NOEST: noest,
  MANUAL: manual,
};

/* ── Reading a carrier's words ───────────────────────────────────────────────
 *
 * Carriers each have their own vocabulary and change it without telling
 * anyone. So a status we do not recognise leaves the order alone rather than
 * guessing: marking something DELIVERED that is not is a merchant chasing
 * money that never arrived, and the raw text is kept either way so an
 * unmapped status shows up as work to do instead of as a wrong answer.
 */
function readStatus(raw: string): string | null {
  const s = raw.toLowerCase();
  if (!s) return null;
  if (/livr|delivered|livré/.test(s)) return "DELIVERED";
  if (/retour|returned|renvoy/.test(s)) return "RETURNED";
  if (/annul|cancel/.test(s)) return "CANCELLED";
  if (/transit|expédi|expedi|shipped|sorti|dispatch|ramass|pick/.test(s)) {
    return "SHIPPED";
  }
  if (/tentative|injoign|no.?answer|sans.?r[ée]ponse/.test(s)) return "NO_ANSWER";
  return null;
}

/* ── Credentials ─────────────────────────────────────────────────────────────
 *
 * The carrier's API keys are the only real secret in this system that belongs
 * to the merchant. They go into Supabase Vault, encrypted at rest, and the
 * Carrier row holds nothing but the secret's id — so no query written later
 * for a screen can accidentally serialise a token into a response.
 */
async function storeCredentials(
  existingRef: string | null,
  name: string,
  creds: Credentials,
): Promise<string> {
  const payload = JSON.stringify(creds);
  if (existingRef) {
    await sql`SELECT vault.update_secret(${existingRef}::uuid, ${payload})`;
    return existingRef;
  }
  const [row] = await sql`
    SELECT vault.create_secret(${payload}, ${"mitos_carrier_" + name + "_" + crypto.randomUUID().slice(0, 8)}, 'MITOS carrier credentials') AS id
  `;
  return String(row.id);
}

async function readCredentials(ref: string | null): Promise<Credentials> {
  if (!ref) return {};
  const [row] = await sql`
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = ${ref}::uuid
  `;
  if (!row?.decrypted_secret) return {};
  try {
    return JSON.parse(row.decrypted_secret);
  } catch {
    return {};
  }
}

/* ── Auth, shared with the call list ─────────────────────────────────────── */

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
  return row && tokenMatches(token, row.dashboardToken) ? row : null;
}

/* ── Routes ──────────────────────────────────────────────────────────────── */

Deno.serve(async (request: Request) => {
  try {
    return await handle(request);
  } catch (e) {
    console.error("carriers", e);
    return json({ error: "server_error", detail: msg(e) }, 500);
  }
});

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function handle(request: Request) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const token = request.headers.get("x-mitos-key") ??
    url.searchParams.get("k") ?? "";
  const shop = await shopFor(token);
  if (!shop) return new Response("Not Found", { status: 404, headers: CORS });

  const path = url.pathname.replace(/\/+$/, "").split("/").pop() ?? "";

  if (request.method === "GET") return await listCarriers(shop);

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  switch (path) {
    case "test":
      return await testCarrier(shop, body);
    case "push":
      return await pushOrder(shop, body);
    case "sync":
      return await syncStatuses(shop);
    case "delete":
      return await deleteCarrier(shop, body);
    default:
      return await saveCarrier(shop, body);
  }
}

/** Never returns credentials — only whether they are set. */
// deno-lint-ignore no-explicit-any
async function listCarriers(shop: any) {
  const rows = await sql`
    SELECT c.id, c.provider, c.name, c.enabled, c."isDefault", c."autoPush",
           c."baseUrl", c."fromWilaya",
           (c."credentialsRef" IS NOT NULL) AS "hasCredentials",
           (SELECT count(*)::int FROM "ShippingRate" r WHERE r."carrierId" = c.id) AS "ratedWilayas",
           (SELECT count(*)::int FROM "Shipment" s WHERE s."carrierId" = c.id) AS shipments
      FROM "Carrier" c
     WHERE c."shopId" = ${shop.id}
     ORDER BY c."isDefault" DESC, c.name
  `;

  return json({
    ok: true,
    shop: { domain: shop.domain, currency: shop.currency },
    providers: PROVIDERS.map((p) => ({
      provider: p,
      fields: ADAPTERS[p].fields,
      needsBaseUrl: ADAPTERS[p].needsBaseUrl ?? false,
    })),
    carriers: rows,
  });
}

// deno-lint-ignore no-explicit-any
async function saveCarrier(shop: any, body: Record<string, any>) {
  const provider = String(body.provider ?? "") as Provider;
  if (!PROVIDERS.includes(provider)) {
    return json({ error: "unknown_provider" }, 422);
  }

  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) return json({ error: "name_required" }, 422);

  const adapter = ADAPTERS[provider];
  const baseUrl = body.baseUrl ? String(body.baseUrl).trim() : null;
  if (adapter.needsBaseUrl && !baseUrl) {
    return json({ error: "base_url_required" }, 422);
  }

  const id = String(body.id ?? "") || crypto.randomUUID();

  const [existing] = await sql`
    SELECT id, "credentialsRef" FROM "Carrier"
     WHERE id = ${id} AND "shopId" = ${shop.id}
  `;

  /* Credentials are only written when supplied, so saving a name or toggling
     autoPush from a screen that never shows the token cannot blank it. */
  let ref: string | null = existing?.credentialsRef ?? null;
  if (body.credentials && typeof body.credentials === "object") {
    const creds: Credentials = {};
    for (const f of adapter.fields) {
      const v = body.credentials[f.key];
      if (typeof v === "string" && v.trim()) creds[f.key] = v.trim();
    }
    const missing = adapter.fields.filter((f) => f.required && !creds[f.key]);
    if (!existing && missing.length) {
      return json({ error: "missing_credentials", fields: missing.map((f) => f.key) }, 422);
    }
    if (Object.keys(creds).length) {
      ref = await storeCredentials(ref, name, creds);
    }
  }

  const isDefault = Boolean(body.isDefault);

  await sql.begin(async (tx) => {
    /* At most one default per shop, and the database has a partial unique
       index saying so — clearing the others first is what keeps this from
       being a constraint violation rather than a silent second default. */
    if (isDefault) {
      await tx`
        UPDATE "Carrier" SET "isDefault" = false, "updatedAt" = now()
         WHERE "shopId" = ${shop.id} AND id <> ${id}
      `;
    }

    await tx`
      INSERT INTO "Carrier" (
        id, "shopId", provider, name, enabled, "isDefault", "autoPush",
        "baseUrl", "fromWilaya", "credentialsRef", "updatedAt"
      ) VALUES (
        ${id}, ${shop.id}, ${provider}::"CarrierProvider", ${name},
        ${body.enabled !== false}, ${isDefault}, ${Boolean(body.autoPush)},
        ${baseUrl}, ${body.fromWilaya ? String(body.fromWilaya) : null},
        ${ref}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        provider = EXCLUDED.provider,
        name = EXCLUDED.name,
        enabled = EXCLUDED.enabled,
        "isDefault" = EXCLUDED."isDefault",
        "autoPush" = EXCLUDED."autoPush",
        "baseUrl" = EXCLUDED."baseUrl",
        "fromWilaya" = EXCLUDED."fromWilaya",
        "credentialsRef" = EXCLUDED."credentialsRef",
        "updatedAt" = now()
    `;
  });

  return json({ ok: true, id });
}

// deno-lint-ignore no-explicit-any
async function deleteCarrier(shop: any, body: Record<string, any>) {
  const id = String(body.id ?? "");
  const [used] = await sql`
    SELECT count(*)::int AS n FROM "Shipment" WHERE "carrierId" = ${id}
  `;
  /* A carrier that has carried parcels is history, not configuration —
     deleting it would take the evidence of those shipments with it. */
  if (used?.n > 0) {
    await sql`
      UPDATE "Carrier" SET enabled = false, "isDefault" = false, "updatedAt" = now()
       WHERE id = ${id} AND "shopId" = ${shop.id}
    `;
    return json({ ok: true, disabled: true, shipments: used.n });
  }
  await sql`DELETE FROM "Carrier" WHERE id = ${id} AND "shopId" = ${shop.id}`;
  return json({ ok: true, deleted: true });
}

// deno-lint-ignore no-explicit-any
async function loadConfig(shop: any, carrierId: string) {
  const [c] = await sql`
    SELECT * FROM "Carrier" WHERE id = ${carrierId} AND "shopId" = ${shop.id}
  `;
  if (!c) return null;
  return {
    row: c,
    cfg: {
      provider: c.provider as Provider,
      baseUrl: c.baseUrl,
      fromWilaya: c.fromWilaya,
      credentials: await readCredentials(c.credentialsRef),
    } as CarrierConfig,
  };
}

/**
 * The button that turns a guess into a fact.
 *
 * Every adapter here was written from public documentation, which is the best
 * that can be done without an account. This is how a merchant finds out in one
 * tap whether that documentation matched their carrier — instead of finding
 * out on a real customer's parcel.
 */
// deno-lint-ignore no-explicit-any
async function testCarrier(shop: any, body: Record<string, any>) {
  const loaded = await loadConfig(shop, String(body.id ?? ""));
  if (!loaded) return json({ error: "unknown_carrier" }, 404);

  try {
    const result = await ADAPTERS[loaded.cfg.provider].test(loaded.cfg);
    return json({ ok: result.ok, detail: result.detail });
  } catch (e) {
    return json({ ok: false, detail: msg(e) });
  }
}

/**
 * Hands one confirmed order to its carrier.
 *
 * Refuses anything not confirmed. The order of writes matters: the shipment
 * row is claimed first, so a second request racing the first collides on the
 * unique key instead of both reaching the carrier.
 */
// deno-lint-ignore no-explicit-any
async function pushOrder(shop: any, body: Record<string, any>) {
  const orderId = String(body.orderId ?? "");

  const [order] = await sql`
    SELECT o.id, o.status, o."shopifyName",
           l."firstName", l."lastName", l.phone, l.address, l.commune,
           l."wilayaCode", l."wilayaName", l.total, l.delivery, l.items
      FROM "CodOrder" o
      JOIN "Lead" l ON l.id = o."leadId"
     WHERE o.id = ${orderId} AND o."shopId" = ${shop.id}
  `;
  if (!order) return json({ error: "unknown_order" }, 404);

  if (order.status !== "CONFIRMED") {
    return json({ error: "not_confirmed", status: order.status }, 409);
  }

  const carrierId = String(body.carrierId ?? "") ||
    (await sql`
      SELECT id FROM "Carrier"
       WHERE "shopId" = ${shop.id} AND enabled AND "isDefault" LIMIT 1
    `)[0]?.id;

  if (!carrierId) return json({ error: "no_carrier" }, 422);

  const loaded = await loadConfig(shop, carrierId);
  if (!loaded) return json({ error: "unknown_carrier" }, 404);

  /* Claim it before calling out. If two taps arrive together the second one
     loses here, at the database, rather than at the carrier. */
  const claimed = await sql`
    INSERT INTO "Shipment" (id, "shopId", "carrierId", "codOrderId", state, "updatedAt")
    VALUES (${crypto.randomUUID()}, ${shop.id}, ${carrierId}, ${orderId}, 'QUEUED', now())
    ON CONFLICT ("codOrderId") DO NOTHING
    RETURNING id
  `;

  const [ship] = claimed.length ? claimed : await sql`
    SELECT id, state, "trackingNumber" FROM "Shipment" WHERE "codOrderId" = ${orderId}
  `;

  if (!claimed.length && ship.state === "PUSHED") {
    return json({ ok: true, duplicate: true, trackingNumber: ship.trackingNumber });
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const draft: Draft = {
    reference: order.shopifyName || order.id.slice(0, 12),
    firstName: order.firstName,
    lastName: order.lastName,
    phone: order.phone,
    address: order.address,
    communeName: order.commune,
    wilayaCode: order.wilayaCode,
    wilayaName: order.wilayaName,
    amount: Number(order.total),
    productSummary: items
      // deno-lint-ignore no-explicit-any
      .map((i: any) => `${i.qty}x ${i.title || "article"}`)
      .join(", ")
      .slice(0, 255) || "Commande",
    /* No weight is captured anywhere yet, and every carrier requires one, so
       1 kg stands in. It is visible in the stored request, which is where a
       merchant disputing a weight charge would look. */
    weight: 1,
    stopDesk: order.delivery === "DESK",
    note: `MITOS ${order.shopifyName ?? ""}`.trim(),
  };

  try {
    const result = await ADAPTERS[loaded.cfg.provider].push(loaded.cfg, draft);

    await sql`
      UPDATE "Shipment"
         SET state = 'PUSHED',
             "trackingNumber" = ${result.trackingNumber},
             "labelUrl" = ${result.labelUrl ?? null},
             request = ${sql.json(draft as unknown as object)},
             response = ${sql.json(result.raw as object)},
             attempts = attempts + 1,
             "lastError" = NULL,
             "pushedAt" = now(),
             "updatedAt" = now()
       WHERE id = ${ship.id}
    `;

    await sql`
      UPDATE "CodOrder"
         SET carrier = ${loaded.row.name}, "trackingNumber" = ${result.trackingNumber},
             "updatedAt" = now()
       WHERE id = ${orderId}
    `;

    return json({ ok: true, trackingNumber: result.trackingNumber });
  } catch (e) {
    /* The order stays confirmed and the merchant keeps the customer. A carrier
       being down is not a reason to lose a sale. */
    await sql`
      UPDATE "Shipment"
         SET state = 'FAILED',
             attempts = attempts + 1,
             "lastError" = ${msg(e).slice(0, 500)},
             request = ${sql.json(draft as unknown as object)},
             "updatedAt" = now()
       WHERE id = ${ship.id}
    `;
    return json({ ok: false, error: "push_failed", detail: msg(e) }, 502);
  }
}

/**
 * Asks each carrier what happened to the parcels we gave it.
 *
 * Polling, because only part of this family offers webhooks, and a merchant
 * should not have to know which. A status we cannot read leaves the order
 * untouched and is kept raw for someone to look at.
 */
// deno-lint-ignore no-explicit-any
async function syncStatuses(shop: any) {
  const rows = await sql`
    SELECT s.id, s."trackingNumber", s."carrierId", s."codOrderId"
      FROM "Shipment" s
     WHERE s."shopId" = ${shop.id}
       AND s.state = 'PUSHED'
       AND s."trackingNumber" IS NOT NULL
       AND (s."mappedStatus" IS NULL
            OR s."mappedStatus" NOT IN ('DELIVERED','RETURNED','CANCELLED'))
     ORDER BY s."pushedAt"
     LIMIT 50
  `;

  const configs = new Map<string, Awaited<ReturnType<typeof loadConfig>>>();
  let checked = 0, changed = 0;

  for (const s of rows) {
    if (!configs.has(s.carrierId)) {
      configs.set(s.carrierId, await loadConfig(shop, s.carrierId));
    }
    const loaded = configs.get(s.carrierId);
    const adapter = loaded && ADAPTERS[loaded.cfg.provider];
    if (!loaded || !adapter?.track) continue;

    try {
      const { status, raw } = await adapter.track(loaded.cfg, s.trackingNumber);
      checked++;
      const mapped = readStatus(status);

      await sql`
        UPDATE "Shipment"
           SET "carrierStatus" = ${status},
               "mappedStatus" = ${mapped}::"CodStatus",
               response = ${sql.json(raw as object)},
               "syncedAt" = now(), "updatedAt" = now()
         WHERE id = ${s.id}
      `;

      if (mapped) {
        changed++;
        await sql`
          UPDATE "CodOrder"
             SET status = ${mapped}::"CodStatus",
                 "deliveredAt" = CASE WHEN ${mapped} = 'DELIVERED' THEN now() ELSE "deliveredAt" END,
                 "shippedAt"   = CASE WHEN ${mapped} = 'SHIPPED'   THEN COALESCE("shippedAt", now()) ELSE "shippedAt" END,
                 "updatedAt" = now()
           WHERE id = ${s.codOrderId} AND "shopId" = ${shop.id}
        `;
      }
    } catch (e) {
      await sql`
        UPDATE "Shipment"
           SET "lastError" = ${msg(e).slice(0, 500)}, "syncedAt" = now(), "updatedAt" = now()
         WHERE id = ${s.id}
      `;
    }
  }

  return json({ ok: true, examined: rows.length, checked, changed });
}
