/**
 * Orders — the first screen a merchant sees.
 *
 * A cash-on-delivery merchant's day is a call list, so that is still what
 * this is: newest first, the phone number one tap away, and the status they
 * set after the call reachable without opening the row. Everything added
 * here serves that, or serves finding the row to call.
 *
 * ── What changed, and what deliberately did not ──────────────────────────
 *
 * The table, the two quick actions and the call-first ordering are the same.
 * What is new is the ability to *find* an order — tabs, search, filters — to
 * act on many at once, to take the list away as a file, and to open one order
 * in full.
 *
 * Every one of those is a URL. The tabs are links, the filters are a GET
 * form, the page number is a query parameter, and the export is the same
 * query with `export=csv`. That means the back button works, a filtered list
 * can be bookmarked or sent to someone, and nothing on this screen depends on
 * JavaScript having loaded — except selecting rows for a bulk action, which
 * cannot be anything else.
 *
 * ── On the data ─────────────────────────────────────────────────────────
 *
 * Same canonical orders, read the same way: `CodOrder` joined to its `Lead`,
 * scoped by `shopId`. Filtering and paging happen in the database rather than
 * in the browser, so a merchant with ten thousand orders gets the same screen
 * as one with ten.
 *
 * Built on Polaris web components (`s-*`), which AppProvider loads from
 * Shopify's CDN. Polaris React is deprecated and deliberately not used.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { Form, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
/* The words the table renders come from the plain module; the queries come
   from the .server one. A component that imports a `.server` file fails the
   build — React Router only strips server code out of `loader` and `action`. */
import {
  PER_PAGE,
  SETTABLE,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_TONE,
  type Tone,
} from "../lib/orders";
import {
  buildWhere,
  csvFilename,
  EXPORT_CAP,
  toCsv,
  withoutStatus,
} from "../lib/orders.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const params = url.searchParams;

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });

  if (!shop) {
    return {
      orders: [],
      currency: "DZD",
      counts: {} as Record<string, number>,
      total: 0,
      page: 1,
      pages: 1,
    };
  }

  const where = buildWhere(shop.id, params);

  /* The export is the same query without the page window, so what downloads is
     the whole of what the filters describe rather than the page on screen. */
  if (params.get("export") === "csv") {
    const rows = await prisma.codOrder.findMany({
      where,
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      take: EXPORT_CAP,
    });

    return new Response(toCsv(rows, shop.currency), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename()}"`,
        "Cache-Control": "no-store, private",
      },
    });
  }

  const page = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);

  const [orders, matching, grouped] = await Promise.all([
    prisma.codOrder.findMany({
      where,
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.codOrder.count({ where }),
    /* Counts ignore the status filter — a tab has to show what is behind it
       even while another tab is open, or the merchant cannot see that six new
       orders are waiting to be called. The other filters still apply, so the
       numbers agree with what clicking the tab will show. */
    prisma.codOrder.groupBy({
      by: ["status"],
      where: buildWhere(shop.id, withoutStatus(params)),
      _count: { _all: true },
    }),
  ]);

  return {
    currency: shop.currency,
    total: matching,
    page,
    pages: Math.max(1, Math.ceil(matching / PER_PAGE)),
    counts: Object.fromEntries(
      grouped.map((g) => [g.status as string, g._count._all]),
    ) as Record<string, number>,
    orders: orders.map((o) => ({
      id: o.id,
      name: o.shopifyName,
      failed: o.createFailed,
      error: o.createError,
      status: o.status as string,
      pricesVerified: o.lead.pricesVerified,
      redacted: o.lead.redactedAt != null,
      createdAt: o.createdAt.toISOString(),
      customer: `${o.lead.firstName} ${o.lead.lastName}`.trim(),
      phone: o.lead.phone,
      place: `${o.lead.commune}, ${o.lead.wilayaName}`,
      delivery: o.lead.delivery as string,
      total: o.lead.total,
    })),
  };
}


export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const status = String(form.get("status"));

  if (!SETTABLE.has(status)) {
    return { ok: false, error: "unknown_status" };
  }

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false, error: "unknown_shop" };

  /* One row or many, the same path — `ids` carries a comma-separated list and
     a single-row action sends a list of one. Two code paths here would mean
     the bulk one could drift away from the scoping rule below. */
  const ids = String(form.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!ids.length) return { ok: false, error: "no_rows" };

  const stamp =
    status === "CONFIRMED"
      ? { confirmedAt: new Date() }
      : status === "SHIPPED"
        ? { shippedAt: new Date() }
        : status === "DELIVERED"
          ? { deliveredAt: new Date() }
          : status === "CANCELLED"
            ? { cancelledAt: new Date() }
            : {};

  /* Scoped by shopId as well as id: an id alone would let one merchant update
     another's order by guessing. `updateMany` with both is what keeps a bulk
     action from ever reaching outside this shop. */
  const done = await prisma.codOrder.updateMany({
    where: { id: { in: ids }, shopId: shop.id },
    data: { status: status as never, ...stamp },
  });

  return { ok: true, changed: done.count };
}

