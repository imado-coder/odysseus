/**
 * The three mandatory privacy webhooks, as logic rather than as handlers.
 *
 * Shopify requires every app to subscribe to `customers/data_request`,
 * `customers/redact` and `shop/redact`, and a reviewer will send all three at
 * a test store to see what actually happens. Returning 200 and doing nothing
 * passes the delivery check and fails the review — and, more to the point, is
 * a lie told to a shopper who asked to be forgotten.
 *
 * Everything here takes its database client as an argument. That is what lets
 * `npm run test:gdpr` drive the real branching against an in-memory double,
 * without a Postgres to point at.
 *
 * Two facts about this schema shape all of it:
 *
 *   - `Lead` has a phone and no email. Shopify identifies the shopper by
 *     `customer.email` first and phone second, so phone is the only join that
 *     can work — and the two sides spell it differently. We store `0…`,
 *     Shopify sends `+213…`. Matching on the raw string finds nothing, and
 *     nothing is exactly what a broken redaction looks like from the outside.
 *
 *   - `Shipment.request` and `Shipment.response` hold the JSON exchanged with
 *     the carrier, which contains the shopper's name, phone and address. They
 *     are the least obvious copy of the personal data and the easiest to miss.
 */

type Db = any;

/* ── Identity ────────────────────────────────────────────────────────────── */

/**
 * Every spelling of one Algerian number that might sit in the phone column.
 *
 * Leads are written by the storefront in local form, but a row imported by
 * hand, or created before that rule existed, may carry the international one.
 * Matching on all of them costs one `IN (…)` and removes a whole class of
 * silent miss.
 */
export function phoneVariants(raw?: string | null): string[] {
  const cleaned = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!cleaned) return [];

  let national = cleaned.replace(/^\+/, "");
  if (national.startsWith("00213")) national = national.slice(5);
  else if (national.startsWith("213") && national.length >= 11) national = national.slice(3);
  national = national.replace(/^0+/, "");
  if (!national) return [];

  return [...new Set([cleaned, national, `0${national}`, `+213${national}`, `00213${national}`])];
}

