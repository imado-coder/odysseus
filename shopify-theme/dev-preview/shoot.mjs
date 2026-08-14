/* Dev-only. Screenshots the preview at the target breakpoints and reports
   horizontal overflow, which is the failure mode that matters most on mobile. */

import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });

const page_ = process.argv[2] || "home";
const url = "file://" + join(here, `${page_}.html`);

const sizes = [
  { name: "360", width: 360, height: 780, mobile: true },
  { name: "390", width: 390, height: 844, mobile: true },
  { name: "414", width: 414, height: 896, mobile: true },
  { name: "768", width: 768, height: 1024, mobile: false },
  { name: "1280", width: 1280, height: 900, mobile: false },
  { name: "1440", width: 1440, height: 900, mobile: false },
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

const report = [];

for (const s of sizes) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: s.mobile ? 2 : 1,
    isMobile: s.mobile,
    hasTouch: s.mobile,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);

  const metrics = await page.evaluate(() => {
    const de = document.documentElement;
    // Any element wider than the viewport is an overflow bug.
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
        const parent = el.closest(
          ".rail, .tabbar, .ubar__inner, .tbar__list, .cpills__track"
        );
        if (parent && parent !== el) continue; // rails scroll on purpose
        offenders.push(
          el.tagName.toLowerCase() +
            (el.className && typeof el.className === "string"
              ? "." + el.className.trim().split(/\s+/).join(".")
              : "")
        );
      }
    }
    return {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      scrollHeight: de.scrollHeight,
      offenders: [...new Set(offenders)].slice(0, 8),
    };
  });

  const overflow = metrics.scrollWidth - metrics.clientWidth;
  report.push({
    width: s.name,
    hOverflow: overflow > 1 ? `${overflow}px` : "none",
    pageHeight: metrics.scrollHeight,
    offenders: metrics.offenders,
  });

  await page.screenshot({
    path: join(outDir, `${page_}-${s.name}-fold.png`),
    fullPage: false,
  });
  if (s.name === "390" || s.name === "1440") {
    await page.screenshot({
      path: join(outDir, `${page_}-${s.name}-full.png`),
      fullPage: true,
    });
  }
  await ctx.close();
}

await browser.close();
console.table(report);