export default function Orders() {
  const { orders, counts, currency, total, page, pages } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string[]>([]);

  const money = (n: number) =>
    new Intl.NumberFormat("fr-DZ").format(n) +
    " " +
    (currency === "DZD" ? "DA" : currency);

  const setStatus = (ids: string[], status: string) => {
    if (!ids.length) return;
    fetcher.submit({ ids: ids.join(","), status }, { method: "POST" });
    setSelected([]);
  };

  const activeStatus = params.get("s") ?? "";
  const q = params.get("q") ?? "";
  const delivery = params.get("delivery") ?? "";
  const flag = params.get("flag") ?? "";

  /** A link that keeps every filter except the one it changes. */
  const linkWith = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    /* Any change to the filters puts the merchant back on page one; staying on
       page seven of a list that now has two pages shows nothing at all. */
    if (!("page" in changes)) next.delete("page");
    const s = next.toString();
    return s ? `/app?${s}` : "/app";
  };

  const exportHref = (() => {
    const next = new URLSearchParams(params);
    next.delete("page");
    next.set("export", "csv");
    return `/app?${next.toString()}`;
  })();

  const allOnPage = orders.map((o) => o.id);
  const allSelected = allOnPage.length > 0 && selected.length === allOnPage.length;

  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );

  const filtered = Boolean(q || delivery || flag || activeStatus);

  return (
    <s-page heading="Commandes">
      <TitleBar title="Commandes" />

      {/* Tabs. Links, not buttons — a filtered list is a place, and a place
          has an address the merchant can bookmark or send to someone. */}
      <s-section>
        <s-stack direction="inline" gap="small-200">
          <s-clickable-chip
            href={linkWith({ s: "" })}
            color={activeStatus === "" ? "strong" : undefined}
          >
            {`Toutes (${Object.values(counts).reduce((a, b) => a + b, 0)})`}
          </s-clickable-chip>

          {STATUS_ORDER.filter((k) => counts[k]).map((key) => (
            <s-clickable-chip
              key={key}
              href={linkWith({ s: key })}
              color={activeStatus === key ? "strong" : undefined}
            >
              {`${STATUS_LABEL[key]} (${counts[key]})`}
            </s-clickable-chip>
          ))}
        </s-stack>
      </s-section>

      {/* Search and filters. A plain GET form, so it works before JavaScript
          arrives and the result is a URL. */}
      <s-section>
        <Form method="get" action="/app">
          {activeStatus ? (
            <input type="hidden" name="s" value={activeStatus} />
          ) : null}

          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field
              label="Rechercher"
              name="q"
              defaultValue={q}
              placeholder="Nom, téléphone, commune, n° de commande"
            />

            <s-select label="Livraison" name="delivery" value={delivery}>
              <s-option value="">Toutes</s-option>
              <s-option value="HOME">Domicile</s-option>
              <s-option value="DESK">Bureau</s-option>
            </s-select>

            <s-select label="Signalements" name="flag" value={flag}>
              <s-option value="">Aucun filtre</s-option>
              <s-option value="unverified">Prix à confirmer</s-option>
              <s-option value="failed">Échec de création Shopify</s-option>
            </s-select>

            <s-button type="submit" variant="secondary">
              Filtrer
            </s-button>

            {filtered ? (
              <s-button href="/app" variant="tertiary">
                Effacer
              </s-button>
            ) : null}
          </s-stack>
        </Form>
      </s-section>

      {/* Bulk actions. The one thing here that needs JavaScript: a selection
          only exists in the browser. It says how many rows it will touch, in
          words, because "Confirmer" over 40 orders is not undoable. */}
      {selected.length > 0 ? (
        <s-section>
          <s-banner tone="info">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text type="strong">
                {`${selected.length} commande${selected.length > 1 ? "s" : ""} sélectionnée${selected.length > 1 ? "s" : ""}`}
              </s-text>
              <s-button
                variant="secondary"
                onClick={() => setStatus(selected, "CONFIRMED")}
              >
                Marquer confirmées
              </s-button>
              <s-button
                variant="secondary"
                onClick={() => setStatus(selected, "NO_ANSWER")}
              >
                Marquer sans réponse
              </s-button>
              <s-button
                variant="secondary"
                tone="critical"
                onClick={() => setStatus(selected, "CANCELLED")}
              >
                Marquer annulées
              </s-button>
              <s-button variant="tertiary" onClick={() => setSelected([])}>
                Désélectionner
              </s-button>
            </s-stack>
          </s-banner>
        </s-section>
      ) : null}

      {orders.length === 0 ? (
        <s-section
          heading={
            filtered ? "Aucune commande ne correspond" : "Aucune commande pour le moment"
          }
        >
          <s-paragraph>
            {filtered
              ? "Aucune commande ne correspond à cette recherche. Modifiez les filtres, ou effacez-les pour revoir toute la liste."
              : "Connectez le formulaire de votre thème à cette application, puis passez une commande de test depuis votre boutique."}
          </s-paragraph>
          {filtered ? (
            <s-button href="/app" variant="secondary">
              Effacer les filtres
            </s-button>
          ) : null}
        </s-section>
      ) : (
        <>
          <s-section padding="none">
            <s-table>
              <s-table-header-row>
                <s-table-header>
                  <s-checkbox
                    label="Tout sélectionner"
                    labelAccessibilityVisibility="exclusive"
                    checked={allSelected}
                    indeterminate={selected.length > 0 && !allSelected}
                    onChange={() =>
                      setSelected(allSelected ? [] : allOnPage)
                    }
                  />
                </s-table-header>
                <s-table-header>Commande</s-table-header>
                <s-table-header>Client</s-table-header>
                <s-table-header>Téléphone</s-table-header>
                <s-table-header>Livraison</s-table-header>
                <s-table-header>Total</s-table-header>
                <s-table-header>Statut</s-table-header>
                <s-table-header>Après l'appel</s-table-header>
              </s-table-header-row>

              <s-table-body>
                {orders.map((o) => (
                  <s-table-row key={o.id}>
                    <s-table-cell>
                      <s-checkbox
                        label={`Sélectionner ${o.name ?? o.customer}`}
                        labelAccessibilityVisibility="exclusive"
                        checked={selected.includes(o.id)}
                        onChange={() => toggle(o.id)}
                      />
                    </s-table-cell>

                    <s-table-cell>
                      {o.failed ? (
                        <s-stack gap="small-500">
                          <s-badge tone="critical">Échec de création</s-badge>
                          <s-text color="subdued">{o.error?.slice(0, 60)}</s-text>
                        </s-stack>
                      ) : (
                        /* The order reference is the way into the detail view:
                           it is what the merchant already looks for on the row. */
                        <s-link href={`/app/orders/${o.id}`}>
                          {o.name ?? "Voir"}
                        </s-link>
                      )}
                    </s-table-cell>

                    <s-table-cell>
                      <s-stack gap="small-500">
                        {/* A redacted lead keeps its money and loses its
                            person. Saying so is what stops the row reading as
                            broken data. */}
                        <s-text>{o.redacted ? "Client effacé" : o.customer}</s-text>
                        <s-text color="subdued">{o.place}</s-text>
                      </s-stack>
                    </s-table-cell>

                    <s-table-cell>
                      {o.redacted ? (
                        <s-text color="subdued">—</s-text>
                      ) : (
                        <s-link href={`tel:${o.phone}`}>{o.phone}</s-link>
                      )}
                    </s-table-cell>

                    <s-table-cell>
                      {o.delivery === "DESK" ? "Bureau" : "Domicile"}
                    </s-table-cell>

                    <s-table-cell>
                      {/* An unverified total came from the storefront because
                          Shopify could not be reached — say so, rather than let
                          the merchant quote it as if we had confirmed it. */}
                      <s-stack gap="small-500">
                        <s-text fontVariantNumeric="tabular-nums">
                          {money(o.total)}
                        </s-text>
                        {o.pricesVerified ? null : (
                          <s-badge tone="warning">À confirmer</s-badge>
                        )}
                      </s-stack>
                    </s-table-cell>

                    <s-table-cell>
                      <s-badge tone={STATUS_TONE[o.status]}>
                        {STATUS_LABEL[o.status]}
                      </s-badge>
                    </s-table-cell>

                    <s-table-cell>
                      <s-stack direction="inline" gap="small-500">
                        <s-button
                          variant="secondary"
                          onClick={() => setStatus([o.id], "CONFIRMED")}
                        >
                          Confirmée
                        </s-button>
                        <s-button
                          variant="secondary"
                          tone="critical"
                          onClick={() => setStatus([o.id], "NO_ANSWER")}
                        >
                          Sans réponse
                        </s-button>
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>

          <s-section>
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text color="subdued">
                {`${total} commande${total > 1 ? "s" : ""} · page ${page} sur ${pages}`}
              </s-text>

              {page > 1 ? (
                <s-button
                  variant="secondary"
                  href={linkWith({ page: String(page - 1) })}
                >
                  Précédentes
                </s-button>
              ) : null}

              {page < pages ? (
                <s-button
                  variant="secondary"
                  href={linkWith({ page: String(page + 1) })}
                >
                  Suivantes
                </s-button>
              ) : null}

              {/* The export follows the filters, not the page: what downloads
                  is the whole of what is being looked at. No `download`
                  attribute — the loader sends Content-Disposition: attachment
                  with a dated filename, and letting the two disagree is how a
                  file arrives called "app". */}
              <s-button variant="tertiary" href={exportHref}>
                Exporter en CSV
              </s-button>
            </s-stack>
          </s-section>
        </>
      )}
    </s-page>
  );
}
