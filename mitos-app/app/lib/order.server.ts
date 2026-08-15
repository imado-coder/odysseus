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
 * How the wilaya is written into the address.
 *
 * `provinceCode` is the field Shopify wants — `province` is deprecated. But
 * `provinceCode` is only accepted for countries whose subdivisions Shopify
 * actually carries, and a rejected code fails the whole order. So the code is
 * tried first and the free-text name is the fallback: whichever Shopify
 * accepts, the merchant still gets the order.
 */
type ProvinceStyle = "code" | "name";

function buildAddress(draft: CodOrderDraft, style: ProvinceStyle) {
  return {
    firstName: draft.firstName,
    lastName: draft.lastName,
    address1: draft.address,
    city: draft.commune,
    ...(style === "code"
      ? { provinceCode: draft.wilayaCode }
      : { province: draft.wilayaName }),
    countryCode: "DZ",
    phone: draft.phone,
  };
}

function isProvinceError(errors: { field?: string[]; message: string }[]) {
  return errors.some(
    (e) =>
      e.field?.some((f) => /province/i.test(f)) ||
      /province|region|state/i.test(e.message),
  );
}

export async function createCodOrder(
  admin: AdminApiContext,
  draft: CodOrderDraft,
) {
  let result = await attempt(admin, draft, "code");

  /* Shopify does not know this country's subdivisions — send the name. */
  if (!result.order && isProvinceError(result.userErrors)) {
    result = await attempt(admin, draft, "name");
  }

  if (!result.order || result.userErrors.length) {
    const message =
      result.userErrors
        .map((e) => `${e.field?.join(".") ?? "order"}: ${e.message}`)
        .join("; ") || "orderCreate returned no order";
    throw new Error(message);
  }

  return result.order;
}

async function attempt(
  admin: AdminApiContext,
  draft: CodOrderDraft,
  style: ProvinceStyle,
) {
  const address = buildAddress(draft, style);

  const response = await admin.graphql(ORDER_CREATE, {
    variables: {
      order: {
        currency: draft.currency,
        email: draft.email || undefined,
        phone: draft.phone,
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
