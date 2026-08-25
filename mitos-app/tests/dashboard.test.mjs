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

console.log("\n5. The selection slides rather than jumping");
for (const lang of ["fr", "ar"]) {
  /* A background that switches is instant and tells the eye nothing about
     where the selection went. This asserts three separate things, because
     each has broken on its own: the thumb ends up on the pressed segment, it
     actually moved, and it was still in flight partway through — the last one
     is what fails if the header is ever rebuilt on a filter tap, which resets
     the thumb to its destination with no animation to run. */
  const { p } = await page(lang, { rich: true });
  const thumb = () => p.$eval(".seg__thumb", n => {
    const t = n.parentElement.getBoundingClientRect(), a = n.getBoundingClientRect();
    return { x: Math.round(a.left - t.left), w: Math.round(a.width) };
  });

  const start = await thumb();
  const first = await p.$eval('.seg__item[aria-pressed="true"]', n => {
    const t = n.parentElement.getBoundingClientRect(), a = n.getBoundingClientRect();
    return { x: Math.round(a.left - t.left), w: Math.round(a.width) };
  });
  ok(`[${lang}] it starts on the pressed segment`,
     Math.abs(start.x - first.x) < 3 && Math.abs(start.w - first.w) < 3,
     JSON.stringify({ start, first }));

  await p.click('.seg__item[data-filter="CONFIRMED"]');
  await p.waitForTimeout(80);
  const mid = await thumb();
  await p.waitForTimeout(600);
  const end = await thumb();
  const on = await p.$eval('.seg__item[aria-pressed="true"]', n => {
    const t = n.parentElement.getBoundingClientRect(), a = n.getBoundingClientRect();
    return { x: Math.round(a.left - t.left), w: Math.round(a.width) };
  });

  ok(`[${lang}] it travels`, start.x !== end.x, JSON.stringify({ start, end }));
  ok(`[${lang}] it is still moving 80 ms in`, mid.x !== end.x || mid.w !== end.w,
     JSON.stringify({ mid, end }));
  ok(`[${lang}] it lands on the segment, not near it`,
     Math.abs(end.x - on.x) < 3 && Math.abs(end.w - on.w) < 3,
     JSON.stringify({ end, on }));
  await p.close();
}

console.log("\n6. Dark mode: nothing on a card is lighter than the card");
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

console.log("\n7. The way in");
{
  /* The sign-in screen is the first thing a merchant ever sees, and the three
     provider buttons are the part most likely to be quietly wrong: a label
     that wraps, a badge sitting on top of the text, a page that scrolls
     sideways in Arabic. */
  for (const lang of ["fr", "ar"]) {
    const p4 = await b.newPage({ viewport: { width: 390, height: 844 } });
    await p4.goto(`http://localhost:${PORT}/index.html`);
    await p4.evaluate((l) => { localStorage.clear(); localStorage.setItem("mitos:lang", l); }, lang);
    await p4.reload({ waitUntil: "networkidle" });
    await p4.waitForTimeout(200);

    const r = await p4.evaluate(() => {
      const ssos = [...document.querySelectorAll(".sso")];
      return {
        count: ssos.length,
        heights: ssos.map(n => Math.round(n.getBoundingClientRect().height)),
        clipped: ssos.filter(n => {
          const t = n.querySelector("span");
          return t.scrollWidth > t.clientWidth + 1;
        }).length,
        hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        keyField: !!document.querySelector('.signin input[type="password"]'),
      };
    });
    ok(`[${lang}] three providers are offered`, r.count === 3);
    ok(`[${lang}] none of them wrapped to two lines`,
       r.heights.every(h => h <= 56), JSON.stringify(r.heights));
    ok(`[${lang}] none of the labels is cut off`, r.clipped === 0);
    ok(`[${lang}] the page does not scroll sideways`, r.hOverflow <= 0, String(r.hOverflow));
    /* The path that actually works has to be on the screen beside them. */
    ok(`[${lang}] the access key is still offered`, r.keyField);
    await p4.close();
  }
}

