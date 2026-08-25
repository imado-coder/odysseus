/**
 * Webhook receiver.
 *
 * Uninstalling marks the shop rather than deleting it: the merchant's orders
 * are their business record, and a reinstall a week later should find its
 * history intact. Sessions do go, because those are credentials. The store is
 * deleted for real 48 hours later, when Shopify sends `shop/redact`.
 *
 * The three privacy topics are the ones a reviewer will fire at a test store.
 * The logic they call is in app/lib/gdpr.server.ts, kept apart from this file
 * so it can be tested without a Postgres — `npm run test:gdpr`.
 *
 * Everything here is idempotent. Shopify retries any delivery it did not see a
 * 2xx for, so each handler has to survive being run twice on the same payload:
 * redaction writes fixed values rather than transforming what it finds, the
 * data request upserts on Shopify's own id, and deleting an already-deleted
 * shop is the branch that returns `shop: false`.
 */
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncFromWebhook } from "../lib/billing.server";
import {
  recordDataRequest,
  redactCustomer,
  redactShop,
  type CustomerPayload,
} from "../lib/gdpr.server";

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, session, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) await prisma.session.deleteMany({ where: { shop } });
      await prisma.shop.updateMany({
        where: { domain: shop },
        data: { uninstalledAt: new Date() },
      });
      break;

    /* The merchant approved a charge, cancelled it, or Shopify froze it
       because their own Shopify bill went unpaid. All three arrive here, and
       all three change whether this shop may use the app. */
    case "APP_SUBSCRIPTIONS_UPDATE":
      await syncFromWebhook(prisma, shop, payload as Parameters<typeof syncFromWebhook>[2]);
      break;

    /* The shopper asked what is held about them. Shopify offers no way to
       answer it — the app hands the data to the merchant, the merchant hands
       it to the shopper — so this records the request and Réglages assembles
       the export when the merchant opens it. */
    case "CUSTOMERS_DATA_REQUEST": {
      const row = await prisma.shop.findUnique({ where: { domain: shop } });
      if (row) await recordDataRequest(prisma, row.id, payload as CustomerPayload);
      break;
    }

    /* The shopper asked to be forgotten. Their fields are cleared and the
       amounts stay — see gdpr.server.ts for why the row is not deleted. */
    case "CUSTOMERS_REDACT": {
      const row = await prisma.shop.findUnique({ where: { domain: shop } });
      if (row) await redactCustomer(prisma, row.id, payload as CustomerPayload);
      break;
    }

    /* 48 hours after uninstall. Here deletion is deletion. */
    case "SHOP_REDACT":
      await redactShop(prisma, shop);
      break;

    default:
      break;
  }

  return new Response(null, { status: 200 });
}
