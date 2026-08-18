/**
 * The COD app block, exercised the way a shopper uses it.
 *
 * Run: npm run test:extension
 *
 * The block's Liquid is rendered here rather than hand-copied, so the test
 * drives the markup the extension actually ships. The renderer is crude on
 * purpose — it only has to be good enough to produce the DOM, because what is
 * under test is the behaviour, and the markup/JS hook agreement is checked
 * separately at the bottom.
 *
 * Two bugs were found by writing this, and both are asserted below:
 *
 *   - the idempotency key was cleared *after* the confirmation was drawn, so
 *     anything that threw while rendering stranded the key on the form and the
 *     shopper's next order would be discarded by the app as a duplicate;
 *
 *   - with no endpoint configured the form drew the success panel, telling a
 *     customer their order was placed when nothing had been sent anywhere.
 */
import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(HERE, "..", "extensions", "mitos-cod");

const codJs = fs.readFileSync(path.join(EXT, "assets/mitos-cod.js"), "utf8");
const locJs = fs.readFileSync(path.join(EXT, "assets/mitos-dz-locations.js"), "utf8");
const liquid = fs.readFileSync(path.join(EXT, "blocks/cod-form.liquid"), "utf8");
const strings = JSON.parse(fs.readFileSync(path.join(EXT, "locales/fr.default.json"), "utf8"));

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};

/* ── A just-enough Liquid render ─────────────────────────────────────────── */

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}${k}`;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key + "."));
    else out[key] = v;
  }
  return out;
}
const T = flatten(strings);

const VALUES = {
  id: "mitos-cod-TESTBLOCK",
  unit: "2500",
  f_currency: "DA",
  empty_object: "{}",
  tariff_fallback: "[600,350]",
  f_head_icon: "DA",
  f_phone_prefix: "+213",
  f_phone_pattern: "^0[567][0-9]{8}$|^0[1-4][0-9]{7,8}$",
  "shop.permanent_domain": "test-test-1234123412341296.myshopify.com",
  "p.id": "9876543210",
  "v.id": "1234567890",
  "p.title": "Produit de test",
  "block.shopify_attributes": "",
  "'mitos-dz-locations.js' | asset_url": "/assets/mitos-dz-locations.js",
};

function renderBlock() {
  let s = liquid;
  s = s.replace(/\{%\s*schema\s*%\}[\s\S]*?\{%\s*endschema\s*%\}/g, "");
  s = s.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");
  s = s.replace(/\{%-?\s*liquid[\s\S]*?-?%\}/g, "");
  s = s.replace(
    /\{%-?\s*for i in \(1\.\.f_qty_max\)\s*-?%\}[\s\S]*?\{%-?\s*endfor\s*-?%\}/g,
    () => Array.from({ length: 10 }, (_, i) => `<option>${i + 1}</option>`).join("")
  );
  // The design-mode notice is not under test.
  s = s.replace(/\{%-?\s*if request\.design_mode\s*-?%\}[\s\S]*?\{%-?\s*endif\s*-?%\}/g, "");
  // Keep the body of every remaining conditional; they all default to true.
  s = s.replace(/\{%-?\s*(if|unless|else|elsif|endif|endunless)[^%]*-?%\}/g, "");

  const missing = [];
  s = s.replace(/\{\{([\s\S]*?)\}\}/g, (_, raw) => {
    const expr = raw.trim();
    const t = expr.match(/^'([a-z0-9_.]+)'\s*\|\s*t$/);
    if (t) {
      if (!(t[1] in T)) missing.push(t[1]);
      return T[t[1]] ?? "";
    }
    if (expr in VALUES) return VALUES[expr];
    const base = expr.split("|")[0].trim();
    if (base.startsWith("d_")) {
      const key = "mitos.cod." + base.slice(2);
      if (!(key in T)) missing.push(key);
      return T[key] ?? "";
    }
    if (base.startsWith("f_")) {
      const key = "mitos.cod." + base.slice(2);
      if (key in T) return T[key];
    }
    if (base in VALUES) return VALUES[base];
    return ""; // unset merchant setting
  });

  return { html: s, missing };
}

const { html: blockHtml, missing: missingKeys } = renderBlock();

/* ── Harness ─────────────────────────────────────────────────────────────── */

async function build({ endpoint = "", thanksUrl = "", lang = "fr", fetchImpl } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html lang="${lang}"><head></head><body>${blockHtml}</body></html>`,
    { runScripts: "outside-only", url: "https://shop.example.com/products/x" }
  );
  const { window } = dom;
  window.fetch = fetchImpl || (() => Promise.reject(new Error("no network")));
  // jsdom implements neither; real browsers do.
  window.Element.prototype.scrollIntoView = function () {};

  // The dataset normally arrives as its own asset; jsdom does not fetch it.
  window.eval(locJs);

  const form = window.document.querySelector("[data-mitos-cod-form]");
  if (endpoint) form.setAttribute("data-endpoint", endpoint);
  else form.removeAttribute("data-endpoint");
  if (thanksUrl) form.setAttribute("data-thanks-url", thanksUrl);
  else form.removeAttribute("data-thanks-url");

  window.eval(codJs);
  // init is deferred to DOMContentLoaded; let jsdom get there
  await new Promise((r) => setTimeout(r, 0));
  return { window, doc: window.document, form };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const num = (el) => parseInt(el.textContent.replace(/[^\d]/g, ""), 10);

