/**
 * Tableau de bord — every figure computed from records that already exist.
 *
 * No metrics tables, no counters, no nightly job: Lead, CodOrder and Shipment
 * hold everything here, and aggregating them on read is both cheaper and
 * incapable of drifting from the truth the way a maintained counter does.
 *
 * ── The one judgement call worth stating ─────────────────────────────────
 *
 * "Revenue" means something different under cash on delivery. An order that
 * exists is not money; an order that shipped is not money either — a large
 * share come back. Money is what a driver actually collected. So this screen
 * never shows a single blended figure: DELIVERED is counted as cash, and
 * CONFIRMED/SHIPPED is shown separately as what is still out there. Merging
 * them would flatter every number on the page.
 */
import type { LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import { useLoaderData } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const DAYS = 30;

/* Ordered because it is a funnel: an order walks down this list, and the shape
   of the drop between two rows is the thing a merchant reads. */
const PIPELINE = [
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "NO_ANSWER",
  "CANCELLED",
  "RETURNED",
] as const;

const LABEL: Record<string, string> = {
  PENDING: "À appeler",
  CONFIRMED: "Confirmée",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  NO_ANSWER: "Sans réponse",
  CANCELLED: "Annulée",
  RETURNED: "Retournée",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
    include: { settings: true },
  });

  if (!shop) return { ready: false as const };

  const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);

  const [
    statusCounts,
    leadCount,
    cash,
    inFlight,
    recent,
    byWilaya,
    carriers,
    shipments,
    daily,
    topProducts,
  ] = await Promise.all([
    prisma.codOrder.groupBy({
      by: ["status"],
      where: { shopId: shop.id },
      _count: { _all: true },
    }),

    prisma.lead.count({ where: { shopId: shop.id } }),

    /* Collected: a driver handed over cash. */
    prisma.lead.aggregate({
      where: { shopId: shop.id, order: { status: "DELIVERED" } },
      _sum: { total: true },
    }),

    /* Out there: confirmed or moving, not yet money. */
    prisma.lead.aggregate({
      where: { shopId: shop.id, order: { status: { in: ["CONFIRMED", "SHIPPED"] } } },
      _sum: { total: true },
    }),

    prisma.codOrder.findMany({
      where: { shopId: shop.id },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),

    prisma.lead.groupBy({
      by: ["wilayaName"],
      where: { shopId: shop.id },
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _count: { wilayaName: "desc" } },
      take: 6,
    }),

    prisma.carrier.findMany({
      where: { shopId: shop.id },
      select: { name: true, provider: true, isDefault: true, enabled: true, credentialsRef: true },
      orderBy: { isDefault: "desc" },
    }),

    prisma.shipment.groupBy({
      by: ["state"],
      where: { shopId: shop.id },
      _count: { _all: true },
    }),

    /* Cash per day. generate_series so a day with no delivery is a zero on the
       chart rather than a gap the eye reads as a shorter month. */
    prisma.$queryRaw<{ day: Date; total: number }[]>`
      SELECT d.day::date AS day,
             COALESCE(SUM(l.total), 0)::int AS total
        FROM generate_series(${since}::date, CURRENT_DATE, '1 day') AS d(day)
        LEFT JOIN "CodOrder" o
               ON o."shopId" = ${shop.id}
              AND o.status = 'DELIVERED'
              AND o."deliveredAt"::date = d.day
        LEFT JOIN "Lead" l ON l.id = o."leadId"
       GROUP BY d.day
       ORDER BY d.day
    `,

    /* Items live as JSON on the lead, so the product breakdown is a jsonb
       expansion rather than a join. Nothing else needs a Product table for
       this, and inventing one would mean copying Shopify. */
    prisma.$queryRaw<{ title: string; units: number; revenue: number }[]>`
      SELECT COALESCE(NULLIF(i->>'title', ''), 'Sans titre') AS title,
             SUM((i->>'qty')::int)::int AS units,
             SUM(COALESCE((i->>'lineTotal')::int,
                          (i->>'price')::int * (i->>'qty')::int))::int AS revenue
        FROM "Lead" l
        CROSS JOIN LATERAL jsonb_array_elements(l.items) AS i
       WHERE l."shopId" = ${shop.id}
       GROUP BY 1
       ORDER BY units DESC
       LIMIT 6
    `,
  ]);

  const counts: Record<string, number> = {};
  for (const c of statusCounts) counts[c.status] = c._count._all;

  return {
    ready: true as const,
    currency: shop.currency === "DZD" ? "DA" : shop.currency,
    days: DAYS,
    leadCount,
    orderCount: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    cash: cash._sum.total ?? 0,
    inFlight: inFlight._sum.total ?? 0,
    daily: daily.map((d) => ({
      day: new Date(d.day).toISOString().slice(0, 10),
      total: Number(d.total),
    })),
    byWilaya: byWilaya.map((w) => ({
      name: w.wilayaName,
      orders: w._count._all,
      total: w._sum.total ?? 0,
    })),
    topProducts: topProducts.map((p) => ({
      title: p.title,
      units: Number(p.units),
      revenue: Number(p.revenue),
    })),
    shipments: Object.fromEntries(shipments.map((s) => [s.state, s._count._all])),
    carriers,
    recent: recent.map((o) => ({
      id: o.id,
      name: o.shopifyName,
      status: o.status as string,
      customer: `${o.lead.firstName} ${o.lead.lastName}`,
      place: `${o.lead.commune}, ${o.lead.wilayaName}`,
      total: o.lead.total,
    })),
  };
}

