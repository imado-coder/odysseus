/**
 * Offres — quantity breaks, per product.
 *
 * "Buy 3 for 5 000 DA" is one row: quantity 3, price 5 000. The price is the
 * total for the whole quantity, not per unit, because that is the number the
 * merchant says out loud and dividing it into thirds would charge something
 * they never typed.
 *
 * Products come from Shopify and are not copied here. The only thing MITOS
 * stores is the product's GID on the offer row — the title, price and image
 * stay where they are already maintained, and a product renamed in Shopify is
 * renamed here without a sync.
 *
 * The storefront shows these offers; it does not get to decide what they
 * cost. Both order endpoints look the same row up again by
 * (shop, product, quantity) and charge what they find.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PRODUCTS = `#graphql
  query OfferProducts($q: String) {
    products(first: 50, query: $q, sortKey: TITLE) {
      nodes { id title featuredImage { url } }
    }
  }
`;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") ?? "";
  const selected = url.searchParams.get("product") ?? "";

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });

  /* Shopify being slow or unhappy must not blank the screen — the offers are
     ours and can still be listed and edited without the catalogue. */
  let products: { id: string; title: string; image: string | null }[] = [];
  let catalogueError: string | null = null;
  try {
    const res = await admin.graphql(PRODUCTS, {
      variables: { q: search || null },
    });
    const body = await res.json();
    products = (body?.data?.products?.nodes ?? []).map(
      (p: { id: string; title: string; featuredImage?: { url: string } }) => ({
        id: p.id,
        title: p.title,
        image: p.featuredImage?.url ?? null,
      }),
    );
  } catch (e) {
    catalogueError = e instanceof Error ? e.message : "shopify_unreachable";
  }

  const offers = shop
    ? await prisma.offer.findMany({
        where: { shopId: shop.id, ...(selected ? { productId: selected } : {}) },
        orderBy: [{ productId: "asc" }, { quantity: "asc" }],
      })
    : [];

  const titles = new Map(products.map((p) => [p.id, p.title]));

  return {
    ready: Boolean(shop),
    search,
    selected,
    products,
    catalogueError,
    offers: offers.map((o) => ({
      id: o.id,
      productId: o.productId,
      /* A product that has left the current search still shows something
         useful rather than a bare GID. */
      productTitle: titles.get(o.productId) ?? o.productId.split("/").pop(),
      quantity: o.quantity,
      price: o.price,
      label: o.label ?? "",
      badge: o.badge ?? "",
      featured: o.featured,
      enabled: o.enabled,
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false, error: "unknown_shop" };

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  /* Every write is matched on shopId as well as id. An offer id alone must
     never be enough to touch another merchant's pricing. */
  if (intent === "toggle" || intent === "delete") {
    const id = String(form.get("id") ?? "");
    const mine = await prisma.offer.findFirst({
      where: { id, shopId: shop.id },
      select: { id: true, enabled: true },
    });
    if (!mine) return { ok: false, error: "not_found" };

    if (intent === "delete") {
      await prisma.offer.delete({ where: { id: mine.id } });
      return { ok: true, deleted: true };
    }
    await prisma.offer.update({
      where: { id: mine.id },
      data: { enabled: !mine.enabled },
    });
    return { ok: true, toggled: true };
  }

  const productId = String(form.get("productId") ?? "").trim();
  if (!productId.startsWith("gid://shopify/Product/")) {
    return { ok: false, error: "choose_a_product" };
  }

  const quantity = Math.round(Number(form.get("quantity")));
  const price = Math.round(Number(form.get("price")));
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 99) {
    return { ok: false, error: "bad_quantity" };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "bad_price" };
  }

  /* One row per (shop, product, quantity) — the same break cannot be defined
     twice with two different prices, which is a rule the database already
     holds. Saving the same quantity again edits it rather than failing. */
  await prisma.offer.upsert({
    where: {
      shopId_productId_quantity: { shopId: shop.id, productId, quantity },
    },
    update: {
      price,
      label: String(form.get("label") ?? "").trim() || null,
      badge: String(form.get("badge") ?? "").trim() || null,
      featured: form.get("featured") === "on",
      enabled: true,
    },
    create: {
      shopId: shop.id,
      productId,
      quantity,
      price,
      label: String(form.get("label") ?? "").trim() || null,
      badge: String(form.get("badge") ?? "").trim() || null,
      featured: form.get("featured") === "on",
    },
  });

  return { ok: true, saved: true };
}

