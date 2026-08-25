/**
 * The call list, driven in a real browser.
 *
 * Run: npm run test:dashboard   (mitos-dashboard must not be running elsewhere)
 *
 * mitos-dashboard/index.html is one 62 kB file that renders four screens in
 * two languages, one of which is right-to-left. It is also the only screen a
 * merchant actually has today, since the embedded app is undeployed. Nothing
 * about it can be unit-tested — it has no modules and no exports — so it is
 * tested the way it is used: opened in Chromium, at phone widths, with the
 * server's answers stubbed out.
 *
 * The fixtures in tests/dashboard/ are not invented shapes. live-*.json were
 * captured from the deployed edge function, so a field the server renames
 * breaks these tests. rich-*.json is the same shape with the history the dev
 * store does not have yet — a pushed parcel, a refused one with the courier's
 * own reason, a queued one, and a product losing more than it delivers.
 * Those are the branches that matter and the live shop cannot reach them.
 *
 * The stub is a route interception rather than a running server: this asserts
 * what the page does with bytes the API really produced, without needing the
 * network or a key.
 */

import { chromium } from "playwright-core";
import { existsSync, readdirSync, readFileSync } from "fs";
import { createServer } from "http";
import { extname, join } from "path";
import { fileURLToPath } from "url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const FIX = join(HERE, "dashboard");
const SITE = join(HERE, "..", "..", "mitos-dashboard");
const PORT = 8791;
const TYPES = { ".html": "text/html", ".js": "text/javascript",
  ".png": "image/png", ".webmanifest": "application/manifest+json" };

/* Served rather than opened as file:// — localStorage and a service worker
   both need a real origin, and the page uses both. */
