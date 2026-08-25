/**
 * Shopify app configuration.
 *
 * The one piece of real logic here is afterAuth: installation is when we
 * learn who the merchant is, so that is where the Shop row, its settings and
 * its default shipping rates get created. Everything downstream assumes those
 * exist.
 */
import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import type { BillingConfigRecurringLineItem } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { PLAN, PRICE, TRIAL_DAYS } from "./lib/plans";

/**
 * The one plan, assembled from app/lib/plans.ts.
 *
 * The numbers live there because the pricing screen renders them, and a price
 * quoted on a screen that differs from the price Shopify charges is the worst
 * possible bug in this file. This is the only place that touches Shopify's
 * enums — plans.ts is imported by the browser and must not.
 *
 * The key is the name Shopify shows the merchant on the charge approval screen
 * and prints on their invoice. `billing.check` also matches on it, so renaming
 * it orphans every subscription that already exists.
 */
/* Annotated, not inferred: in a mutable array an enum member widens to the
   whole BillingInterval union, and Shopify's config type then cannot tell a
   recurring line item from a usage-based one. */
const lineItems: BillingConfigRecurringLineItem[] = [
  {
    amount: PRICE.amount,
    currencyCode: PRICE.currencyCode,
    interval: BillingInterval.Every30Days,
  },
];

const billing = {
  [PLAN]: { trialDays: TRIAL_DAYS, lineItems },
};

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  /* Pinned to the newest stable release the installed library knows. */
  apiVersion: ApiVersion.October26,
  scopes: process.env.SCOPES?.split(","),
  billing,
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  /* The new embedded auth strategy is no longer a flag — it is the only
     strategy in v2 of the library, so there is nothing to opt into here. */

  hooks: {
    afterAuth: async ({ session, admin }) => {
      shopify.registerWebhooks({ session });

      /* Read the store's own currency and name rather than assuming: a
         merchant selling in DZD and one selling in EUR both install this. */
      const res = await admin.graphql(
        `#graphql
          query ShopInfo {
            shop { name contactEmail currencyCode }
          }`,
      );
      const info = (await res.json())?.data?.shop;

      const shop = await prisma.shop.upsert({
        where: { domain: session.shop },
        update: {
          name: info?.name,
          email: info?.contactEmail,
          currency: info?.currencyCode ?? "DZD",
          uninstalledAt: null,
        },
        create: {
          domain: session.shop,
          name: info?.name,
          email: info?.contactEmail,
          currency: info?.currencyCode ?? "DZD",
        },
      });

      await prisma.shopSettings.upsert({
        where: { shopId: shop.id },
        update: {},
        create: { shopId: shop.id },
      });

      /* Seed a rate for every wilaya so the merchant edits numbers rather than
         starting from an empty table and wondering why shipping is missing. */
      const rateCount = await prisma.shippingRate.count({
        where: { shopId: shop.id },
      });

      if (rateCount === 0) {
        const wilayas = await prisma.wilaya.findMany({ select: { code: true } });
        if (wilayas.length) {
          await prisma.shippingRate.createMany({
            data: wilayas.map((w) => ({
              shopId: shop.id,
              wilayaCode: w.code,
              homeRate: 600,
              deskRate: 350,
            })),
            skipDuplicates: true,
          });
        }
      }
    },
  },

  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
    /* Approve, cancel, freeze. Without this the stored subscription only
       changes when someone happens to open the pricing screen, and a shop
       that cancelled keeps working until they do. */
    APP_SUBSCRIPTIONS_UPDATE: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
