/**
 * Validating a cash-on-delivery submission.
 *
 * This runs on a public endpoint that anyone can post to, so nothing from the
 * request is trusted: prices are recomputed from the merchant's own shipping
 * table rather than read from the payload, and the storefront's totals are
 * only ever used to detect a mismatch worth logging.
 */

export type RawLead = Record<string, unknown>;

export type CleanLead = {
  firstName: string;
  lastName: string;
  phone: string;
  wilayaCode: string;
  commune: string;
  address: string;
  delivery: "HOME" | "DESK";
  items: { variantId: string; quantity: number }[];
};

const PHONE = /^0[5-7]\d{8}$/;
const MOBILE_OR_LANDLINE = /^0\d{8,9}$/;

function str(v: unknown, max = 200) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function validateLead(raw: RawLead) {
  const errors: Record<string, string> = {};

  const firstName = str(raw.prenom ?? raw.firstName, 60);
  const lastName = str(raw.nom ?? raw.lastName, 60);
  const address = str(raw.adresse ?? raw.address, 400);
  const commune = str(raw.commune, 120);
  const wilayaCode = str(raw.wilaya ?? raw.wilayaCode, 2).padStart(2, "0");
  const phone = str(raw.telephone ?? raw.phone, 20).replace(/[\s.\-()]/g, "");

  if (!firstName) errors.firstName = "required";
  if (!lastName) errors.lastName = "required";
  if (!address) errors.address = "required";
  if (!commune) errors.commune = "required";
  if (!/^\d{2}$/.test(wilayaCode) || +wilayaCode < 1 || +wilayaCode > 58) {
    errors.wilaya = "invalid";
  }
  if (!PHONE.test(phone) && !MOBILE_OR_LANDLINE.test(phone)) {
    errors.phone = "invalid";
  }

  const delivery = str(raw.livraison ?? raw.delivery).toUpperCase() === "DESK"
    ? "DESK"
    : "HOME";

  /* Items arrive either as a cart array or as a single product page order. */
  let items: { variantId: string; quantity: number }[] = [];
  if (Array.isArray(raw.items)) {
    items = raw.items
      .map((i: any) => ({
        variantId: str(i?.variantId ?? i?.variant_id, 80),
        quantity: Math.max(1, Math.min(99, parseInt(String(i?.qty ?? i?.quantity ?? 1), 10) || 1)),
      }))
      .filter((i) => i.variantId);
  } else {
    const variantId = str(raw.variant_id ?? raw.variantId, 80);
    const quantity = Math.max(1, Math.min(99, parseInt(String(raw.quantite ?? raw.quantity ?? 1), 10) || 1));
    if (variantId) items = [{ variantId, quantity }];
  }

  if (!items.length) errors.items = "required";

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    lead: ok
      ? ({ firstName, lastName, phone, wilayaCode, commune, address, delivery, items } as CleanLead)
      : null,
  };
}

/** A bare numeric id becomes a GID; a GID passes through untouched. */
export function toVariantGid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/ProductVariant/${id}`;
}
