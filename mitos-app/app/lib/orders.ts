/**
 * The vocabulary of an order, shared by the screens and the server.
 *
 * Deliberately NOT a `.server` module. React Router strips server-only code
 * from `loader` and `action`, but a component that reaches into a `.server`
 * file fails the build — and the status labels are needed in both places: the
 * loader writes them into the CSV, the table renders them into a badge.
 *
 * So the words live here and the queries live in orders.server.ts. Nothing in
 * this file touches the database or the filesystem.
 */

export type Tone = "info" | "success" | "critical" | "warning" | "neutral";

export const STATUS_TONE: Record<string, Tone> = {
  PENDING: "info",
  CONFIRMED: "warning",
  SHIPPED: "warning",
  DELIVERED: "success",
  CANCELLED: "critical",
  RETURNED: "critical",
  NO_ANSWER: "critical",
};

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "À appeler",
  CONFIRMED: "Confirmée",
  SHIPPED: "Expédiée",
  DELIVERED: "Livrée",
  CANCELLED: "Annulée",
  RETURNED: "Retournée",
  NO_ANSWER: "Sans réponse",
};

/** The order the tabs appear in — the call list's own order of business. */
export const STATUS_ORDER = [
  "PENDING",
  "CONFIRMED",
  "SHIPPED",
  "DELIVERED",
  "NO_ANSWER",
  "CANCELLED",
  "RETURNED",
];

/** Only these can be written. A crafted request cannot invent one. */
export const SETTABLE = new Set(STATUS_ORDER);

export const PER_PAGE = 50;

/** The most rows one export will write. A merchant with more pages the list. */
export const EXPORT_CAP = 5000;