/** `12345` and `gid://shopify/Order/12345` are the same order. */
export function orderIdVariants(raw: unknown): string[] {
  const id = String(raw ?? "").trim();
  if (!id) return [];
  const numeric = id.replace(/^gid:\/\/shopify\/Order\//, "");
  return [...new Set([id, numeric, `gid://shopify/Order/${numeric}`])];
}

export type CustomerPayload = {
  shop_domain?: string;
  customer?: { id?: number | string; email?: string; phone?: string };
  orders_requested?: Array<number | string>;
  orders_to_redact?: Array<number | string>;
  data_request?: { id?: number | string };
};

/**
 * The leads belonging to one shopper, found by phone and by the orders
 * Shopify named.
 *
 * Both paths are needed. A shopper who ordered once and changed their number
 * is only reachable through `orders_*`; a shopper whose orders never reached
 * Shopify — the lead is written before the Shopify call, on purpose — is only
 * reachable through the phone.
 */
export async function findLeadIds(
  db: Db,
  shopId: string,
  payload: CustomerPayload,
): Promise<string[]> {
  const phones = phoneVariants(payload.customer?.phone);
  const orderIds = [
    ...(payload.orders_requested ?? []),
    ...(payload.orders_to_redact ?? []),
  ].flatMap(orderIdVariants);

  const found = new Set<string>();

  if (phones.length) {
    const byPhone = await db.lead.findMany({
      where: { shopId, phone: { in: phones } },
      select: { id: true },
    });
    for (const l of byPhone) found.add(l.id);
  }

  if (orderIds.length) {
    const byOrder = await db.codOrder.findMany({
      where: { shopId, shopifyOrderId: { in: orderIds } },
      select: { leadId: true },
    });
    for (const o of byOrder) found.add(o.leadId);
  }

  return [...found];
}

/* ── customers/data_request ──────────────────────────────────────────────── */

/**
 * Record the request. The merchant answers it from Réglages.
 *
 * Upserting on Shopify's own request id means a redelivered webhook updates
 * one row instead of stacking duplicates in the merchant's list.
 */
export async function recordDataRequest(db: Db, shopId: string, payload: CustomerPayload) {
  const shopifyRequestId = payload.data_request?.id
    ? String(payload.data_request.id)
    : null;
  const data = {
    shopId,
    customerId: payload.customer?.id ? String(payload.customer.id) : null,
    customerPhone: payload.customer?.phone ?? null,
    orderIds: (payload.orders_requested ?? []).map(String),
  };

  if (!shopifyRequestId) return db.dataRequest.create({ data });

  return db.dataRequest.upsert({
    where: { shopifyRequestId },
    create: { ...data, shopifyRequestId },
    update: data,
  });
}

/**
 * Assemble the export at the moment the merchant asks for it.
 *
 * A lead that has already been redacted reports `redactedAt` and nothing else,
 * so the merchant can tell "we erased this" from "we never had it". Note which
 * of the two lookups can still reach such a row: redaction empties the phone,
 * so only the order ids in `orders_requested` lead back to it. A request that
 * carries a phone and no orders correctly finds nothing at all — by then we
 * genuinely hold nothing that links that number to anything.
 */
export async function buildCustomerExport(db: Db, shopId: string, payload: CustomerPayload) {
  const leadIds = await findLeadIds(db, shopId, payload);
  if (!leadIds.length) return { customer: payload.customer ?? null, leads: [], orders: [] };

  const leads = await db.lead.findMany({
    where: { shopId, id: { in: leadIds } },
    include: { order: true },
  });

  return {
    customer: payload.customer ?? null,
    leads: leads.map((l: any) =>
      l.redactedAt
        ? { id: l.id, createdAt: l.createdAt, redactedAt: l.redactedAt }
        : {
            id: l.id,
            createdAt: l.createdAt,
            firstName: l.firstName,
            lastName: l.lastName,
            phone: l.phone,
            wilaya: l.wilayaName,
            commune: l.commune,
            address: l.address,
            delivery: l.delivery,
            note: l.note,
            items: l.items,
            subtotal: l.subtotal,
            shipping: l.shipping,
            total: l.total,
          },
    ),
    orders: leads
      .filter((l: any) => l.order)
      .map((l: any) => ({
        id: l.order.id,
        shopifyName: l.order.shopifyName,
        shopifyOrderId: l.order.shopifyOrderId,
        status: l.order.status,
        createdAt: l.order.createdAt,
      })),
  };
}

/* ── customers/redact ────────────────────────────────────────────────────── */

/** What a redacted lead is left holding. */
const REDACTED = {
  firstName: "",
  lastName: "",
  phone: "",
  commune: "",
  address: "",
  note: null as string | null,
  ip: null as string | null,
  userAgent: null as string | null,
  idempotencyKey: null as string | null,
};

/**
 * Erase the shopper and keep the sale.
 *
 * The row is not deleted, and that is a deliberate reading of the rule rather
 * than a convenience. Deleting a `Lead` cascades to its `CodOrder` and to the
 * `Shipment` under it, so honouring one shopper's erasure would silently
 * rewrite the merchant's revenue, their wilaya breakdown, and the record of a
 * parcel a carrier may still be holding. GDPR asks for the personal data to
 * go, not for the accounting to be falsified. So every field that identifies
 * a person is cleared and the amounts stay.
 *
 * `wilayaCode` and `wilayaName` survive too: a wilaya is a province of
 * roughly a million people, it identifies nobody on its own, and it is what
 * makes the remaining order record mean anything at all.
 */
export async function redactCustomer(db: Db, shopId: string, payload: CustomerPayload) {
  const leadIds = await findLeadIds(db, shopId, payload);

  /* The phone that was handed to us must not survive in the merchant's list
     of open data requests, whether or not any lead matched. */
  const phones = phoneVariants(payload.customer?.phone);
  if (phones.length) {
    await db.dataRequest.deleteMany({ where: { shopId, customerPhone: { in: phones } } });
  }

  if (!leadIds.length) return { leads: 0, shipments: 0 };

  await db.lead.updateMany({
    where: { shopId, id: { in: leadIds } },
    data: { ...REDACTED, redactedAt: new Date() },
  });

  /* The copy that is easy to forget. Whatever was posted to the carrier and
     whatever came back both carry the name, the phone and the street. */
  const orders = await db.codOrder.findMany({
    where: { shopId, leadId: { in: leadIds } },
    select: { id: true },
  });
  const shipments = orders.length
    ? await db.shipment.updateMany({
        where: { shopId, codOrderId: { in: orders.map((o: any) => o.id) } },
        data: { request: null, response: null, lastError: null },
      })
    : { count: 0 };

  return { leads: leadIds.length, shipments: shipments.count ?? 0 };
}

/* ── shop/redact ─────────────────────────────────────────────────────────── */

/**
 * Delete the store, 48 hours after it uninstalled.
 *
 * Here deletion really is deletion: there is no merchant left to keep records
 * for. `Shop` cascades to settings, leads, orders, rates, offers, carriers,
 * shipments, subscription and data requests, so the row is the whole tree.
 *
 * Two things do not hang off `Shop` and would otherwise outlive it:
 *
 *   - `Session` is keyed by shop *domain*, not by `shopId`, and holds the
 *     Admin API access token.
 *   - The carrier credentials live in Supabase Vault; `Carrier.credentialsRef`
 *     is only a pointer, so dropping the carrier row leaves a live courier API
 *     token encrypted in `vault.secrets` with nothing referencing it and
 *     nothing able to find it again. It has to go first, while the pointers
 *     still exist.
 *
 * Vault failure is swallowed on purpose. A local Postgres has no `vault`
 * schema, and an app that refused to delete a store because an extension was
 * missing would leave far more data behind than it saved.
 */
export async function redactShop(db: Db, shopDomain: string) {
  const shop = await db.shop.findUnique({
    where: { domain: shopDomain },
    include: { carriers: { select: { credentialsRef: true } } },
  });

  await db.session.deleteMany({ where: { shop: shopDomain } });
  if (!shop) return { shop: false, secrets: 0, sessions: true };

  const refs = shop.carriers
    .map((c: any) => c.credentialsRef)
    .filter((r: any): r is string => Boolean(r));

  let secrets = 0;
  for (const ref of refs) {
    try {
      await db.$executeRawUnsafe(`DELETE FROM vault.secrets WHERE id = $1::uuid`, ref);
      secrets++;
    } catch {
      /* Recorded by the caller; never a reason to abandon the deletion. */
    }
  }

  await db.shop.delete({ where: { id: shop.id } });
  return { shop: true, secrets, sessions: true };
}