console.log("\n8. Réglages");
{
  const p5 = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p5.route("**/functions/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: F("rich-orders.json") }));
  await p5.goto(`http://localhost:${PORT}/index.html`);
  await p5.evaluate(() => { localStorage.setItem("mitos:key", "x".repeat(40)); localStorage.setItem("mitos:lang", "fr"); localStorage.removeItem("mitos:theme"); });
  await p5.reload({ waitUntil: "networkidle" });
  await p5.waitForTimeout(300);

  await p5.click("[data-open-settings]");
  await p5.waitForTimeout(500);
  ok("the gear opens the sheet",
     await p5.evaluate(() => document.body.classList.contains("sheet-open")));

  /* The key is the only credential to a list of customers' names, phones and
     addresses. Réglages must not print it where a shoulder can read it. */
  const shown = await p5.evaluate(() => document.querySelector(".sheet").textContent);
  ok("the access key is masked, not printed", !shown.includes("x".repeat(40)));

  /* Appearance is a real setting, not a label: it writes the attribute the
     whole palette hangs off, and it persists. */
  await p5.click('[data-theme-set="dark"]');
  await p5.waitForTimeout(200);
  ok("choosing Sombre turns the app dark",
     await p5.evaluate(() => document.documentElement.getAttribute("data-theme")) === "dark");
  await p5.click('[data-theme-set="light"]');
  await p5.waitForTimeout(200);
  ok("choosing Clair turns it back",
     await p5.evaluate(() => document.documentElement.getAttribute("data-theme")) === "light");
  ok("and the choice is remembered",
     await p5.evaluate(() => localStorage.getItem("mitos:theme")) === "light");

  /* A sheet with one way out is a sheet people feel trapped in. */
  await p5.keyboard.press("Escape");
  await p5.waitForTimeout(500);
  ok("escape closes it",
     !(await p5.evaluate(() => document.body.classList.contains("sheet-open"))));
  await p5.close();
}

console.log("\n9. A card says one thing in one colour");
{
  /* The pressed status button used to wear the brand, whatever the status
     was: a cancelled order showed a red stripe, a red badge and a violet
     button — three elements describing one fact, in two colours.

     One order per status is driven through the real render and the button is
     checked against the badge each time. The brand is for navigation and for
     the action; a status is never the brand. */
  const states = ["CONFIRMED", "NO_ANSWER", "DELIVERED", "CANCELLED"];
  const base = JSON.parse(F("rich-orders.json"));
  base.orders = states.map((st, i) => ({
    ...base.orders[0], id: "o" + i, status: st,
    shipState: null, trackingNumber: null, shipError: null,
    shipStatus: null, carrierName: null,
  }));
  base.counts = Object.fromEntries(states.map(s2 => [s2, 1]));

  const p6 = await b.newPage({ viewport: { width: 390, height: 900 } });
  await p6.route("**/functions/v1/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(base) }));
  await p6.goto(`http://localhost:${PORT}/index.html`);
  await p6.evaluate(() => { localStorage.setItem("mitos:key", "x".repeat(40)); localStorage.setItem("mitos:lang", "fr"); });
  await p6.reload({ waitUntil: "networkidle" });
  await p6.waitForTimeout(300);

  const rows = await p6.evaluate(() => [...document.querySelectorAll(".card")].map(c => {
    const on = c.querySelector('.acts button[aria-pressed="true"]');
    return {
      status: on ? on.dataset.set : null,
      button: on ? getComputedStyle(on).color : null,
      badge: getComputedStyle(c.querySelector(".pill")).color,
    };
  }));
  ok("every status has its button pressed", rows.length === 4 && rows.every(r => r.status));
  for (const r of rows) {
    ok(`${r.status}: the chosen button matches its badge`, r.button === r.badge,
       `${r.button} vs ${r.badge}`);
  }
  await p6.close();
}

console.log("\n10. A shop with no orders says so instead of showing zeros");
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
