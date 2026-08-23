/**
 * The order list's filters and its export.
 *
 * Run: npm run test:orders
 *
 * The screen itself cannot be tested from here — it is Polaris web components
 * loaded from Shopify's CDN inside an embedded admin. What can be tested is
 * everything that decides *which rows* a merchant sees and *what text* leaves
 * the building, and those are the two places where a quiet mistake is
 * expensive:
 *
 *   A filter that loses `shopId` shows one merchant another's customers.
 *   A CSV cell that is not escaped runs as a formula in the merchant's Excel.
 *
 * Both are invisible on a screen that otherwise looks right.
 */

import {
  buildWhere,
  csvCell,
  csvFilename,
  toCsv,
  withoutStatus,
  SETTABLE,
  STATUS_ORDER,
  PER_PAGE,
} from "../app/lib/orders.server";

let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

const P = (qs: string) => new URLSearchParams(qs);
const SHOP = "shop_abc";

console.log("\n1. Every query is scoped to one shop");
{
  const cases = [
    "",
    "s=PENDING",
    "q=nassim",
    "delivery=DESK",
    "flag=failed",
    "flag=unverified",
    "s=DELIVERED&q=0555&delivery=HOME&flag=unverified&page=4",
    "s=../../etc/passwd&q=%27%20OR%201%3D1--",
  ];
  let all = true;
  for (const c of cases) {
    const w = buildWhere(SHOP, P(c));
    if (w.shopId !== SHOP) {
      all = false;
      console.log(`        missing shopId for: ${c}`);
    }
  }
  ok("shopId survives every combination of filters", all);
  ok("shopId is present even with no filters at all",
     buildWhere(SHOP, P("")).shopId === SHOP);
}

console.log("\n2. The status filter accepts only known statuses");
{
  ok("a known status is applied",
     buildWhere(SHOP, P("s=CONFIRMED")).status === "CONFIRMED");
  ok("an invented status is ignored rather than passed through",
     buildWhere(SHOP, P("s=DROP_TABLE")).status === undefined);
  ok("an empty status is ignored", buildWhere(SHOP, P("s=")).status === undefined);
  ok("every tab in STATUS_ORDER is actually settable",
     STATUS_ORDER.every((s) => SETTABLE.has(s)));
  ok("SETTABLE holds nothing beyond the tabs", SETTABLE.size === STATUS_ORDER.length);
}

console.log("\n3. Delivery and flags");
{
  const home = buildWhere(SHOP, P("delivery=HOME"));
  ok("HOME is applied to the lead", (home.lead as any)?.delivery === "HOME");
  const desk = buildWhere(SHOP, P("delivery=DESK"));
  ok("DESK is applied to the lead", (desk.lead as any)?.delivery === "DESK");
  ok("an unknown delivery mode is ignored",
     buildWhere(SHOP, P("delivery=PIGEON")).lead === undefined);

  ok("failed filters on createFailed",
     buildWhere(SHOP, P("flag=failed")).createFailed === true);
  ok("unverified filters on the lead's pricesVerified",
     (buildWhere(SHOP, P("flag=unverified")).lead as any)?.pricesVerified === false);
  ok("an unknown flag is ignored",
     buildWhere(SHOP, P("flag=nonsense")).createFailed === undefined);

  /* Both narrow the same relation, and a naive `where.lead = {...}` for the
     second would silently drop the first. */
  const both = buildWhere(SHOP, P("delivery=DESK&flag=unverified"));
  ok("delivery and unverified combine instead of overwriting",
     (both.lead as any)?.delivery === "DESK" &&
     (both.lead as any)?.pricesVerified === false);
}

console.log("\n4. Search");
{
  const w = buildWhere(SHOP, P("q=benali"));
  const or = (w.OR ?? []) as any[];
  ok("a word searches the order name and the person", or.length >= 5);
  ok("a word does not search the phone",
     !or.some((c) => c.lead?.phone));

  const phone = buildWhere(SHOP, P("q=0555%2000%2000"));
  const pOr = (phone.OR ?? []) as any[];
  const phoneClause = pOr.find((c) => c.lead?.phone);
  ok("a typed phone number is searched with its spacing stripped",
     phoneClause?.lead?.phone?.contains === "0555 00 00".replace(/\D/g, ""),
     JSON.stringify(phoneClause));

  ok("two digits are too few to search the phone on",
     !((buildWhere(SHOP, P("q=05")).OR ?? []) as any[]).some((c) => c.lead?.phone));

  ok("whitespace only is not a search",
     buildWhere(SHOP, P("q=%20%20")).OR === undefined);
  ok("no q means no OR clause", buildWhere(SHOP, P("")).OR === undefined);
}

