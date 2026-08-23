/**
 * Reading the order list: what the filters mean, and what the export writes.
 *
 * This lives outside the route for the same reason gdpr.server.ts does — so it
 * can be run against real inputs by `npm run test:orders` instead of only ever
 * being exercised by a person clicking. Two things here are worth testing and
 * are invisible from the screen:
 *
 *   Every query is scoped by `shopId`, without exception. That is the rule the
 *   whole system rests on, and a filter builder is exactly the kind of place
 *   where a later edit quietly drops it.
 *
 *   The CSV escapes what a customer typed. These cells hold names and street
 *   addresses that arrived from a public form, and the merchant opens the file
 *   in Excel.
 *
 * The status words themselves are in `orders.ts`, not here: the table renders
 * them in the browser, and a component that imports a `.server` module fails
 * the build. They are re-exported below so a caller has one place to import
 * from.
 */

import type { Prisma } from "@prisma/client";
import { SETTABLE, STATUS_LABEL } from "./orders";

export { SETTABLE, STATUS_LABEL, STATUS_ORDER, PER_PAGE, EXPORT_CAP } from "./orders";

/**
 * Turns the query string into a Prisma filter.
 *
 * One function, used by the list, the tab counts and the export, so the file a
 * merchant downloads is exactly the list they were looking at. Three copies of
 * this would eventually disagree, and the disagreement would be silent.
 */
export function buildWhere(
  shopId: string,
  params: URLSearchParams,
): Prisma.CodOrderWhereInput {
  const where: Prisma.CodOrderWhereInput = { shopId };

  const status = params.get("s") ?? "";
  if (SETTABLE.has(status)) where.status = status as never;

  const delivery = params.get("delivery") ?? "";
  if (delivery === "HOME" || delivery === "DESK") {
    where.lead = { ...(where.lead as object), delivery: delivery as never };
  }

  const flag = params.get("flag") ?? "";
  if (flag === "failed") where.createFailed = true;
  if (flag === "unverified") {
    where.lead = { ...(where.lead as object), pricesVerified: false };
  }

  const q = (params.get("q") ?? "").trim();
  if (q) {
    /* Phone is how a merchant looks an order up after a missed call, so a
       search carrying digits is also matched against the phone with the
       spacing and separators a person types stripped out. Three digits is the
       floor: fewer matches most of the table and is never what was meant. */
    const digits = q.replace(/\D/g, "");
    where.OR = [
      { shopifyName: { contains: q, mode: "insensitive" } },
      { lead: { firstName: { contains: q, mode: "insensitive" } } },
      { lead: { lastName: { contains: q, mode: "insensitive" } } },
      { lead: { commune: { contains: q, mode: "insensitive" } } },
      { lead: { wilayaName: { contains: q, mode: "insensitive" } } },
      ...(digits.length >= 3 ? [{ lead: { phone: { contains: digits } } }] : []),
    ];
  }

  return where;
}

/** The same filters with the status dropped — what the tab counts are read with. */
export function withoutStatus(params: URLSearchParams) {
  const copy = new URLSearchParams(params);
  copy.delete("s");
  return copy;
}

/**
 * One CSV cell.
 *
 * Excel treats a leading `=`, `+`, `-` or `@` as the start of a formula, and
 * these cells hold text a stranger typed into a public form. Prefixing with an
 * apostrophe is the standard defence; without it a crafted name becomes a
 * command that runs when the merchant opens their own order list.
 */
export function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const CSV_HEADER = [
  "Commande", "Date", "Statut", "Client", "Téléphone", "Commune",
  "Wilaya", "Adresse", "Livraison", "Sous-total", "Livraison (prix)",
  "Total", "Devise", "Prix vérifiés", "Échec Shopify", "Erreur",
];

type ExportRow = {
  shopifyName: string | null;
  createdAt: Date;
  status: string;
  createFailed: boolean;
  createError: string | null;
  lead: {
    redactedAt: Date | null;
    firstName: string;
    lastName: string;
    phone: string;
    commune: string;
    wilayaName: string;
    address: string;
    delivery: string;
    subtotal: number;
    shipping: number;
    total: number;
    pricesVerified: boolean;
  };
};

/**
 * The whole file, as a string.
 *
 * A redacted shopper keeps their money and loses their person here too — the
 * export is one of the easiest places to leak someone back out after they have
 * asked to be forgotten, because it is written once and read somewhere else.
 */
export function toCsv(rows: ExportRow[], currency: string) {
  const body = rows.map((o) =>
    [
      o.shopifyName ?? "",
      o.createdAt.toISOString(),
      STATUS_LABEL[o.status] ?? o.status,
      o.lead.redactedAt ? "(effacé)" : `${o.lead.firstName} ${o.lead.lastName}`,
      o.lead.redactedAt ? "" : o.lead.phone,
      o.lead.redactedAt ? "" : o.lead.commune,
      o.lead.wilayaName,
      o.lead.redactedAt ? "" : o.lead.address,
      o.lead.delivery === "DESK" ? "Bureau" : "Domicile",
      o.lead.subtotal,
      o.lead.shipping,
      o.lead.total,
      currency,
      o.lead.pricesVerified ? "oui" : "non",
      o.createFailed ? "oui" : "non",
      o.createError ?? "",
    ]
      .map(csvCell)
      .join(","),
  );

  /* A BOM, because the merchant opens this in Excel and the customer names are
     French and Arabic. Without it Excel reads UTF-8 as Latin-1 and every accent
     arrives mangled. */
  return "﻿" + [CSV_HEADER.map(csvCell).join(","), ...body].join("\r\n");
}

export function csvFilename(now = new Date()) {
  return `commandes-${now.toISOString().slice(0, 10)}.csv`;
}
