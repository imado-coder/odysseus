/**
 * Products — the catalogue, with what each one did after the call.
 *
 * ── Shopify owns the catalogue ───────────────────────────────────────────
 *
 * Every product on this screen is fetched live from the Admin API on each
 * load. Nothing about a product is stored here: no title, no price, no image,
 * no stock. A copy would be stale within a day of the merchant editing
 * anything, and then there would be two answers to "what does this cost" with
 * no way to tell which is right. The only product data this app keeps is the
 * id, on an `Offer` row.
 *
 * That is also why the paging is Shopify's cursor rather than a page number:
 * the order and the contents of the list belong to them.
 *
 * ── What this screen is for ──────────────────────────────────────────────
 *
 * Shopify already has a product list, so repeating it would be pointless. The
 * column that does not exist anywhere else is the last one: of the orders a
 * product produced, how many survived the phone call and how many came back.
 *
 * For a cash-on-delivery shop that is the whole business. A product with fifty
 * orders and forty refused at the door is losing money on every single one —
 * the merchant pays the return leg — while Shopify's own reports show it as a
 * bestseller, because to Shopify the order was created and that is all it
 * knows.
 */

import type { LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useSearchParams } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
/* Display rules from the plain module, the query from the .server one — a
   component that imports a `.server` file fails the build. */
import {
  EMPTY_STATS,
  lossRate,
  lossTone,
  type ProductStats,
} from "../lib/products";
import { statsByProduct } from "../lib/products.server";

const PAGE = 25;

/* No image field, deliberately. `featuredMedia { preview { image } }` looks
   free and is not: validating it against Shopify's schema turns the required
   scopes from `read_products` alone into read_products, read_files,
   read_images, read_themes, read_draft_orders and read_quick_sale. This app
   asks for three scopes on purpose — every extra one is something App Store
   review asks about — and a thumbnail on a table that is read for its numbers
   is not worth six of them. */
const PRODUCTS = `#graphql
  query CodProducts($first: Int!, $after: String, $q: String) {
    products(first: $first, after: $after, query: $q, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        totalInventory
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount }
        }
      }
    }
  }
`;

type Node = {
  id: string;
  title: string;
  handle: string;
  status: string;
  totalInventory: number | null;
  priceRangeV2?: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string };
  };
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const after = url.searchParams.get("after") || null;

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });

  /* The catalogue and our own numbers are independent — fetch them together
     rather than one after the other. */
  const [res, stats, offerRows] = await Promise.all([
    admin.graphql(PRODUCTS, {
      variables: { first: PAGE, after, q: q || null },
    }),
    shop ? statsByProduct(prisma, shop.id) : Promise.resolve(new Map()),
    shop
      ? prisma.offer.groupBy({
          by: ["productId"],
          where: { shopId: shop.id, enabled: true },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const body = await res.json();
  const page = body?.data?.products;
  const nodes: Node[] = page?.nodes ?? [];

  const offers = new Map(
    offerRows.map((o) => [o.productId, o._count._all]),
  );

  return {
    currency: shop?.currency ?? "DZD",
    hasNextPage: Boolean(page?.pageInfo?.hasNextPage),
    endCursor: (page?.pageInfo?.endCursor ?? null) as string | null,
    products: nodes.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      inventory: p.totalInventory,
      priceMin: p.priceRangeV2?.minVariantPrice?.amount ?? null,
      priceMax: p.priceRangeV2?.maxVariantPrice?.amount ?? null,
      offers: offers.get(p.id) ?? 0,
      stats: (stats.get(p.id) ?? EMPTY_STATS) as ProductStats,
    })),
  };
}

