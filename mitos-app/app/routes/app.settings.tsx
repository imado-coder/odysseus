/**
 * Réglages — the shop's own switches, and the link to the call list.
 *
 * Everything here already existed as columns on ShopSettings; none of it was
 * reachable. The one genuinely new thing is issuing the dashboard link, which
 * until now had to be written into the database by hand.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { buildCustomerExport } from "../lib/gdpr.server";

const DASHBOARD_URL = "https://mitos-commandes.vercel.app";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
    include: {
      settings: true,
      carriers: { orderBy: { name: "asc" } },
      /* Shopify gives the merchant 30 days to answer one of these, and no
         way to answer it through the API. Showing them here is the whole
         mechanism — an unanswered request that nobody can see is a breach
         waiting to be discovered by someone else. */
      dataRequests: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });

  if (!shop) return { ready: false as const };

  return {
    ready: true as const,
    domain: shop.domain,
    currency: shop.currency,
    settings: {
      autoCreateOrder: shop.settings?.autoCreateOrder ?? true,
      orderTag: shop.settings?.orderTag ?? "MITOS-COD",
      defaultHomeRate: shop.settings?.defaultHomeRate ?? 600,
      defaultDeskRate: shop.settings?.defaultDeskRate ?? 350,
      notifyEmail: shop.settings?.notifyEmail ?? "",
      hasDashboardToken: Boolean(shop.settings?.dashboardToken),
    },
    carriers: shop.carriers.map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      isDefault: c.isDefault,
      enabled: c.enabled,
      linked: Boolean(c.credentialsRef),
    })),
    dataRequests: shop.dataRequests.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerPhone: r.customerPhone,
      orderIds: r.orderIds,
      createdAt: r.createdAt.toISOString().slice(0, 10),
      deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString().slice(0, 10) : null,
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) return { ok: false, error: "unknown_shop" };

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");

  if (intent === "issue-link") {
    /* A fresh secret every time this is pressed, which is also how a leaked
       link is revoked: issuing a new one invalidates the old immediately,
       because the column holds exactly one value. */
    const token = crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "").slice(0, 8);

    await prisma.shopSettings.upsert({
      where: { shopId: shop.id },
      update: { dashboardToken: token },
      create: { shopId: shop.id, dashboardToken: token },
    });

    return { ok: true, link: `${DASHBOARD_URL}/?k=${token}` };
  }

  /* Assemble the export now rather than when the webhook arrived, so a
     shopper who asked to be forgotten in between is not handed back by a
     copy we made earlier. See app/lib/gdpr.server.ts. */
  if (intent === "export-request") {
    const id = String(form.get("requestId") ?? "");
    const req = await prisma.dataRequest.findFirst({ where: { id, shopId: shop.id } });
    if (!req) return { ok: false, error: "unknown_request" };

    const data = await buildCustomerExport(prisma, shop.id, {
      customer: { id: req.customerId ?? undefined, phone: req.customerPhone ?? undefined },
      orders_requested: req.orderIds,
    });

    await prisma.dataRequest.update({
      where: { id: req.id },
      data: { deliveredAt: new Date() },
    });

    return { ok: true, requestId: req.id, export: JSON.stringify(data, null, 2) };
  }

  /* Deleting the row also deletes the phone number stored on it, which is the
     only personal data this table holds. */
  if (intent === "forget-request") {
    await prisma.dataRequest.deleteMany({
      where: { id: String(form.get("requestId") ?? ""), shopId: shop.id },
    });
    return { ok: true, forgot: true };
  }

  const int = (name: string, fallback: number) => {
    const n = Math.round(Number(String(form.get(name) ?? "").trim()));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  await prisma.shopSettings.upsert({
    where: { shopId: shop.id },
    update: {
      autoCreateOrder: form.get("autoCreateOrder") === "on",
      orderTag: String(form.get("orderTag") ?? "MITOS-COD").trim().slice(0, 40) || "MITOS-COD",
      defaultHomeRate: int("defaultHomeRate", 600),
      defaultDeskRate: int("defaultDeskRate", 350),
      notifyEmail: String(form.get("notifyEmail") ?? "").trim() || null,
    },
    create: {
      shopId: shop.id,
      autoCreateOrder: form.get("autoCreateOrder") === "on",
      orderTag: String(form.get("orderTag") ?? "MITOS-COD").trim().slice(0, 40) || "MITOS-COD",
      defaultHomeRate: int("defaultHomeRate", 600),
      defaultDeskRate: int("defaultDeskRate", 350),
      notifyEmail: String(form.get("notifyEmail") ?? "").trim() || null,
    },
  });

  return { ok: true, saved: true };
}

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  if (!data.ready) {
    return (
      <s-page heading="Réglages">
        <TitleBar title="Réglages" />
        <s-section heading="Boutique introuvable">
          <s-paragraph>
            Cette boutique n'est pas encore enregistrée dans MITOS.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const { settings, carriers, domain, currency, dataRequests } = data;

  return (
    <s-page heading="Réglages">
      <TitleBar title="Réglages" />

      {result && "saved" in result && result.saved ? (
        <s-section>
          <s-badge tone="success">Enregistré</s-badge>
        </s-section>
      ) : null}

      <Form method="post">
        <s-section heading="Commandes">
          <s-stack gap="small">
            <label style={row}>
              <input
                type="checkbox"
                name="autoCreateOrder"
                defaultChecked={settings.autoCreateOrder}
                style={check}
              />
              <span>
                Créer la commande Shopify immédiatement. Décochez pour garder le
                lead et n'ouvrir la commande qu'après l'appel.
              </span>
            </label>

            <label style={field}>
              <span style={lbl}>Étiquette appliquée à chaque commande</span>
              <input name="orderTag" defaultValue={settings.orderTag} style={input} />
            </label>

            <label style={field}>
              <span style={lbl}>E-mail de notification</span>
              <input
                type="email"
                name="notifyEmail"
                defaultValue={settings.notifyEmail}
                placeholder="vous@exemple.com"
                style={input}
              />
            </label>
          </s-stack>
        </s-section>

        <s-section heading="Tarifs par défaut">
          <s-paragraph>
            Utilisés pour une wilaya qui n'a de prix ni chez le transporteur par
            défaut ni dans la liste de la boutique.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <label style={field}>
              <span style={lbl}>Domicile ({currency})</span>
              <input
                type="number"
                min="0"
                step="10"
                name="defaultHomeRate"
                defaultValue={settings.defaultHomeRate}
                style={input}
              />
            </label>
            <label style={field}>
              <span style={lbl}>Bureau ({currency})</span>
              <input
                type="number"
                min="0"
                step="10"
                name="defaultDeskRate"
                defaultValue={settings.defaultDeskRate}
                style={input}
              />
            </label>
          </s-stack>
        </s-section>

        <s-section>
          <s-button type="submit" variant="primary" loading={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </s-button>
        </s-section>
      </Form>

      <s-section heading="Transporteurs">
        {carriers.length === 0 ? (
          <s-paragraph>
            Aucun transporteur relié. Les commandes confirmées restent à
            expédier à la main tant qu'il n'y en a pas.
          </s-paragraph>
        ) : (
          <s-stack gap="small-200">
            {carriers.map((c) => (
              <s-stack key={c.id} direction="inline" gap="small-200">
                <s-text type="strong">{c.name}</s-text>
                <s-text color="subdued">{c.provider.replace(/_/g, " ")}</s-text>
                {c.isDefault ? <s-badge tone="success">Par défaut</s-badge> : null}
                {c.linked ? null : <s-badge tone="warning">Sans identifiants</s-badge>}
                {c.enabled ? null : <s-badge tone="critical">Désactivé</s-badge>}
              </s-stack>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Confidentialité (RGPD)">
        <s-paragraph>
          Quand un client demande à Shopify les données que nous détenons sur
          lui, la demande arrive ici. Shopify n'offre aucun moyen d'y répondre
          automatiquement : vous avez 30 jours pour lui transmettre le contenu
          ci-dessous.
        </s-paragraph>

        {dataRequests.length === 0 ? (
          <s-paragraph>Aucune demande en attente.</s-paragraph>
        ) : (
          <s-stack gap="base">
            {dataRequests.map((r) => (
              <s-stack key={r.id} gap="small-200">
                <s-stack direction="inline" gap="small-200">
                  <s-text type="strong">{r.customerPhone ?? r.customerId ?? "Client inconnu"}</s-text>
                  <s-text color="subdued">reçue le {r.createdAt}</s-text>
                  {r.deliveredAt ? (
                    <s-badge tone="success">Transmise le {r.deliveredAt}</s-badge>
                  ) : (
                    <s-badge tone="warning">À transmettre</s-badge>
                  )}
                </s-stack>

                <s-stack direction="inline" gap="small-200">
                  <Form method="post">
                    <input type="hidden" name="intent" value="export-request" />
                    <input type="hidden" name="requestId" value={r.id} />
                    <s-button type="submit">Afficher les données</s-button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="forget-request" />
                    <input type="hidden" name="requestId" value={r.id} />
                    <s-button type="submit" variant="tertiary">Effacer la demande</s-button>
                  </Form>
                </s-stack>

                {result && "requestId" in result && result.requestId === r.id ? (
                  <pre style={code}>{(result as { export: string }).export}</pre>
                ) : null}
              </s-stack>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Liste d'appels">
        <s-paragraph>
          L'écran d'appel s'ouvre sur le téléphone, hors de l'admin Shopify.
          Il ne donne accès qu'à {domain}.
        </s-paragraph>

        {result && "link" in result && result.link ? (
          <s-stack gap="small-200">
            <s-badge tone="success">Nouveau lien émis</s-badge>
            {/* Shown once. It is not stored anywhere it can be read back —
                the column holds the secret, not the URL. */}
            <s-text
              type="strong"
              fontVariantNumeric="tabular-nums"
            >
              {result.link}
            </s-text>
            <s-text color="subdued">
              Copiez-le maintenant : il ne sera plus affiché. Émettre un nouveau
              lien annule immédiatement le précédent.
            </s-text>
          </s-stack>
        ) : (
          <s-paragraph>
            {settings.hasDashboardToken
              ? "Un lien est déjà actif. En émettre un nouveau annule l'ancien."
              : "Aucun lien émis pour le moment."}
          </s-paragraph>
        )}

        <Form method="post">
          <input type="hidden" name="intent" value="issue-link" />
          <s-button type="submit">
            {settings.hasDashboardToken ? "Émettre un nouveau lien" : "Émettre le lien"}
          </s-button>
        </Form>
      </s-section>
    </s-page>
  );
}

const row: React.CSSProperties = {
  display: "flex",
  gap: ".5rem",
  alignItems: "flex-start",
  cursor: "pointer",
};
const check: React.CSSProperties = { width: 18, height: 18, marginTop: 3, flex: "0 0 auto" };
const field: React.CSSProperties = { display: "grid", gap: ".25rem" };
const lbl: React.CSSProperties = { fontSize: ".8125rem", color: "#616161" };
/* 16px, for the same reason as everywhere else: anything smaller and iOS
   zooms in on focus and does not zoom back. */
/* The export is JSON the merchant copies out. Wrapping rather than scrolling,
   because an address that runs off the right edge is an address they will
   forget to send. */
const code: React.CSSProperties = {
  margin: 0,
  padding: ".75rem",
  background: "#f6f6f7",
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  fontSize: ".8125rem",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: "24rem",
  overflowY: "auto",
};
const input: React.CSSProperties = {
  minHeight: "36px",
  padding: "0 .5rem",
  fontSize: "16px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
};