function fillValid(form, doc) {
  form.querySelector('[name="prenom"]').value = "Nassim";
  form.querySelector('[name="nom"]').value = "Benali";
  form.querySelector('[name="telephone"]').value = "0555000000";
  form.querySelector('[name="adresse"]').value = "Cité 20 Aout, rue 3";
  const w = form.querySelector("[data-mitos-cod-wilaya]");
  w.value = "16";
  w.dispatchEvent(new doc.defaultView.Event("change"));
  form.querySelector("[data-mitos-cod-commune]").value = "Bab El Oued";
}

const okQuote = (rates = {}, offers = []) => (url, init) =>
  init && init.method === "POST"
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ orderName: "#1012" }) })
    : Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, rates, offers }) });

/* ── Tests ───────────────────────────────────────────────────────────────── */

console.log("\n0. The rendered block");
ok("every translation key resolves", missingKeys.length === 0, missingKeys.join(","));
ok("no Liquid left unrendered", !/\{[{%]/.test(blockHtml));

console.log("\n1. Wilaya / commune cascade");
{
  const { doc, form } = await build();
  const w = form.querySelector("[data-mitos-cod-wilaya]");
  const c = form.querySelector("[data-mitos-cod-commune]");
  ok("58 wilayas populated (+ placeholder)", w.options.length === 59, `got ${w.options.length}`);
  ok("commune disabled before a wilaya is picked", c.disabled === true);

  w.value = "16";
  w.dispatchEvent(new doc.defaultView.Event("change"));
  ok("commune enabled after picking Alger", c.disabled === false);
  ok("Alger communes loaded", c.options.length > 20, `got ${c.options.length}`);
  ok("commune list holds a real Alger commune",
     [...c.options].map((o) => o.value).includes("Bab El Oued"));
  ok("wilaya option shows code and name",
     w.options[1].textContent.startsWith("01 — Adrar"), w.options[1].textContent);
}

console.log("\n2. Fallback pricing and the running total");
{
  const { doc, form } = await build();
  const w = form.querySelector("[data-mitos-cod-wilaya]");
  const qty = form.querySelector("[data-mitos-cod-qty]");
  const sub = form.querySelector("[data-mitos-cod-out-sub]");
  const ship = form.querySelector("[data-mitos-cod-out-ship]");
  const total = form.querySelector("[data-mitos-cod-out-total]");

  ok("shipping is a dash before a wilaya is chosen", ship.textContent === "—", ship.textContent);
  w.value = "16";
  w.dispatchEvent(new doc.defaultView.Event("change"));
  ok("home shipping falls back to 600", num(ship) === 600, ship.textContent);
  ok("subtotal is the unit price at qty 1", num(sub) === 2500, sub.textContent);
  ok("total = 2500 + 600", num(total) === 3100, total.textContent);

  qty.value = "2";
  qty.dispatchEvent(new doc.defaultView.Event("change"));
  ok("subtotal doubles at qty 2", num(sub) === 5000, sub.textContent);
  ok("total = 5000 + 600", num(total) === 5600, total.textContent);

  const desk = [...form.querySelectorAll("[data-mitos-cod-delivery]")].find((o) => o.value === "desk");
  desk.checked = true;
  desk.dispatchEvent(new doc.defaultView.Event("change"));
  ok("desk shipping falls back to 350", num(ship) === 350, ship.textContent);
  ok("total follows the desk rate", num(total) === 5350, total.textContent);

  const prices = [...form.querySelectorAll("[data-mitos-cod-opt-price]")].map((e) => e.textContent);
  ok("each delivery card shows its own price",
     prices[0].includes("600") && prices[1].includes("350"), prices.join(" / "));
  ok("currency comes from the block, not hardcoded", ship.textContent.trim().endsWith("DA"));
}

console.log("\n3. Validation");
{
  const { doc, form } = await build();
  const status = form.querySelector("[data-mitos-cod-status]");
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  ok("an empty form is refused", status.dataset.state === "error");
  ok("every required field is marked", form.querySelectorAll("[data-invalid]").length === 6);

  const tel = form.querySelector('[name="telephone"]');
  tel.value = "0912345678"; // 09 is not an Algerian prefix
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  ok("09... phone rejected", tel.getAttribute("aria-invalid") === "true");

  tel.value = "0555 00 00 00"; // spaces stripped before matching
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  ok("0555 00 00 00 accepted", tel.getAttribute("aria-invalid") === "false");
}

console.log("\n4. Submission payload");
{
  const calls = [];
  const { doc, form } = await build({
    endpoint: "https://api.example.com/cod",
    fetchImpl: (url, init) => {
      calls.push({ url, init });
      return okQuote()(url, init);
    },
  });
  fillValid(form, doc);
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  await tick();

  const post = calls.find((c) => c.init && c.init.method === "POST");
  ok("a POST was made", !!post);
  const body = JSON.parse(post.init.body);
  ok("carries shop — the app routes on it", body.shop === "test-test-1234123412341296.myshopify.com");
  ok("carries variant_id", body.variant_id === "1234567890");
  ok("carries an idempotency key", typeof body.idempotencyKey === "string" && body.idempotencyKey.length > 8);
  ok("phone stays local, converted only at the Shopify boundary", body.telephone === "0555000000", body.telephone);
  ok("wilaya travels as its code", body.wilaya === "16");
  ok("commune travels by name", body.commune === "Bab El Oued");
  ok("delivery mode included", body.livraison === "home");
}

console.log("\n5. The idempotency key: one per order, not one per tap");
{
  let mode = "fail";
  const seen = [];
  const { doc, form } = await build({
    endpoint: "https://api.example.com/cod",
    fetchImpl: (url, init) => {
      if (init && init.method === "POST") {
        seen.push(JSON.parse(init.body).idempotencyKey);
        return mode === "fail"
          ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
          : Promise.resolve({ ok: true, json: () => Promise.resolve({ orderName: "#1013" }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, rates: {}, offers: [] }) });
    },
  });

  fillValid(form, doc);
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  await tick(); await tick();
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  await tick(); await tick();
  ok("a retry after failure reuses the same key", seen.length === 2 && seen[0] === seen[1], seen.join(" vs "));

  mode = "ok";
  fillValid(form, doc);
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  await tick(); await tick();
  ok("the successful send used that same key", seen[2] === seen[0]);
  ok("key dropped once the order lands, so next month is not a duplicate",
     form.dataset.orderKey === undefined, String(form.dataset.orderKey));
  ok("exactly three sends", seen.length === 3, String(seen.length));
}

console.log("\n6. The app's table wins over the fallback");
{
  const { form, window } = await build({
    endpoint: "https://api.example.com/cod",
    fetchImpl: okQuote({ "16": [500, 300] }, [{ quantity: 3, price: 6000, badge: "Promo" }]),
  });
  await tick(); await tick();

  const w = form.querySelector("[data-mitos-cod-wilaya]");
  w.value = "16";
  w.dispatchEvent(new window.Event("change"));
  ok("shipping uses the app's 500, not the fallback 600",
     num(form.querySelector("[data-mitos-cod-out-ship]")) === 500);

  const host = form.querySelector("[data-mitos-cod-offers]");
  ok("offers revealed", host.hidden === false);
  ok("one offer button drawn", host.querySelectorAll("[data-offer-qty]").length === 1);

  const qty = form.querySelector("[data-mitos-cod-qty]");
  qty.value = "3";
  qty.dispatchEvent(new window.Event("change"));
  ok("an offer price is the whole-quantity total, not unit x qty",
     num(form.querySelector("[data-mitos-cod-out-sub]")) === 6000);
  ok("total = offer 6000 + shipping 500",
     num(form.querySelector("[data-mitos-cod-out-total]")) === 6500);
}

console.log("\n7. The quote request shape");
{
  const urls = [];
  await build({
    endpoint: "https://api.example.com/cod",
    fetchImpl: (url, init) => {
      if (!init || init.method !== "POST") urls.push(url);
      return okQuote()(url, init);
    },
  });
  await tick();
  ok("one quote request", urls.length === 1, JSON.stringify(urls));
  ok("asks with shop=", urls[0].includes("shop=test-test-1234123412341296.myshopify.com"));
  ok("asks with the product gid", urls[0].includes("product=gid://shopify/Product/9876543210"), urls[0]);
}

console.log("\n8. Confirmation without a thank-you page");
{
  const { doc, form } = await build({
    endpoint: "https://api.example.com/cod",
    fetchImpl: okQuote(),
  });
  fillValid(form, doc);
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  await tick(); await tick();

  const done = form.querySelector(".mitos-cod-done");
  ok("the form becomes its own confirmation", !!done);
  ok("the confirmation names the order", done && done.textContent.includes("#1012"));
  ok("the fields are gone, so there is no doubt it was placed", !form.querySelector('[name="prenom"]'));

  let stored = null;
  try {
    stored = JSON.parse(doc.defaultView.sessionStorage.getItem("souq:lastOrder"));
  } catch {}
  ok("handover written for a thank-you page", stored && stored.ref === "#1012");
  ok("handover groups the phone the way it is read", stored && stored.phone === "0555 00 00 00", stored && stored.phone);
  ok("handover carries commune and wilaya name", stored && stored.place === "Bab El Oued, Alger", stored && stored.place);
}

console.log("\n9. No endpoint configured");
{
  const { doc, form } = await build({ endpoint: "" });
  fillValid(form, doc);
  form.dispatchEvent(new doc.defaultView.Event("submit"));
  await tick();
  const status = form.querySelector("[data-mitos-cod-status]");
  ok("shown as a notice, not a success", status.dataset.state === "notice", String(status.dataset.state));
  ok("the message points the merchant at the app", status.textContent.includes("COD"));
  ok("no confirmation is drawn — nothing was sent", !form.querySelector(".mitos-cod-done"));
  ok("the shopper's typing is kept", form.querySelector('[name="prenom"]').value === "Nassim");
}

console.log("\n10. Arabic storefront");
{
  const { doc, form } = await build({ lang: "ar" });
  const w = form.querySelector("[data-mitos-cod-wilaya]");
  ok("wilaya labels are Arabic when the page is", w.options[1].textContent.includes("أدرار"));
  w.value = "16";
  w.dispatchEvent(new doc.defaultView.Event("change"));
  const c = form.querySelector("[data-mitos-cod-commune]");
  ok("commune labels are Arabic too", [...c.options].some((o) => /[؀-ۿ]/.test(o.textContent)));
  ok("the commune VALUE stays Latin — it is what the carrier is sent",
     [...c.options].slice(1).every((o) => !/[؀-ۿ]/.test(o.value)));
}

console.log("\n11. Two copies of the script on one page");
{
  const { doc, form, window } = await build();
  window.eval(codJs);
  let posts = 0;
  window.fetch = (url, init) => {
    if (init && init.method === "POST") posts++;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };
  form.setAttribute("data-endpoint", "https://api.example.com/cod");
  fillValid(form, doc);
  form.dispatchEvent(new window.Event("submit"));
  await tick();
  ok("submit is not bound twice", posts <= 1, `posts=${posts}`);
}

console.log("\n12. The JS hooks and the markup agree");
{
  const inJs = new Set(
    (codJs.match(/\[data-mitos-cod-[a-z-]+\]/g) || []).map((s) => s.slice(1, -1))
  );
  const inLiquid = new Set(liquid.match(/data-mitos-cod-[a-z-]+/g) || []);
  const orphaned = [...inJs].filter((h) => !inLiquid.has(h));
  ok("every hook the JS queries exists in the block", orphaned.length === 0, orphaned.join(","));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
