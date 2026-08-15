/* Bundles the built surfaces into one self-contained document: every
   stylesheet, script and photo inlined, so the preview runs with no network
   access at all. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const asset = (f) => readFileSync(join(here, "../assets", f), "utf8");
const body = (f) => {
  const s = readFileSync(join(here, f), "utf8");
  return s.slice(s.indexOf("<body>") + 6, s.lastIndexOf("</body>"));
};

/* Photos become data URIs so the frame needs no origin. */
const photos = {};
for (let i = 1; i <= 10; i++) {
  const b64 = readFileSync(join(here, "photos", `prod-${i}.jpg`)).toString("base64");
  photos[`photos/prod-${i}.jpg`] = `data:image/jpeg;base64,${b64}`;
}
const inlinePhotos = (html) =>
  html.replace(/photos\/prod-(\d+)\.jpg/g, (m) => photos[m] || m);

let header = body("stack-closed.html");
let collection = body("collection.html");
let product = body("product.html");

/* Merging three documents duplicates their skip links and main landmarks. */
const strip = (h) =>
  h
    .replace(/<a class="skip-to-content[\s\S]*?<\/a>/g, "")
    .replace(/id="MainContent"/g, "")
    .replace(/tabindex="-1"/g, "");

header = strip(header);
collection = strip(collection).replace(/<footer class="tfoot"[\s\S]*?<\/footer>/, "");
product = strip(product);

const doc = `<!doctype html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Boutique</title>
<style>${asset("base.css")}</style>
<style>${asset("header-system.css")}</style>
<style>${asset("catalog-system.css")}</style>
<style>${asset("product-page.css")}</style>
<style>${asset("cod-form.css")}</style>
<style>
  html { scroll-behavior: auto; }
  .surface { scroll-margin-block-start: 0; }
  .surface-sep {
    padding: 10px 16px; font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .12em; text-transform: uppercase;
    background: #101418; color: #8b9aa3; border-block: 1px solid #2a353c;
  }
</style>
</head>
<body>
<div class="surface" id="s-header">${header}</div>
<div class="surface-sep">Page collection</div>
<div class="surface" id="s-collection">${collection}</div>
<div class="surface-sep">Page produit</div>
<div class="surface" id="s-product">${product}</div>
<script>${asset("dz-locations.js")}<\/script>
<script>${asset("theme.js")}<\/script>
</body>
</html>`;

writeFileSync(join(here, "out", "embed.html"), inlinePhotos(doc));
console.log("embed.html bytes:", inlinePhotos(doc).length);
