/**
 * Webhook receiver.
 *
 * Uninstalling marks the shop rather than deleting it: the merchant's orders
 * are their business record, and a reinstall a week later should find its
 * history intact. Sessions do go, because those are credentials.
 */
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  const { topic, shop, session } = await authenticate.webhook(request);

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) await prisma.session.deleteMany({ where: { shop } });
      await prisma.shop.updateMany({
        where: { domain: shop },
        data: { uninstalledAt: new Date() },
      });
      break;
    default:
      break;
  }

  return new Response(null, { status: 200 });
}