export default function Offers() {
  const { ready, products, offers, selected, search, catalogueError } =
    useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  if (!ready) {
    return (
      <s-page heading="Offres">
        <TitleBar title="Offres" />
        <s-section heading="Boutique introuvable">
          <s-paragraph>
            Cette boutique n'est pas encore enregistrée dans MITOS.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <s-page heading="Offres">
      <TitleBar title="Offres" />

      <s-section>
        <s-paragraph>
          « 3 pour 5 000 DA » est une ligne : quantité 3, prix 5 000. Le prix
          est le total de la quantité, pas le prix à l'unité. Le formulaire de
          commande les affiche, et le serveur les relit pour facturer.
        </s-paragraph>

        {catalogueError ? (
          <s-banner tone="warning">
            Catalogue Shopify indisponible ({catalogueError}). Les offres
            existantes restent modifiables.
          </s-banner>
        ) : null}

        <s-stack direction="inline" gap="small-200">
          <input
            type="search"
            defaultValue={search}
            placeholder="Chercher un produit…"
            aria-label="Chercher un produit"
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("q", e.currentTarget.value.trim());
            }}
            style={input}
          />
          <select
            value={selected}
            onChange={(e) => setParam("product", e.currentTarget.value)}
            aria-label="Produit"
            style={input}
          >
            <option value="">Tous les produits</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </s-stack>
      </s-section>

      <s-section heading="Ajouter une offre">
        <Form method="post">
          <s-stack gap="small">
            <select name="productId" defaultValue={selected} required style={input}>
              <option value="">Choisir le produit…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>

            <s-stack direction="inline" gap="small-200">
              <label style={field}>
                <span style={lbl}>Quantité</span>
                <input type="number" name="quantity" min="1" max="99" defaultValue="2" style={input} />
              </label>
              <label style={field}>
                <span style={lbl}>Prix total</span>
                <input type="number" name="price" min="0" step="10" required style={input} />
              </label>
            </s-stack>

            <s-stack direction="inline" gap="small-200">
              <label style={field}>
                <span style={lbl}>Libellé (optionnel)</span>
                <input name="label" placeholder="Pack duo" style={input} />
              </label>
              <label style={field}>
                <span style={lbl}>Badge (optionnel)</span>
                <input name="badge" placeholder="-20%" style={input} />
              </label>
            </s-stack>

            <label style={row}>
              <input type="checkbox" name="featured" style={check} />
              <span>Mettre en avant</span>
            </label>

            <s-button type="submit" variant="primary" loading={busy}>
              Enregistrer l'offre
            </s-button>
          </s-stack>
        </Form>
      </s-section>

      <s-section padding="none" heading="Offres existantes">
        {offers.length === 0 ? (
          <s-section>
            <s-paragraph>
              Aucune offre. Un produit sans offre s'achète simplement à l'unité —
              rien ne change pour lui.
            </s-paragraph>
          </s-section>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Produit</s-table-header>
              <s-table-header>Quantité</s-table-header>
              <s-table-header>Prix total</s-table-header>
              <s-table-header>État</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {offers.map((o) => (
                <s-table-row key={o.id}>
                  <s-table-cell>
                    <s-stack gap="small-500">
                      <s-text>{o.productTitle}</s-text>
                      {o.label ? <s-text color="subdued">{o.label}</s-text> : null}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text fontVariantNumeric="tabular-nums">{o.quantity}</s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-text fontVariantNumeric="tabular-nums" type="strong">
                      {o.price}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-500">
                      <s-badge tone={o.enabled ? "success" : "neutral"}>
                        {o.enabled ? "Active" : "Inactive"}
                      </s-badge>
                      {o.featured ? <s-badge tone="info">En avant</s-badge> : null}
                      {o.badge ? <s-badge>{o.badge}</s-badge> : null}
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-500">
                      <Form method="post">
                        <input type="hidden" name="intent" value="toggle" />
                        <input type="hidden" name="id" value={o.id} />
                        <s-button type="submit" variant="secondary">
                          {o.enabled ? "Désactiver" : "Activer"}
                        </s-button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={o.id} />
                        <s-button type="submit" variant="secondary" tone="critical">
                          Supprimer
                        </s-button>
                      </Form>
                    </s-stack>
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

/* 16px everywhere: below it, iOS zooms on focus and never zooms back. */
const input: React.CSSProperties = {
  minHeight: "36px",
  padding: "0 .5rem",
  fontSize: "16px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
};
const field: React.CSSProperties = { display: "grid", gap: ".25rem" };
const lbl: React.CSSProperties = { fontSize: ".8125rem", color: "#616161" };
const row: React.CSSProperties = {
  display: "flex",
  gap: ".5rem",
  alignItems: "center",
  cursor: "pointer",
};
const check: React.CSSProperties = { width: 18, height: 18, flex: "0 0 auto" };
