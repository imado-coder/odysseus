/**
 * Abonnement — the one screen where money is discussed.
 *
 * ── This screen repairs itself ───────────────────────────────────────────
 *
 * Every other screen reads the stored `Subscription` row, which is a copy of
 * Shopify's answer kept fresh by the `app_subscriptions/update` webhook. A
 * webhook can be missed — a deploy landing mid-delivery, a 500 — and when one
 * is, the merchant is being charged and locked out at the same time.
 *
 * This is the screen they will open when that happens, so this is the screen
 * that asks Shopify directly and writes the answer down. Everywhere else can
 * then stay a cheap indexed read.
 *
 * ── The charge is created by Shopify, not by us ──────────────────────────
 *
 * `billing.request` does not charge anyone. It creates a pending subscription
 * and throws a redirect to Shopify's own approval screen, where the merchant
 * sees the price, the trial and the interval in Shopify's words and agrees to
 * them there. Nothing in this app can approve a charge on a merchant's behalf,
 * and that is the point of the Billing API.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { IS_TEST, syncFromShopify } from "../lib/billing.server";
import {
  INCLUDED,
  PLAN,
  TRIAL_DAYS,
  entitlementOf,
  priceLabel,
} from "../lib/plans";

/**
 * Back inside the admin, on this screen, after Shopify's approval page.
 *
 * Built from the shop's own handle rather than SHOPIFY_APP_URL: Shopify sends
 * the merchant's browser here at the top level, and the app URL on its own
 * would land them outside the admin frame and make them look at a bare page
 * with no Shopify navigation while the app bounced them back in.
 */
function returnUrl(shopDomain: string, apiKey: string) {
  const handle = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${handle}/apps/${apiKey}/app/billing`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { billing, session } = await authenticate.admin(request);

  /* Shopify, not the stored row — see the note at the top. */
  const check = await billing.check({ isTest: IS_TEST });

  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  const stored = shop
    ? await syncFromShopify(prisma, shop.id, check.appSubscriptions)
    : null;

  return {
    plan: PLAN,
    price: priceLabel(),
    trialDays: TRIAL_DAYS,
    included: [...INCLUDED],
    isTestMode: IS_TEST,
    subscription: stored
      ? {
          plan: stored.plan,
          status: stored.status,
          isTest: stored.isTest,
          trialEndsAt: stored.trialEndsAt?.toISOString() ?? null,
          currentPeriodEnd: stored.currentPeriodEnd?.toISOString() ?? null,
        }
      : null,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { billing, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "cancel") {
    const shop = await prisma.shop.findUnique({
      where: { domain: session.shop },
    });
    const stored = shop
      ? await prisma.subscription.findUnique({ where: { shopId: shop.id } })
      : null;

    if (stored?.chargeId) {
      await billing.cancel({
        subscriptionId: stored.chargeId,
        /* No proration. The merchant has paid for this period and keeps it —
           refunding it would also claw the same amount back out of the
           Partner account, which is not what "cancel" is being asked to do. */
        prorate: false,
        isTest: stored.isTest,
      });
      await prisma.subscription.update({
        where: { shopId: stored.shopId },
        data: { status: "CANCELLED", currentPeriodEnd: null },
      });
    }
    /* Straight back through the loader, so what the merchant reads next is
       Shopify's answer rather than this action's opinion of it. */
    return redirect("/app/billing");
  }

  /* Throws a redirect to Shopify's approval screen — nothing after this
     line runs, and nothing has been charged. */
  return billing.request({
    plan: PLAN,
    isTest: IS_TEST,
    returnUrl: returnUrl(session.shop, process.env.SHOPIFY_API_KEY || ""),
  });
}

export default function Billing() {
  const { plan, price, trialDays, included, isTestMode, subscription } =
    useLoaderData<typeof loader>();

  const ent = entitlementOf(subscription);
  const active = ent.state === "active";

  const day = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
          new Date(iso),
        )
      : null;

  return (
    <s-page heading="Abonnement">
      <TitleBar title="Abonnement" />

      {/* A shop billed in test mode pays nothing, and looks identical
          everywhere else in the API. If it is ever true in production, it has
          to be readable on the screen rather than discovered in the bank. */}
      {isTestMode ? (
        <s-section>
          <s-banner tone="warning" heading="Mode test">
            <s-paragraph>
              Les abonnements créés ici ne facturent personne. C'est le mode
              attendu sur une boutique de développement. Sur une vraie
              boutique, définissez <s-text type="strong">
              MITOS_BILLING_TEST=false</s-text>.
            </s-paragraph>
          </s-banner>
        </s-section>
      ) : null}

      <s-section heading={`MITOS ${plan}`}>
        <s-stack gap="base">
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-heading>{price}</s-heading>
            {active ? (
              <s-badge tone="success">Actif</s-badge>
            ) : (
              <s-badge tone="neutral">Aucun abonnement</s-badge>
            )}
            {active && subscription?.isTest ? (
              <s-badge tone="warning">test — non facturé</s-badge>
            ) : null}
          </s-stack>

          {active ? (
            <>
              {ent.trialDaysLeft > 0 ? (
                <s-paragraph>
                  Essai gratuit&nbsp;: {ent.trialDaysLeft}{" "}
                  {ent.trialDaysLeft > 1 ? "jours restants" : "jour restant"}.
                  {day(subscription?.trialEndsAt ?? null)
                    ? ` Première facture le ${day(subscription!.trialEndsAt)}.`
                    : null}
                </s-paragraph>
              ) : day(subscription?.currentPeriodEnd ?? null) ? (
                <s-paragraph>
                  Prochaine facture le {day(subscription!.currentPeriodEnd)}.
                </s-paragraph>
              ) : null}
            </>
          ) : (
            <s-paragraph>
              {trialDays} jours d'essai gratuit. Vous n'êtes facturé qu'au{" "}
              {trialDays + 1}
              <sup>e</sup> jour, et désinstaller avant ne coûte rien.
            </s-paragraph>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Ce qui est inclus">
        <s-unordered-list>
          {included.map((line) => (
            <s-list-item key={line}>{line}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      <s-section>
        {active ? (
          <s-stack gap="base">
            <s-paragraph>
              L'abonnement est géré par Shopify et apparaît sur votre facture
              Shopify. Vous pouvez l'annuler ici ou depuis votre admin.
            </s-paragraph>
            <Form method="post">
              <input type="hidden" name="intent" value="cancel" />
              <s-button type="submit" variant="secondary" tone="critical">
                Annuler l'abonnement
              </s-button>
            </Form>
          </s-stack>
        ) : (
          <s-stack gap="base">
            <s-paragraph>
              Shopify vous montrera le prix et la durée d'essai avant de vous
              demander votre accord. Rien n'est facturé tant que vous
              n'approuvez pas.
            </s-paragraph>
            <Form method="post">
              <s-button type="submit" variant="primary">
                Commencer l'essai de {trialDays} jours
              </s-button>
            </Form>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