const server = createServer((req, res) => {
  const name = (req.url || "/").split("?")[0].replace(/^\/+/, "") || "index.html";
  try {
    const buf = readFileSync(join(SITE, name));
    res.writeHead(200, { "Content-Type": TYPES[extname(name)] || "application/octet-stream" });
    res.end(buf);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(PORT, r));


const F = (n) => readFileSync(join(FIX, n), "utf8");
/* Whatever Chromium this machine has. PLAYWRIGHT_BROWSERS_PATH is how CI and
   the container name theirs; playwright-core's own resolution is the fallback
   for a developer who ran `npx playwright install`. */
function findChromium() {
  if (process.env.MITOS_CHROMIUM) return process.env.MITOS_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(root)) {
    for (const dir of readdirSync(root)) {
      if (!dir.startsWith("chromium")) continue;
      for (const exe of ["chrome-linux/chrome",
                         "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
                         "chrome-win/chrome.exe",
                         "chrome-linux/headless_shell"]) {
        const full = join(root, dir, exe);
        if (existsSync(full)) return full;
      }
    }
  }
  return undefined;
}

let b;
try {
  b = await chromium.launch({ executablePath: findChromium() });
} catch (e) {
  /* Skipped, not failed: this is the only test in the suite that needs a
     browser, and a developer without one should still get the other 238
     assertions rather than a red suite they cannot fix. */
  console.log("\n  SKIP  no Chromium here — set MITOS_CHROMIUM, or run `npx playwright install chromium`");
  console.log("        " + String(e.message).split("\n")[0]);
  server.close();
  process.exit(0);
}
let failures = 0;
const ok = (n, c, x = "") => { console.log(`  ${c ? "PASS" : "FAIL"}  ${n} ${c ? "" : x}`); if (!c) failures++; };

async function page(lang, { rich }) {
  const p = await b.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on("pageerror", e => errs.push("JS: " + e.message));
  p.on("console", m => { if (m.type() === "error" && !m.text().includes("Failed to load resource")) errs.push("C: " + m.text()); });

  await p.route("**/functions/v1/**", route => {
    const u = route.request().url();
    let body;
    if (u.includes("/admin/stats")) body = rich ? F("rich-stats.json") : (u.includes("days=7") ? F("live-stats7.json") : F("live-stats.json"));
    else if (u.includes("/carriers")) body = F("live-carriers.json");
    else body = rich ? F("rich-orders.json") : F("live-orders.json");
    route.fulfill({ status: 200, contentType: "application/json", body });
  });

  await p.goto(`http://localhost:${PORT}/index.html`);
  await p.evaluate(([k, l]) => { localStorage.setItem("mitos:key", k); localStorage.setItem("mitos:lang", l); }, ["x".repeat(40), lang]);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  return { p, errs };
}

console.log("\n1. The four tabs exist, in both languages");
for (const lang of ["fr", "ar"]) {
  const { p, errs } = await page(lang, { rich: true });
  const tabs = await p.$$eval(".tabbar__item", n => n.map(x => x.textContent.trim()));
  ok(`[${lang}] four tabs: ${JSON.stringify(tabs)}`, tabs.length === 4);

  /* The bar floats over the list. If the content does not clear it, the last
     order on the screen is the one a merchant cannot reach — which is the bug
     every floating tab bar ships with at least once. */
  const clearance = await p.evaluate(() => {
    const bar = document.querySelector(".tabbar__in").getBoundingClientRect();
    const main = getComputedStyle(document.querySelector("main"));
    return { barH: Math.round(bar.height), pad: parseFloat(main.paddingBottom) };
  });
  ok(`[${lang}] the list scrolls clear of the floating bar`,
     clearance.pad > clearance.barH, JSON.stringify(clearance));

  /* Navigation is a sibling of #root, so a data reload must not destroy it. */
  const outside = await p.evaluate(() =>
    !document.getElementById("root").contains(document.getElementById("tabbar")));
  ok(`[${lang}] the bar is not rebuilt with the data`, outside);
  ok(`[${lang}] no console errors`, errs.length === 0, JSON.stringify(errs));
  await p.close();
}

console.log("\n2. The shipment line, on the orders that have one");
{
  const { p, errs } = await page("fr", { rich: true });
  const lines = await p.$$eval(".ship-line", n => n.map(x => x.className + " :: " + x.innerText.replace(/\n/g, " | ")));
  ok("three orders show a parcel state", lines.length === 3, JSON.stringify(lines));
  ok("the failed push is marked bad", lines.some(l => l.includes("ship-line--bad")), JSON.stringify(lines));
  ok("the courier's own reason is shown", lines.some(l => l.includes("wilaya non desservie")), JSON.stringify(lines));
  ok("the tracking number is shown", lines.some(l => l.includes("TRX-2026-0084417")));
  ok("no console errors", errs.length === 0, JSON.stringify(errs));

  /* One order is already at the courier, one failed, one is queued, one has
     no shipment. Only the three that a push would actually do something for
     may offer the button. */
  const sends = await p.$$eval(".card", cs => cs.map(c => ({
    ship: (c.querySelector(".ship-line") || {}).innerText || "",
    hasBtn: !!c.querySelector("[data-send]"),
  })));
  ok("the order already at the courier is not offered a re-send",
     sends.filter(x => x.ship.includes("chez le transporteur")).every(x => !x.hasBtn),
     JSON.stringify(sends));
  ok("the failed one still offers a retry",
     sends.filter(x => x.ship.includes("non envoy")).every(x => x.hasBtn));
  ok("so does the queued one",
     sends.filter(x => x.ship.includes("en attente")).every(x => x.hasBtn));

    await p.close();
}

console.log("\n3. Statistiques");
for (const lang of ["fr", "ar"]) {
  const { p, errs } = await page(lang, { rich: true });
  await p.click('[data-view="stats"]');
  await p.waitForSelector(".kpis");
  const kp = await p.$$eval(".kpi__n", n => n.map(x => x.textContent));
  ok(`[${lang}] six headline numbers`, kp.length >= 6, JSON.stringify(kp));
  const secs = await p.$$eval(".sec__h", n => n.map(x => x.textContent));
  ok(`[${lang}] five sections: ${JSON.stringify(secs)}`, secs.length === 5);
  const bars = await p.$$eval(".spark i", n => n.length);
  ok(`[${lang}] the daily chart has a bar per day`, bars === 25, String(bars));
  const dir = await p.$eval(".spark", n => getComputedStyle(n).direction);
  ok(`[${lang}] time is not mirrored in RTL`, dir === "ltr", dir);
  ok(`[${lang}] no console errors`, errs.length === 0, JSON.stringify(errs));
  await p.screenshot({ path: `stats-${lang}.png`, fullPage: true });
  await p.close();
}

console.log("\n4. The range buttons refetch");
{
  const { p } = await page("fr", { rich: false });
  await p.click('[data-view="stats"]');
  await p.waitForSelector(".range");
  const asked = [];
  p.on("request", r => { if (r.url().includes("/stats")) asked.push(new URL(r.url()).searchParams.get("days")); });
  await p.click('[data-days="7"]');
  await p.waitForTimeout(500);
  ok("clicking 7 j asks the server for 7 days", asked.includes("7"), JSON.stringify(asked));
  const pressed = await p.$eval('[data-days="7"]', n => n.getAttribute("aria-pressed"));
  ok("and the button shows as chosen", pressed === "true");
  await p.close();
}

console.log("\n5. Dark mode: nothing on a card is lighter than the card");
{
  /* A literal like #f1f3f5 baked into a rule is invisible to a media query,
     so the shipment block shipped as a white slab on a black card with grey
     text on it. Every surface colour goes through a token now, and this is
     what notices when one stops.

     A translucent token reports its own rgba rather than what lands on
     screen, so it is composited over the card before being measured. */
  const parse = (c) => { const n = c.match(/[\d.]+/g).map(Number); return { r:n[0], g:n[1], b:n[2], a: n[3] ?? 1 }; };
  const over = (f, g) => ({ r: f.r*f.a + g.r*(1-f.a), g: f.g*f.a + g.g*(1-f.a), b: f.b*f.a + g.b*(1-f.a) });
  const lum = (c) => .2126*c.r + .7152*c.g + .0722*c.b;

  const p3 = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await p3.route("**/functions/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: F("rich-orders.json") }));
  await p3.goto(`http://localhost:${PORT}/index.html`);
  await p3.evaluate(() => { localStorage.setItem("mitos:key", "x".repeat(40)); localStorage.setItem("mitos:lang", "fr"); });
  await p3.reload({ waitUntil: "networkidle" });
  await p3.waitForTimeout(300);

  const r = await p3.evaluate(() => ({
    card: getComputedStyle(document.querySelector(".card")).backgroundColor,
    parts: [...new Map([...document.querySelectorAll(".card .ship-line, .card .pill, .card .dot")]
      .map(n => [n.className, getComputedStyle(n).backgroundColor])).entries()],
  }));
  const cardLum = lum(parse(r.card));
  for (const [cls, bg] of r.parts) {
    const l = lum(over(parse(bg), parse(r.card)));
    ok(`${cls.split(" ").pop()} does not glow on a dark card`, l < cardLum + 55,
       `lum ${l.toFixed(0)} vs card ${cardLum.toFixed(0)}`);
  }
  await p3.close();
}

console.log("\n6. A shop with no orders says so instead of showing zeros");
{
  const p2 = await b.newPage({ viewport: { width: 390, height: 900 } });
  const shop = { domain: "neuf.myshopify.com", currency: "DZD" };
  await p2.route("**/functions/v1/**", r => {
    const stats = r.request().url().includes("/stats");
    r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(stats
        ? { ok: true, days: 30, shop, counts: {},
            totals: { orders: 0, reached: 0, decided: 0, confirmRate: null, deliveryRate: null, lossRate: null },
            money: {}, series: [], wilayas: [], products: [], carriers: [] }
        : { ok: true, shop, counts: {}, orders: [] }) });
  });
  await p2.goto(`http://localhost:${PORT}/index.html`);
  await p2.evaluate(() => { localStorage.setItem("mitos:key", "x".repeat(40)); localStorage.setItem("mitos:lang", "fr"); });
  await p2.reload({ waitUntil: "networkidle" });
  await p2.click('[data-view="stats"]');
  await p2.waitForTimeout(400);
  const txt = await p2.evaluate(() => document.body.innerText);
  ok("it says there is nothing yet", txt.includes("Rien sur cette période"), txt.slice(0, 120));
  ok("and shows no 0 % that would read as a verdict", !txt.includes("0 %"));
  await p2.close();
}

await b.close();
server.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
