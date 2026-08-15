/**
 * Creating the Shopify order for a cash-on-delivery lead.
 *
 * The order is created with no transaction attached, so Shopify reports it
 * unpaid — which is exactly what cash on delivery is. Shipping is passed as a
 * named shipping line rather than folded into a product price, so the
 * merchant's reports keep goods and delivery separate.
 *
 * Checked against the current Admin GraphQL `orderCreate`, which takes `order`
 * and `options` arguments — not `input`.
 */

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { toE164 } from "./validate.server";

const ORDER_CREATE = `#graphql
  mutation CreateCodOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
        totalPriceSet { shopMoney { amount currencyCode } }
      }
      userErrors { field message }
    }
  }
`;

export type CodItem = {
  /** gid://shopify/ProductVariant/… */
  variantId: string;
  quantity: number;
};

export type CodOrderDraft = {
  email?: string | null;
  phone: string;
  firstName: string;
  lastName: string;
  address: string;
  commune: string;
  /** ISO 3166-2:DZ subdivision code, "01"–"58". */
  wilayaCode: string;
  wilayaName: string;
  items: CodItem[];
  shipping: number;
  currency: string;
  tag: string;
  note?: string | null;
};

/**
 * How the wilaya reaches the courier.
 *
 * Measured against a live store rather than guessed:
 *
 *   `provinceCode: "16"` is accepted but stored as `province: "16"` with a
 *   null provinceCode — Shopify carries no subdivisions for Algeria, so the
 *   ISO code just becomes an unreadable string on the packing slip. The name
 *   is what belongs in `province`, deprecated field or not.
 *
 *   Shopify's DZ address format then drops the province from the formatted
 *   address entirely — `["Cité 8 Mai 1945", "Bab Ezzouar", "Algeria"]`, no
 *   wilaya. For an Algerian courier that is the one line they route on, so it
 *   is repeated into address2, which the formatter does keep.
 */
function buildAddress(draft: CodOrderDraft) {
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    address1: draft.address,
    address2: `Wilaya ${draft.wilayaCode} — ${draft.wilayaName}`,
    city: draft.commune,
    province: draft.wilayaName,
    countryCode: "DZ",
    phone: toE164(draft.phone),
  };
}

export async function createCodOrder(
  admin: AdminApiContext,
  draft: CodOrderDraft,
) {
  const result = await attempt(admin, draft);

  if (!result.order || result.userErrors.length) {
    const message =
      result.userErrors
        .map((e) => `${e.field?.join(".") ?? "order"}: ${e.message}`)
        .join("; ") || "orderCreate returned no order";
    throw new Error(message);
  }

  return result.order;
}

async function attempt(admin: AdminApiContext, draft: CodOrderDraft) {
  const address = buildAddress(draft);

  const response = await admin.graphql(ORDER_CREATE, {
    variables: {
      order: {
        currency: draft.currency,
        email: draft.email || undefined,
        phone: toE164(draft.phone),
        tags: [draft.tag],
        note: draft.note || undefined,
        billingAddress: address,
        shippingAddress: address,
        lineItems: draft.items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        shippingLines: draft.shipping
          ? [
              {
                title: "Livraison",
                priceSet: {
                  shopMoney: {
                    amount: draft.shipping,
                    currencyCode: draft.currency,
                  },
                },
              },
            ]
          : [],
      },
      options: {
        /* A cash-on-delivery customer is phoned, not emailed, and many have no
           email address at all — so nothing is sent automatically. */
        sendReceipt: false,
        sendFulfillmentReceipt: false,
      },
    },
  });

  const body = await response.json();
  const result = body?.data?.orderCreate;

  return {
    order: (result?.order ?? null) as { id: string; name: string } | null,
    userErrors: (result?.userErrors ?? []) as {
      field?: string[];
      message: string;
    }[],
  };
}
