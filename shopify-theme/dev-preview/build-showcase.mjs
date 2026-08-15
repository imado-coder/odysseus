/* Stitches every built surface into one page so the whole storefront can be
   reviewed in a single scroll. Dev harness only. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const body = (f) => {
  const s = readFileSync(join(here, f), "utf8");
  return s.slice(s.indexOf("<body>") + 6, s.lastIndexOf("</body>"));
};

const label = (n, t) =>
  `<div class="sc__label"><span class="sc__num">${n}</span>${t}</div>`;

writeFileSync(
  join(here, "showcase.html"),
  `<!doctype html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Storefront — état actuel</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/header-system.css">
<link rel="stylesheet" href="../assets/catalog-system.css">
<link rel="stylesheet" href="../assets/product-page.css">
<script src="../assets/theme.js" defer></script>
<style>
  body { background: #dfe3e6; }
  .sc__label {
    display: flex; align-items: center; gap: 10px;
    padding: 18px 20px 10px; font-size: 13px; font-weight: 800;
    text-transform: uppercase; letter-spacing: .08em; color: #47525c;
  }
  .sc__num {
    display: grid; place-items: center; inline-size: 22px; block-size: 22px;
    border-radius: 50%; background: #101418; color: #fff; font-size: 11px;
  }
  .sc__frame { background: #fff; box-shadow: 0 2px 10px rgba(16,20,24,.12); }
  .sc__frame .mhead__inner, .sc__frame .pdp__buybox { position: static; }
  .sc__frame .pdp__mobile-cta, .sc__frame .tabbar { display: none; }
</style>
</head>
<body>
${label(1, "En-tête complet — barres, navigation, méga menu")}
<div class="sc__frame">${body("stack-closed.html")}</div>
${label(2, "Page collection — filtres, grille, pied de page")}
<div class="sc__frame">${body("collection.html")}</div>
${label(3, "Page produit — colonne collante, avis, détails, similaires")}
<div class="sc__frame">${body("product.html")}</div>
</body>
</html>`
);
console.log("wrote showcase.html");
