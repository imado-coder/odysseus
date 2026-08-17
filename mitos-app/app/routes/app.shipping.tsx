/**
 * Frais de livraison — the shipping table, inside the Shopify admin.
 *
 * This screen and the one in mitos-dashboard read and write the same rows.
 * There is no second table and no import step: whichever the merchant edits,
 * the storefront quotes from it and the order endpoint charges from it.
 *
 * Prices are per wilaya *and* per carrier. The scope selector at the top
 * chooses which table is being edited — the shop's own list, or one carrier's.
 * A wilaya the chosen carrier has not priced falls back to the shop's list,
 * and then to the shop defaults, which is why an unset field shows the figure
 * it would fall back to as a placeholder rather than pretending to be zero.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  /* "" means the shop's own list — the rows whose carrierId is null. */
  const scope = url.searchParams.get("carrier") ?? "";

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
    include: { settings: true, carriers: { orderBy: { name: "asc" } } },
  });

  if (!shop) {
    return { ready: false as const, wilayas: [], carriers: [], scope, fallback: [600, 350] };
  }

  const [wilayas, rates] = await Promise.all([
    prisma.wilaya.findMany({ orderBy: { code: "asc" } }),
    prisma.shippingRate.findMany({
      where: { shopId: shop.id, carrierId: scope || null },
    }),
  ]);

  const byCode = new Map(rates.map((r) => [r.wilayaCode, r]));

  return {
    ready: true as const,
    scope,
    carriers: shop.carriers.map((c) => ({ id: c.id, name: c.name, provider: c.provider })),
    fallback: [
      shop.settings?.defaultHomeRate ?? 600,
      shop.settings?.defaultDeskRate ?? 350,
    ],
    wilayas: wilayas.map((w) => ({
      code: w.code,
      name: w.nameFr,
      home: byCode.get(w.code)?.homeRate ?? null,
      desk: byCode.get(w.code)?.deskRate ?? null,
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false, error: "unknown_shop" };

  const form = await request.formData();
  const scope = String(form.get("carrier") ?? "") || null;

  /* A carrier id from the form is only honoured if it belongs to this shop.
     An id alone must never reach a write. */
  if (scope) {
    const owned = await prisma.carrier.findFirst({
      where: { id: scope, shopId: shop.id },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "unknown_carrier" };
  }

  const rows: { code: string; home: number; desk: number }[] = [];
  for (const [key, value] of form.entries()) {
    const m = /^home-(\d{2})$/.exec(key);
    if (!m) continue;
    const code = m[1];
    const homeRaw = String(value).trim();
    const deskRaw = String(form.get(`desk-${code}`) ?? "").trim();
    /* Both blank means "not set for this scope", which is a real state and
       different from zero — free delivery is a price, absence is not. */
    if (!homeRaw && !deskRaw) continue;
    const home = Math.round(Number(homeRaw));
    const desk = Math.round(Number(deskRaw));
    if (!Number.isFinite(home) || !Number.isFinite(desk) || home < 0 || desk < 0) {
      return { ok: false, error: "bad_rate", detail: code };
    }
    rows.push({ code, home, desk });
  }

  /* All of it or none of it: a half-saved table quotes some wilayas at the new
     price and some at the old, with nothing on screen to say which.

     Raw SQL because the unique index is on COALESCE("carrierId", '') — an
     expression Prisma cannot describe, so it has no compound key to upsert on. */
  await prisma.$transaction(
    rows.map((r) =>
      prisma.$executeRaw`
        INSERT INTO "ShippingRate" (id, "shopId", "carrierId", "wilayaCode", "homeRate", "deskRate", enabled)
        VALUES (gen_random_uuid()::text, ${shop.id}, ${scope}, ${r.code}, ${r.home}, ${r.desk}, true)
        ON CONFLICT ("shopId", COALESCE("carrierId", ''), "wilayaCode")
        DO UPDATE SET "homeRate" = ${r.home}, "deskRate" = ${r.desk}, enabled = true
      `,
    ),
  );

  return { ok: true, saved: rows.length };
}

export default function Shipping() {
  const { ready, wilayas, carriers, scope, fallback } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const [params, setParams] = useSearchParams();
  const busy = nav.state !== "idle";

  if (!ready) {
    return (
      <s-page heading="Frais de livraison">
        <TitleBar title="Frais de livraison" />
        <s-section heading="Boutique introuvable">
          <s-paragraph>
            Cette boutique n'est pas encore enregistrée dans MITOS. Réinstallez
            l'application pour créer sa fiche.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Frais de livraison">
      <TitleBar title="Frais de livraison" />

      <s-section>
        <s-paragraph>
          Le prix affiché au client est celui qui lui est facturé : la boutique
          interroge cette table, et la commande est recalculée dessus.
        </s-paragraph>

        {carriers.length > 0 ? (
          <s-stack direction="inline" gap="small-200">
            <label htmlFor="scope">Table&nbsp;:</label>
            {/* Native control rather than a Polaris form element: the web
                component set is loaded from Shopify's CDN and its field API
                is not something to guess at — a wrong tag name renders
                nothing at all, which is worse than a plain select. */}
            <select
              id="scope"
              value={scope}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                if (e.currentTarget.value) next.set("carrier", e.currentTarget.value);
                else next.delete("carrier");
                setParams(next);
              }}
              style={selectStyle}
            >
              <option value="">Liste de la boutique</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.provider.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </s-stack>
        ) : null}
      </s-section>

      <Form method="post">
        <input type="hidden" name="carrier" value={scope} />

        <s-section padding="none">
          <s-table>
            <s-table-header-row>
              <s-table-header>Wilaya</s-table-header>
              <s-table-header>Domicile</s-table-header>
              <s-table-header>Bureau</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {wilayas.map((w) => (
                <s-table-row key={w.code}>
                  <s-table-cell>
                    <s-text>
                      {w.code} — {w.name}
                    </s-text>
                  </s-table-cell>
                  <s-table-cell>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      name={`home-${w.code}`}
                      defaultValue={w.home ?? ""}
                      placeholder={String(fallback[0])}
                      aria-label={`Domicile ${w.name}`}
                      style={inputStyle}
                    />
                  </s-table-cell>
                  <s-table-cell>
                    <input
                      type="number"
                      min="0"
                      step="10"
                      name={`desk-${w.code}`}
                      defaultValue={w.desk ?? ""}
                      placeholder={String(fallback[1])}
                      aria-label={`Bureau ${w.name}`}
                      style={inputStyle}
                    />
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>

        <s-section>
          <s-button type="submit" variant="primary" loading={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </s-button>
        </s-section>
      </Form>
    </s-page>
  );
}

/* 16px is not a style preference: below it, iOS zooms the page on focus and
   never zooms back, which on a 58-row table leaves the merchant stranded. */
const inputStyle: React.CSSProperties = {
  width: "6rem",
  minHeight: "36px",
  padding: "0 .5rem",
  fontSize: "16px",
  fontVariantNumeric: "tabular-nums",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
};

const selectStyle: React.CSSProperties = {
  minHeight: "36px",
  fontSize: "16px",
  padding: "0 .5rem",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
};