export default function Products() {
  const { products, currency, hasNextPage, endCursor } =
    useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";

  const money = (n: number) =>
    new Intl.NumberFormat("fr-DZ").format(n) +
    " " +
    (currency === "DZD" ? "DA" : currency);

  const price = (min: string | null, max: string | null) => {
    if (!min) return "—";
    const a = Math.round(Number(min));
    const b = max ? Math.round(Number(max)) : a;
    return a === b ? money(a) : `${money(a)} – ${money(b)}`;
  };

  const nextHref = (() => {
    const next = new URLSearchParams(params);
    if (endCursor) next.set("after", endCursor);
    return `/app/products?${next.toString()}`;
  })();

  const firstHref = q ? `/app/products?q=${encodeURIComponent(q)}` : "/app/products";

  return (
    <s-page heading="Produits">
      <TitleBar title="Produits" />

      <s-section>
        <s-paragraph>
          Le catalogue vient de Shopify — c'est lui qui fait foi. Cette page y
          ajoute la seule chose qu'il ne sait pas&nbsp;: ce que chaque produit
          est devenu après l'appel.
        </s-paragraph>
      </s-section>

      <s-section>
        <Form method="get" action="/app/products">
          <s-stack direction="inline" gap="base" alignItems="end">
            <s-search-field
              label="Rechercher un produit"
              name="q"
              defaultValue={q}
              placeholder="Titre du produit"
            />
            <s-button type="submit" variant="secondary">
              Rechercher
            </s-button>
            {q ? (
              <s-button href="/app/products" variant="tertiary">
                Effacer
              </s-button>
            ) : null}
          </s-stack>
        </Form>
      </s-section>

      {products.length === 0 ? (
        <s-section heading={q ? "Aucun produit ne correspond" : "Aucun produit"}>
          <s-paragraph>
            {q
              ? "Aucun produit de votre boutique ne correspond à cette recherche."
              : "Votre boutique Shopify ne contient encore aucun produit."}
          </s-paragraph>
        </s-section>
      ) : (
        <>
          <s-section padding="none">
            <s-table>
              <s-table-header-row>
                <s-table-header>Produit</s-table-header>
                <s-table-header>Prix</s-table-header>
                <s-table-header>Stock</s-table-header>
                <s-table-header>Offres</s-table-header>
                <s-table-header>Commandes</s-table-header>
                <s-table-header>Après l'appel</s-table-header>
              </s-table-header-row>

              <s-table-body>
                {products.map((p) => {
                  const s = p.stats;
                  const rate = lossRate(s);
                  const tone = lossTone(s);

                  return (
                    <s-table-row key={p.id}>
                      <s-table-cell>
                        <s-stack gap="small-500">
                          <s-text type="strong">{p.title}</s-text>
                          {p.status === "ACTIVE" ? null : (
                            <s-badge tone="neutral">
                              {p.status === "DRAFT" ? "Brouillon" : "Archivé"}
                            </s-badge>
                          )}
                        </s-stack>
                      </s-table-cell>

                      <s-table-cell>
                        <s-text fontVariantNumeric="tabular-nums">
                          {price(p.priceMin, p.priceMax)}
                        </s-text>
                      </s-table-cell>

                      <s-table-cell>
                        {/* Shopify returns null when a product does not track
                            stock at all — that is not zero, and showing 0 would
                            read as out of stock. */}
                        {p.inventory == null ? (
                          <s-text color="subdued">non suivi</s-text>
                        ) : (
                          <s-text fontVariantNumeric="tabular-nums">
                            {String(p.inventory)}
                          </s-text>
                        )}
                      </s-table-cell>

                      <s-table-cell>
                        {p.offers > 0 ? (
                          <s-link href={`/app/offers?product=${encodeURIComponent(p.id)}`}>
                            {`${p.offers} offre${p.offers > 1 ? "s" : ""}`}
                          </s-link>
                        ) : (
                          <s-link href={`/app/offers?product=${encodeURIComponent(p.id)}`}>
                            Ajouter
                          </s-link>
                        )}
                      </s-table-cell>

                      <s-table-cell>
                        <s-stack gap="small-500">
                          <s-text fontVariantNumeric="tabular-nums">
                            {String(s.orders)}
                          </s-text>
                          {s.pending > 0 ? (
                            <s-text color="subdued">
                              {`${s.pending} à appeler`}
                            </s-text>
                          ) : null}
                        </s-stack>
                      </s-table-cell>

                      <s-table-cell>
                        {s.orders === 0 ? (
                          <s-text color="subdued">—</s-text>
                        ) : (
                          <s-stack gap="small-500">
                            {/* The rate first, because it is the number that
                                decides whether to keep selling this. */}
                            {rate == null ? (
                              <s-text color="subdued">en attente</s-text>
                            ) : (
                              <s-badge tone={tone}>
                                {`${Math.round(rate * 100)} % perdues`}
                              </s-badge>
                            )}
                            <s-text color="subdued">
                              {`${s.delivered} livrée${s.delivered > 1 ? "s" : ""} · ${s.lost} perdue${s.lost > 1 ? "s" : ""}`}
                            </s-text>
                            {s.deliveredValue > 0 ? (
                              <s-text color="subdued">
                                {`${money(s.deliveredValue)} encaissés`}
                              </s-text>
                            ) : null}
                          </s-stack>
                        )}
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
              </s-table-body>
            </s-table>
          </s-section>

          <s-section>
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text color="subdued">
                {`${products.length} produit${products.length > 1 ? "s" : ""} affiché${products.length > 1 ? "s" : ""}`}
              </s-text>

              {params.get("after") ? (
                <s-button variant="secondary" href={firstHref}>
                  Retour au début
                </s-button>
              ) : null}

              {hasNextPage ? (
                <s-button variant="secondary" href={nextHref}>
                  Produits suivants
                </s-button>
              ) : null}
            </s-stack>
          </s-section>
        </>
      )}

      <s-section heading="Comment lire « après l'appel »">
        <s-paragraph>
          Une commande n'est comptée comme perdue qu'une fois décidée&nbsp;:
          annulée ou retournée. Celles qui attendent encore l'appel ne comptent
          ni d'un côté ni de l'autre, sinon un produit mis en ligne ce matin
          paraîtrait catastrophique. Le pourcentage n'apparaît qu'à partir de
          trois commandes décidées — en dessous, un seul refus ferait passer un
          bon produit pour un mauvais.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
