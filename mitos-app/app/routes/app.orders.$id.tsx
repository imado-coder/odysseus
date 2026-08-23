/**
 * One order, in full.
 *
 * The list is built for the call: find the row, ring the number, set the
 * status. This is the other half — everything that did not belong on a row
 * but that someone eventually has to look at. What was ordered, where it is
 * going, what it cost and why, when each thing happened, and what the carrier
 * was told.
 *
 * It is a route with its own URL rather than a modal on the list, so it can be
 * linked, sent to whoever handles the parcel, and reached with a back button.
 *
 * ── The redaction case ──────────────────────────────────────────────────
 *
 * A shopper who asked to be forgotten leaves a row with its money intact and
 * its person gone. That is deliberate — deleting would rewrite the merchant's
 * revenue and erase the record of a parcel a carrier may still hold. This
 * screen says so plainly, because a blank name and no phone is otherwise
 * indistinguishable from a broken record, and someone would go looking for a
 * bug that is not there.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

import { SETTABLE, STATUS_LABEL, STATUS_TONE } from "../lib/orders";

type Item = {
  title?: string;
  option?: string;
  qty?: number;
  price?: number;
  lineTotal?: number;
  offerPrice?: number | null;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) throw new Response("Not Found", { status: 404 });

  /* Scoped by shopId as well as id. An id alone would let one merchant read
     another's order by guessing, and a detail screen is where the customer's
     name, phone and street actually are. */
  const order = await prisma.codOrder.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: { lead: true },
  });

  if (!order) throw new Response("Not Found", { status: 404 });

  const shipment = await prisma.shipment.findUnique({
    where: { codOrderId: order.id },
    include: { carrier: true },
  });

  const raw = order.lead.items;
  const items: Item[] = Array.isArray(raw) ? (raw as Item[]) : [];

  return {
    currency: shop.currency,
    order: {
      id: order.id,
      name: order.shopifyName,
      status: order.status as string,
      failed: order.createFailed,
      error: order.createError,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      createdAt: order.createdAt.toISOString(),
      confirmedAt: order.confirmedAt?.toISOString() ?? null,
      shippedAt: order.shippedAt?.toISOString() ?? null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
    },
    lead: {
      redacted: order.lead.redactedAt != null,
      redactedAt: order.lead.redactedAt?.toISOString() ?? null,
      customer: `${order.lead.firstName} ${order.lead.lastName}`.trim(),
      phone: order.lead.phone,
      address: order.lead.address,
      commune: order.lead.commune,
      wilayaName: order.lead.wilayaName,
      wilayaCode: order.lead.wilayaCode,
      delivery: order.lead.delivery as string,
      subtotal: order.lead.subtotal,
      shipping: order.lead.shipping,
      total: order.lead.total,
      pricesVerified: order.lead.pricesVerified,
      source: order.lead.source,
      items,
    },
    shipment: shipment
      ? {
          state: shipment.state as string,
          carrierName: shipment.carrier?.name ?? null,
          trackingNumber: shipment.trackingNumber,
          carrierStatus: shipment.carrierStatus,
          lastError: shipment.lastError,
          pushedAt: shipment.pushedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const status = String(form.get("status"));

  if (!SETTABLE.has(status)) return { ok: false, error: "unknown_status" };

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

  await prisma.codOrder.updateMany({
    where: { id: params.id, shopId: shop.id },
    data: { status: status as never, ...stamp },
  });

  return { ok: true };
}

export default function OrderDetail() {
  const { order, lead, shipment, currency } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const money = (n: number) =>
    new Intl.NumberFormat("fr-DZ").format(n) +
    " " +
    (currency === "DZD" ? "DA" : currency);

  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("fr-FR") : null;

  const steps: [string, string | null][] = [
    ["Reçue", order.createdAt],
    ["Confirmée", order.confirmedAt],
    ["Expédiée", order.shippedAt],
    ["Livrée", order.deliveredAt],
    ["Annulée", order.cancelledAt],
  ];

  return (
    <s-page heading={order.name ?? "Commande"}>
      <TitleBar title={order.name ?? "Commande"} />

      <s-section>
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-badge tone={STATUS_TONE[order.status]}>
            {STATUS_LABEL[order.status]}
          </s-badge>
          {lead.pricesVerified ? null : (
            <s-badge tone="warning">Prix à confirmer</s-badge>
          )}
          {order.failed ? <s-badge tone="critical">Échec Shopify</s-badge> : null}
          <s-button href="/app" variant="tertiary">
            Retour aux commandes
          </s-button>
        </s-stack>
      </s-section>

      {order.failed ? (
        <s-section>
          <s-banner tone="critical" heading="La commande n'a pas été créée chez Shopify">
            <s-paragraph>
              Le client est enregistré et joignable — c'est le but même de cette
              application. Seule la création chez Shopify a échoué :
            </s-paragraph>
            <s-paragraph>{order.error ?? "raison inconnue"}</s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      {lead.redacted ? (
        <s-section>
          <s-banner tone="info" heading="Les données du client ont été effacées">
            <s-paragraph>
              {`Ce client a demandé l'effacement de ses données le ${when(lead.redactedAt) ?? "—"}. Le nom, le téléphone et l'adresse ont été vidés ; les montants et la wilaya restent, parce qu'ils appartiennent à votre comptabilité et n'identifient personne.`}
            </s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      <s-section heading="Client">
        <s-stack gap="small-200">
          <s-text type="strong">
            {lead.redacted ? "Client effacé" : lead.customer}
          </s-text>
          {lead.redacted ? null : (
            <s-link href={`tel:${lead.phone}`}>{lead.phone}</s-link>
          )}
          {lead.redacted ? null : <s-text>{lead.address}</s-text>}
          <s-text color="subdued">
            {`${lead.commune}, ${lead.wilayaName} (${lead.wilayaCode})`}
          </s-text>
          <s-text color="subdued">
            {lead.delivery === "DESK"
              ? "Livraison au bureau"
              : "Livraison à domicile"}
          </s-text>
        </s-stack>
      </s-section>

      <s-section heading="Articles" padding="none">
        <s-table>
          <s-table-header-row>
            <s-table-header>Produit</s-table-header>
            <s-table-header>Qté</s-table-header>
            <s-table-header>Prix</s-table-header>
            <s-table-header>Ligne</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {lead.items.map((it, i) => (
              <s-table-row key={i}>
                <s-table-cell>
                  <s-stack gap="small-500">
                    <s-text>{it.title || "Article"}</s-text>
                    {it.option ? (
                      <s-text color="subdued">{it.option}</s-text>
                    ) : null}
                    {/* A quantity break is why a line costs what it does; a
                        merchant checking a total needs to see it was applied. */}
                    {it.offerPrice != null ? (
                      <s-badge tone="success">Offre quantité</s-badge>
                    ) : null}
                  </s-stack>
                </s-table-cell>
                <s-table-cell>{it.qty ?? 1}</s-table-cell>
                <s-table-cell>{money(it.price ?? 0)}</s-table-cell>
                <s-table-cell>{money(it.lineTotal ?? 0)}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Montants">
        <s-stack gap="small-200">
          <s-text>{`Sous-total : ${money(lead.subtotal)}`}</s-text>
          <s-text>{`Livraison : ${money(lead.shipping)}`}</s-text>
          <s-text type="strong">{`Total à encaisser : ${money(lead.total)}`}</s-text>
          {lead.pricesVerified ? null : (
            <s-paragraph>
              Ces prix viennent de la vitrine : Shopify était injoignable au
              moment de la commande, donc ils n'ont pas été confirmés. Vérifiez
              le montant avant de l'annoncer au client.
            </s-paragraph>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Suivi">
        <s-stack gap="small-200">
          {steps
            .filter(([, iso]) => iso)
            .map(([label, iso]) => (
              <s-text key={label}>{`${label} : ${when(iso)}`}</s-text>
            ))}
        </s-stack>
      </s-section>

      {shipment ? (
        <s-section heading="Colis">
          <s-stack gap="small-200">
            <s-text>{`Transporteur : ${shipment.carrierName ?? "—"}`}</s-text>
            <s-text>{`État : ${shipment.state}`}</s-text>
            {shipment.trackingNumber ? (
              <s-text>{`Suivi : ${shipment.trackingNumber}`}</s-text>
            ) : null}
            {shipment.carrierStatus ? (
              <s-text color="subdued">
                {`Statut chez le transporteur : ${shipment.carrierStatus}`}
              </s-text>
            ) : null}
            {shipment.pushedAt ? (
              <s-text color="subdued">{`Envoyé le ${when(shipment.pushedAt)}`}</s-text>
            ) : null}
            {shipment.lastError ? (
              <s-banner tone="warning">
                <s-paragraph>{shipment.lastError}</s-paragraph>
              </s-banner>
            ) : null}
          </s-stack>
        </s-section>
      ) : null}

      <s-section heading="Après l'appel">
        <s-stack direction="inline" gap="small-200">
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <s-button
              key={key}
              variant="secondary"
              tone={
                key === "CANCELLED" || key === "RETURNED" || key === "NO_ANSWER"
                  ? "critical"
                  : undefined
              }
              disabled={key === order.status}
              onClick={() => fetcher.submit({ status: key }, { method: "POST" })}
            >
              {label}
            </s-button>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
