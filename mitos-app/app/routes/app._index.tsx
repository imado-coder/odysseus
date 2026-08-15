/**
 * Orders dashboard — the first screen a merchant sees.
 *
 * A cash-on-delivery merchant's day is a call list, so that is what this is:
 * newest first, phone number one tap away, and the status they need to set
 * after the call reachable without opening the row. Anything that does not
 * serve the call is not on this screen.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Text,
  useBreakpoints,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const STATUS_TONE: Record<string, "info" | "success" | "critical" | "warning" | undefined> = {
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

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) return { orders: [], currency: "DZD", counts: {} };

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
      _count: true,
    }),
  ]);

  return {
    currency: shop.currency,
    counts: Object.fromEntries(grouped.map((g) => [g.status, g._count])),
    orders: orders.map((o) => ({
      id: o.id,
      name: o.shopifyName,
      failed: o.createFailed,
      error: o.createError,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      customer: `${o.lead.firstName} ${o.lead.lastName}`,
      phone: o.lead.phone,
      place: `${o.lead.commune}, ${o.lead.wilayaName}`,
      delivery: o.lead.delivery,
      total: o.lead.total,
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id"));
  const status = String(form.get("status"));

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false };

  /* Scoped by shopId as well as id: an id alone would let one merchant update
     another's order by guessing. */
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
    where: { id, shopId: shop.id },
    data: { status: status as never, ...stamp },
  });

  return { ok: true };
}

export default function Orders() {
  const { orders, counts, currency } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const { smDown } = useBreakpoints();

  const money = (n: number) =>
    new Intl.NumberFormat("fr-DZ").format(n) + " " + (currency === "DZD" ? "DA" : currency);

  const setStatus = (id: string, status: string) =>
    fetcher.submit({ id, status }, { method: "POST" });

  if (!orders.length) {
    return (
      <Page>
        <TitleBar title="Commandes" />
        <Card>
          <EmptyState
            heading="Aucune commande pour le moment"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>
              Connectez le formulaire de votre thème à cette application, puis
              passez une commande de test depuis votre boutique.
            </p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <TitleBar title="Commandes" />
      <Layout>
        <Layout.Section>
          <InlineStack gap="200" wrap>
            {Object.entries(STATUS_LABEL).map(([key, label]) =>
              counts[key] ? (
                <Badge key={key} tone={STATUS_TONE[key]}>
                  {`${label} : ${counts[key]}`}
                </Badge>
              ) : null,
            )}
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <IndexTable
              condensed={smDown}
              itemCount={orders.length}
              selectable={false}
              headings={[
                { title: "Commande" },
                { title: "Client" },
                { title: "Téléphone" },
                { title: "Livraison" },
                { title: "Total" },
                { title: "Statut" },
                { title: "Après l'appel" },
              ]}
            >
              {orders.map((o, index) => (
                <IndexTable.Row id={o.id} key={o.id} position={index}>
                  <IndexTable.Cell>
                    {o.failed ? (
                      <BlockStack gap="050">
                        <Badge tone="critical">Échec de création</Badge>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {o.error?.slice(0, 60)}
                        </Text>
                      </BlockStack>
                    ) : (
                      <Text as="span" fontWeight="semibold">
                        {o.name ?? "—"}
                      </Text>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Text as="span">{o.customer}</Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {o.place}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <a href={`tel:${o.phone}`}>{o.phone}</a>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {o.delivery === "DESK" ? "Bureau" : "Domicile"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{money(o.total)}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={STATUS_TONE[o.status]}>
                      {STATUS_LABEL[o.status]}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="100">
                      <Button size="slim" onClick={() => setStatus(o.id, "CONFIRMED")}>
                        Confirmée
                      </Button>
                      <Button size="slim" onClick={() => setStatus(o.id, "NO_ANSWER")}>
                        Sans réponse
                      </Button>
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