console.log("\n5. The tab counts ignore the tab, and nothing else");
{
  const params = P("s=PENDING&delivery=DESK&q=ben&page=3");
  const counted = withoutStatus(params);
  ok("the status is dropped", counted.get("s") === null);
  ok("the other filters are kept",
     counted.get("delivery") === "DESK" && counted.get("q") === "ben");
  ok("the original is not mutated", params.get("s") === "PENDING");
  ok("the counts query is still scoped to the shop",
     buildWhere(SHOP, counted).shopId === SHOP);
}

console.log("\n6. CSV cells are safe to open in Excel");
{
  ok("an ordinary value is quoted", csvCell("Nassim") === '"Nassim"');
  ok("a comma cannot split the row", csvCell("Alger, Bab El Oued").includes(","));
  ok("a quote is doubled", csvCell('rue "des" fleurs') === '"rue ""des"" fleurs"');
  ok("a newline stays inside the quotes", csvCell("a\nb") === '"a\nb"');
  ok("null becomes empty", csvCell(null) === '""');
  ok("undefined becomes empty", csvCell(undefined) === '""');
  ok("a number is written plainly", csvCell(4200) === '"4200"');

  for (const lead of ["=", "+", "-", "@"]) {
    ok(`a cell starting with ${lead} is defused`,
       csvCell(`${lead}cmd|'/c calc'!A1`).startsWith(`"'${lead}`));
  }
  ok("a formula in the middle is left alone",
     csvCell("rue 1+1") === '"rue 1+1"');
}

console.log("\n7. The exported file");
{
  const row = (over: Record<string, unknown> = {}, leadOver: Record<string, unknown> = {}) => ({
    shopifyName: "#1012",
    createdAt: new Date("2026-08-18T09:00:00.000Z"),
    status: "CONFIRMED",
    createFailed: false,
    createError: null,
    ...over,
    lead: {
      redactedAt: null,
      firstName: "Nassim",
      lastName: "Benali",
      phone: "0555000000",
      commune: "Bab El Oued",
      wilayaName: "Alger",
      address: "Cité 20 Aout",
      delivery: "HOME",
      subtotal: 5000,
      shipping: 600,
      total: 5600,
      pricesVerified: true,
      ...leadOver,
    },
  }) as any;

  const csv = toCsv([row()], "DZD");
  const lines = csv.split("\r\n");

  ok("the file starts with a BOM so Excel reads UTF-8", csv.charCodeAt(0) === 0xfeff);
  ok("there is a header and one row", lines.length === 2);
  ok("rows are separated by CRLF", csv.includes("\r\n"));
  ok("the customer is written", lines[1].includes("Nassim Benali"));
  ok("the phone is written", lines[1].includes("0555000000"));
  ok("the currency is written", lines[1].includes('"DZD"'));
  ok("delivery is a word, not a code", lines[1].includes('"Domicile"'));
  ok("the status is the French label", lines[1].includes('"Confirmée"'));
  ok("every cell is quoted",
     lines[1].split(",").every((c) => c.startsWith('"') && c.endsWith('"')));

  const header = lines[0].split(",").length;
  const body = lines[1].split(",").length;
  ok("the row has exactly as many cells as the header", header === body,
     `${header} vs ${body}`);

  /* A shopper who asked to be forgotten must not come back out through the
     export — it is written once and read somewhere else entirely. */
  const red = toCsv([row({}, { redactedAt: new Date() })], "DZD").split("\r\n")[1];
  ok("a redacted shopper's name does not appear", !red.includes("Nassim"));
  ok("a redacted shopper's phone does not appear", !red.includes("0555000000"));
  ok("a redacted shopper's street does not appear", !red.includes("Cité 20 Aout"));
  ok("the redaction is stated rather than left blank", red.includes("(effacé)"));
  ok("the money is still there — it is the merchant's revenue", red.includes('"5600"'));
  ok("the wilaya is still there — it identifies nobody", red.includes('"Alger"'));

  const failed = toCsv([row({ createFailed: true, createError: 'Phone is "invalid"' })], "DZD");
  ok("a failed order says so", failed.includes('"oui"'));
  ok("an error containing quotes does not break the row",
     failed.split("\r\n").length === 2);

  const injected = toCsv([row({}, { firstName: "=HYPERLINK(1)", lastName: "X" })], "DZD");
  ok("a formula typed into the order form is defused in the file",
     injected.includes(`"'=HYPERLINK(1) X"`));
}

console.log("\n8. Names and limits");
{
  ok("the filename carries the date",
     csvFilename(new Date("2026-08-18T00:00:00Z")) === "commandes-2026-08-18.csv");
  ok("a page holds 50 rows", PER_PAGE === 50);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
