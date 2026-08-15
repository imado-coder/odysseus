/**
 * Orders dashboard — the first screen a merchant sees.
 *
 * A cash-on-delivery merchant's day is a call list, so that is what this is:
 * newest first, phone number one tap away, and the status they need to set
 * after the call reachable without opening the row. Anything that does not
 * serve the call is not on this screen.
 *
 * Built on Polaris web components (`s-*`), which AppProvider loads from
 * Shopify's CDN. Polaris React is deprecated and deliberately not used.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

type Tone = "info" | "success" | "critical" | "warning" | "neutral";

const STATUS_TONE: Record<string, Tone> = {
  PENDING: "info",
  CONFIRMED: "warning",
  SHIPPED: "warning",
  DELIVERED: "success",
  CANCELLED: "critical",
  RETURNED: "critical",
  NO_ANSWER: "critical",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "À appeler",
  CONFIRMED: "Confirmée",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
  RETURNED: "Retournée",
  NO_ANSWER: "Sans réponse",
};

/** Only these can be written from this screen. */
const SETTABLE = new Set([
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
  "NO_ANSWER",
]);

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) {
    return { orders: [], currency: "DZD", counts: {} as Record<string, number> };
  }

  const [orders, grouped] = await Promise.all([
    prisma.codOrder.findMany({
      where: { shopId: shop.id },
      include: { lead: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.codOrder.groupBy({
      by: ["status"],
      where: { shopId: shop.id },
      _count: { _all: true },
    }),
  ]);

  return {
    currency: shop.currency,
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
      createdAt: o.createdAt.toISOString(),
      customer: `${o.lead.firstName} ${o.lead.lastName}`,
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
  const id = String(form.get("id"));
  const status = String(form.get("status"));

  if (!SETTABLE.has(status)) {
    return { ok: false, error: "unknown_status" };
  }

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false, error: "unknown_shop" };

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
     another's order by guessing. */
  await prisma.codOrder.updateMany({
    where: { id, shopId: shop.id },
    data: { status: status as never, ...stamp },
  });

  return { ok: true };
}

export default function Orders() {
  const { orders, counts, currency } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const money = (n: number) =>
    new Intl.NumberFormat("fr-DZ").format(n) +
    " " +
    (currency === "DZD" ? "DA" : currency);

  const setStatus = (id: string, status: string) =>
    fetcher.submit({ id, status }, { method: "POST" });

  if (!orders.length) {
    return (
      <s-page heading="Commandes">
        <TitleBar title="Commandes" />
        <s-section heading="Aucune commande pour le moment">
          <s-paragraph>
            Connectez le formulaire de votre thème à cette application, puis
            passez une commande de test depuis votre boutique.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Commandes">
      <TitleBar title="Commandes" />

      <s-section>
        <s-stack direction="inline" gap="small-200">
          {Object.entries(STATUS_LABEL).map(([key, label]) =>
            counts[key] ? (
              <s-badge key={key} tone={STATUS_TONE[key]}>
                {`${label} : ${counts[key]}`}
              </s-badge>
            ) : null,
          )}
        </s-stack>
      </s-section>

      <s-section padding="none">
        <s-table>
          <s-table-header-row>
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
                  {o.failed ? (
                    <s-stack gap="small-500">
                      <s-badge tone="critical">Échec de création</s-badge>
                      <s-text color="subdued">{o.error?.slice(0, 60)}</s-text>
                    </s-stack>
                  ) : (
                    <s-text type="strong">{o.name ?? "—"}</s-text>
                  )}
                </s-table-cell>

                <s-table-cell>
                  <s-stack gap="small-500">
                    <s-text>{o.customer}</s-text>
                    <s-text color="subdued">{o.place}</s-text>
                  </s-stack>
                </s-table-cell>

                <s-table-cell>
                  <s-link href={`tel:${o.phone}`}>{o.phone}</s-link>
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
                      onClick={() => setStatus(o.id, "CONFIRMED")}
                    >
                      Confirmée
                    </s-button>
                    <s-button
                      variant="secondary"
                      tone="critical"
                      onClick={() => setStatus(o.id, "NO_ANSWER")}
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
    </s-page>
  );
}
