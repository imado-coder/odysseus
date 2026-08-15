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
  wilayaName: string;
  items: CodItem[];
  shipping: number;
  currency: string;
  tag: string;
  note?: string | null;
};

type GraphqlClient = {
  graphql: (query: string, opts?: { variables?: unknown }) => Promise<Response>;
};

export async function createCodOrder(admin: GraphqlClient, draft: CodOrderDraft) {
  const address = {
    firstName: draft.firstName,
    lastName: draft.lastName,
    address1: draft.address,
    city: draft.commune,
    province: draft.wilayaName,
    countryCode: "DZ",
    phone: draft.phone,
  };

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

  if (!result?.order || result.userErrors?.length) {
    const message =
      result?.userErrors
        ?.map((e: { field?: string[]; message: string }) =>
          `${e.field?.join(".") ?? "order"}: ${e.message}`,
        )
        .join("; ") || "orderCreate returned no order";
    throw new Error(message);
  }

  return result.order as { id: string; name: string };
}