export default function Dashboard() {
  const d = useLoaderData<typeof loader>();

  if (!d.ready) {
    return (
      <s-page heading="Tableau de bord">
        <TitleBar title="Tableau de bord" />
        <s-section heading="Boutique introuvable">
          <s-paragraph>Cette boutique n'est pas encore enregistrée dans MITOS.</s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const money = (n: number) =>
    new Intl.NumberFormat("fr-FR").format(n) + " " + d.currency;

  const nothingYet = d.leadCount === 0;

  return (
    <s-page heading="Tableau de bord">
      <TitleBar title="Tableau de bord" />
      <style>{CSS}</style>

      {nothingYet ? (
        <s-section heading="Rien à afficher pour l'instant">
          <s-paragraph>
            Aucune commande n'est encore arrivée. Dès la première, tout sur
            cette page se remplit tout seul — il n'y a rien à configurer ici.
          </s-paragraph>
        </s-section>
      ) : null}

      <s-section>
        <div className="mt-tiles">
          <Tile label="Encaissé" value={money(d.cash)} hint="livré, payé au livreur" strong />
          <Tile label="En cours" value={money(d.inFlight)} hint="confirmé ou expédié — pas encore de l'argent" />
          <Tile label="Leads" value={String(d.leadCount)} hint="formulaires reçus" />
          <Tile label="Commandes" value={String(d.orderCount)} hint="dont à appeler : " suffix={String(d.counts.PENDING ?? 0)} />
        </div>
      </s-section>

      <s-section heading={`Encaissé par jour · ${d.days} jours`}>
        <RevenueChart data={d.daily} money={money} />
      </s-section>

      <s-section heading="Parcours des commandes">
        <Bars
          rows={PIPELINE.filter((s) => d.counts[s]).map((s) => ({
            label: LABEL[s],
            value: d.counts[s] ?? 0,
            display: String(d.counts[s] ?? 0),
          }))}
          empty="Aucune commande."
        />
      </s-section>

      <s-section heading="Produits les plus commandés">
        <Bars
          rows={d.topProducts.map((p) => ({
            label: p.title,
            value: p.units,
            display: `${p.units} × · ${money(p.revenue)}`,
          }))}
          empty="Aucun article encore commandé."
        />
      </s-section>

      <s-section heading="Wilayas">
        <Bars
          rows={d.byWilaya.map((w) => ({
            label: w.name,
            value: w.orders,
            display: `${w.orders} · ${money(w.total)}`,
          }))}
          empty="Aucune commande."
        />
      </s-section>

      <s-section heading="Transporteurs">
        {d.carriers.length === 0 ? (
          <s-paragraph>
            Aucun transporteur relié. Les commandes confirmées restent à
            expédier à la main.
          </s-paragraph>
        ) : (
          <s-stack gap="small-200">
            {d.carriers.map((c) => (
              <s-stack key={c.name} direction="inline" gap="small-200">
                <s-text type="strong">{c.name}</s-text>
                <s-text color="subdued">{c.provider.replace(/_/g, " ")}</s-text>
                {c.isDefault ? <s-badge tone="success">Par défaut</s-badge> : null}
                {c.credentialsRef ? null : <s-badge tone="warning">Sans identifiants</s-badge>}
                {c.enabled ? null : <s-badge tone="critical">Désactivé</s-badge>}
              </s-stack>
            ))}
            <s-text color="subdued">
              Colis remis : {d.shipments.PUSHED ?? 0} · en échec : {d.shipments.FAILED ?? 0}
            </s-text>
          </s-stack>
        )}
      </s-section>

      <s-section padding="none" heading="Dernières commandes">
        {d.recent.length === 0 ? (
          <s-section><s-paragraph>Aucune commande.</s-paragraph></s-section>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Commande</s-table-header>
              <s-table-header>Client</s-table-header>
              <s-table-header>Total</s-table-header>
              <s-table-header>Statut</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {d.recent.map((o) => (
                <s-table-row key={o.id}>
                  <s-table-cell><s-text type="strong">{o.name ?? "—"}</s-text></s-table-cell>
                  <s-table-cell>
                    <s-stack gap="small-500">
                      <s-text>{o.customer}</s-text>
                      <s-text color="subdued">{o.place}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text fontVariantNumeric="tabular-nums">{money(o.total)}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={tone(o.status)}>{LABEL[o.status] ?? o.status}</s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

function tone(status: string) {
  if (status === "DELIVERED") return "success";
  if (status === "PENDING") return "info";
  if (status === "CONFIRMED" || status === "SHIPPED") return "warning";
  return "critical";
}

function Tile(props: {
  label: string;
  value: string;
  hint?: string;
  suffix?: string;
  strong?: boolean;
}) {
  return (
    <div className="mt-tile">
      <span className="mt-tile__label">{props.label}</span>
      <span className={"mt-tile__value" + (props.strong ? " is-strong" : "")}>
        {props.value}
      </span>
      {props.hint ? (
        <span className="mt-tile__hint">
          {props.hint}
          {props.suffix ? <b>{props.suffix}</b> : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One series, so no legend and no categorical palette — the section heading
 * names what the line is. A crosshair rather than a label on every point:
 * thirty labels is thirty things to read and none of them stand out.
 */
function RevenueChart({
  data,
  money,
}: {
  data: { day: string; total: number }[];
  money: (n: number) => string;
}) {
  const [at, setAt] = useState<number | null>(null);

  if (!data.length) return <s-paragraph>Pas encore de données.</s-paragraph>;

  const W = 720, H = 180, P = 8;
  const max = Math.max(1, ...data.map((d) => d.total));
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.total)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  const shown = at == null ? data[data.length - 1] : data[at];

  return (
    <div className="mt-chart">
      <div className="mt-chart__read">
        <b>{money(shown.total)}</b>
        <span>{shown.day}</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-chart__svg"
        role="img"
        aria-label={`Encaissé par jour sur ${data.length} jours`}
        onMouseLeave={() => setAt(null)}
      >
        <defs>
          <linearGradient id="mt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mt-series)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--mt-series)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill="url(#mt-fill)" />
        <path d={line} fill="none" stroke="var(--mt-series)" strokeWidth="2"
              strokeLinejoin="round" strokeLinecap="round" />

        {at != null ? (
          <g>
            <line x1={x(at)} y1={P} x2={x(at)} y2={H - P}
                  stroke="var(--mt-grid)" strokeWidth="1" />
            {/* A 2px surface ring keeps the marker legible wherever it lands
                on the fill. */}
            <circle cx={x(at)} cy={y(data[at].total)} r="4.5"
                    fill="var(--mt-series)" stroke="var(--mt-surface)" strokeWidth="2" />
          </g>
        ) : null}

        {/* Hit targets far wider than the marks, so a 30-day series is still
            hoverable with a mouse that is not precise. */}
        {data.map((_, i) => (
          <rect key={i} x={x(i) - (W / data.length) / 2} y="0"
                width={W / data.length} height={H} fill="transparent"
                onMouseEnter={() => setAt(i)} />
        ))}
      </svg>
    </div>
  );
}

/** Horizontal bars: magnitude against a label that needs room to be read. */
function Bars({
  rows,
  empty,
}: {
  rows: { label: string; value: number; display: string }[];
  empty: string;
}) {
  if (!rows.length) return <s-paragraph>{empty}</s-paragraph>;
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="mt-bars">
      {rows.map((r) => (
        <div className="mt-bar" key={r.label}>
          <span className="mt-bar__label" title={r.label}>{r.label}</span>
          <span className="mt-bar__track">
            <span className="mt-bar__fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="mt-bar__value">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

/* The series hue is validated per surface rather than flipped: #c24e00 passes
   the lightness band and 3:1 contrast on light, #e06a2a on dark. An automatic
   inversion would have landed outside the dark band. */
const CSS = `
  .mt-tiles, .mt-bars, .mt-chart { --mt-series:#c24e00; --mt-grid:#c9cccf;
    --mt-surface:#ffffff; --mt-ink:#202223; --mt-sub:#6d7175; }
  @media (prefers-color-scheme: dark) {
    .mt-tiles, .mt-bars, .mt-chart { --mt-series:#e06a2a; --mt-grid:#3a3f44;
      --mt-surface:#1a1c1d; --mt-ink:#e3e5e7; --mt-sub:#9ba1a6; }
  }

  .mt-tiles { display:grid; gap:.75rem;
    grid-template-columns:repeat(auto-fit,minmax(10rem,1fr)); }
  .mt-tile { display:grid; gap:.125rem; }
  .mt-tile__label { font-size:.8125rem; color:var(--mt-sub); }
  .mt-tile__value { font-size:1.5rem; font-weight:600; color:var(--mt-ink);
    font-variant-numeric:tabular-nums; unicode-bidi:plaintext; }
  .mt-tile__value.is-strong { color:var(--mt-series); }
  .mt-tile__hint { font-size:.75rem; color:var(--mt-sub); }
  .mt-tile__hint b { color:var(--mt-ink); font-variant-numeric:tabular-nums; }

  .mt-chart__read { display:flex; align-items:baseline; gap:.5rem;
    margin-bottom:.25rem; }
  .mt-chart__read b { font-size:1.125rem; color:var(--mt-ink);
    font-variant-numeric:tabular-nums; unicode-bidi:plaintext; }
  .mt-chart__read span { font-size:.8125rem; color:var(--mt-sub);
    font-variant-numeric:tabular-nums; }
  .mt-chart__svg { width:100%; height:auto; display:block; }

  .mt-bars { display:grid; gap:.5rem; }
  .mt-bar { display:grid; grid-template-columns:minmax(0,9rem) 1fr auto;
    gap:.625rem; align-items:center; }
  .mt-bar__label { font-size:.875rem; color:var(--mt-ink); overflow:hidden;
    text-overflow:ellipsis; white-space:nowrap; }
  .mt-bar__track { height:10px; border-radius:999px; background:var(--mt-grid);
    opacity:.35; }
  .mt-bar__track { position:relative; }
  /* 4px rounded data-end, anchored to the baseline at the start. */
  .mt-bar__fill { position:absolute; inset-block:0; inset-inline-start:0;
    display:block; border-radius:999px; background:var(--mt-series);
    min-width:4px; }
  .mt-bar__value { font-size:.8125rem; color:var(--mt-sub); white-space:nowrap;
    font-variant-numeric:tabular-nums; unicode-bidi:plaintext; }
`;
