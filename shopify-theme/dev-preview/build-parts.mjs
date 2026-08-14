/* Dev-only harness for the five header-stack components.
   Renders every variant of every part so they can be compared side by side. */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const BRAND = "SOUQNA"; // stands in for the merchant's own name

/* Category tile artwork — deterministic local SVGs, no network. */
const tilePal = [
  ["#f3e8d8", "#a8763a"], ["#e6efe4", "#3f7a44"], ["#e8eef8", "#3a5f9e"],
  ["#f7e8ec", "#a8455f"], ["#eae7f5", "#5b4a9e"], ["#fdeee2", "#b8642a"],
  ["#e4f1f2", "#2f7c85"], ["#f2f0e2", "#7a7530"], ["#f6e9f2", "#8a3f74"],
  ["#e9f0e6", "#4f7a35"],
];

function tileImg(i) {
  const [bg, fg] = tilePal[i % tilePal.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<rect width="120" height="120" fill="${bg}"/>
<circle cx="42" cy="46" r="24" fill="${fg}" opacity=".55"/>
<rect x="54" y="52" width="46" height="46" rx="10" fill="${fg}" opacity=".8"/>
<rect x="18" y="82" width="34" height="20" rx="6" fill="${fg}" opacity=".35"/>
</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* --- PART 1 -------------------------------------------------------------- */
const ubarItems = [
  { icon: "🚚", title: "Livraison gratuite sur toutes les commandes", sub: "Offre à durée limitée", color: "#7ee787", chev: true },
  { icon: "📦", title: "Garantie de livraison", sub: "Remboursement en cas de problèmes", color: "#f7f0c8" },
  { icon: "📱", title: `Application ${BRAND}`, sub: "Commandez plus vite", color: "#ffffff" },
];

function ubar(v) {
  const items = ubarItems
    .map(
      (it) => `<div class="ubar__item">
      <span class="ubar__icon" aria-hidden="true">${it.icon}</span>
      <span class="ubar__text" style="--item-color:${it.color}">
        <span class="ubar__title">${it.title}${it.chev ? ' <span class="ubar__chev">›</span>' : ""}</span>
        <span class="ubar__sub">${it.sub}</span>
      </span>
    </div>`
    )
    .join("\n    ");
  const inner =
    v === 2
      ? `<div class="ubar__inner"><div class="ubar__track">${items}${items}</div></div>`
      : `<div class="ubar__inner">${items}</div>`;
  return `<div class="ubar" data-variant="${v}">${inner}</div>`;
}

/* --- PART 2 -------------------------------------------------------------- */
function mhead(v, { open = false } = {}) {
  return `<header class="mhead" data-variant="${v}">
  <div class="mhead__inner">
    <a class="mhead__logo" href="#">
      <span class="logo-tile">
        <span class="logo-tile__mark">🛍</span>
        <span class="logo-tile__word">${BRAND}</span>
      </span>
    </a>
    <nav class="mhead__nav">
      <a class="mhead__nav-link" href="#">👍 Meilleures ventes</a>
      <a class="mhead__nav-link" href="#">⭐ Notés 5 étoiles</a>
      <a class="mhead__nav-link" href="#">Nouveautés</a>
      <span class="mhead__cat-wrap">
        <button class="mhead__cat" type="button" aria-expanded="${open}">
          Catégories <span class="mhead__cat-caret">▲</span>
        </button>
        ${open ? mega(1) : ""}
      </span>
    </nav>
    <form class="mhead__search" role="search">
      <input class="mhead__search-input" type="search" placeholder="Rechercher un produit…">
      <button class="mhead__search-btn" type="submit" aria-label="Rechercher">🔍</button>
    </form>
    <div class="mhead__end">
      <a class="mhead__acct" href="#">
        <span class="mhead__avatar">N</span>
        <span class="mhead__acct-lines">
          <span class="mhead__acct-hi">Bonjour, Nassim</span>
          <span class="mhead__acct-main">Commandes et Compte</span>
        </span>
      </a>
      <a class="mhead__util" href="#"><span aria-hidden="true">🎧</span> Aide</a>
      <a class="mhead__util" href="#"><span class="mhead__flag">FR</span> Français</a>
      <a class="mhead__cart" href="#" aria-label="Panier">🛒<span class="mhead__cart-count">3</span></a>
    </div>
  </div>
</header>`;
}

/* --- PART 3 -------------------------------------------------------------- */
const tbarItems = [
  ["🔒", "Protection des données"],
  ["💳", "Paiement sécurisé"],
  ["✅", "Garantie de livraison"],
];

function tbar(v) {
  return `<div class="tbar" data-variant="${v}">
  <div class="tbar__inner">
    <span class="tbar__lead"><span aria-hidden="true">🛡</span> Pourquoi choisir ${BRAND} ?</span>
    <div class="tbar__list">
      ${tbarItems
        .map(
          ([i, t], n) =>
            `<span class="tbar__item"><span class="tbar__icon" aria-hidden="true">${i}</span>${t}${
              n === tbarItems.length - 1 ? " ›" : ""
            }</span>`
        )
        .join("\n      ")}
    </div>
  </div>
</div>`;
}

/* --- PART 4 -------------------------------------------------------------- */
function pcard(v) {
  return `<div class="pcard" data-variant="${v}">
  <span class="pcard__top">
    <span class="pcard__star" aria-hidden="true">✳</span>
    Soldes d'été
    <span class="pcard__star" aria-hidden="true">✳</span>
  </span>
  <span class="pcard__bottom">À découvrir</span>
</div>`;
}

/* --- PART 5 -------------------------------------------------------------- */
const megaCats = [
  "En vedette", "Maison et Cuisine", "Vêtements femme", "Grandes tailles femme",
  "Chaussures femme", "Lingerie et Pyjamas", "Vêtements homme", "Chaussures homme",
  "Sports et Extérieur", "Bijoux et Accessoires", "Beauté et Soins", "Jouets et Jeux",
  "Automobile", "Mode Enfant",
];

const megaTiles = [
  ["Produits personnalisés", false], ["Décoration intérieure", false],
  ["Rangements de cuisine", false], ["Ustensiles de cuisine", false], ["Literie", false],
  ["Rangement et Organisation", true], ["Armoires de buanderie", false],
  ["Douches et Baignoires", true], ["Espace de vie et Repas", true],
  ["Accessoires de fête", false], ["Tapis et Paillassons", false],
  ["Accessoires pour canapés", false], ["Décorations de fête", false],
  ["Serviettes et Rideaux", false], ["Produits de nettoyage", false],
];

function mega(v) {
  return `<div class="mega" data-variant="${v}" data-open="true">
  <aside class="mega__aside">
    ${megaCats
      .map(
        (c, i) =>
          `<div class="mega__cat"${i === 1 ? ' aria-current="true"' : ""}>${c}<span class="mega__cat-chev">›</span></div>`
      )
      .join("\n    ")}
  </aside>
  <div class="mega__panel">
    <h3 class="mega__panel-title">Tout Maison et Cuisine ›</h3>
    <div class="mega__grid">
      ${megaTiles
        .map(
          ([label, hot], i) => `<a class="mega__tile" href="#">
        <span class="mega__tile-media">
          <img src="${tileImg(i)}" alt="" loading="lazy" width="120" height="120">
          ${hot ? '<span class="mega__hot">HOT</span>' : ""}
        </span>
        <span class="mega__tile-label">${label}</span>
      </a>`
        )
        .join("\n      ")}
    </div>
  </div>
</div>`;
}

/* --- page ---------------------------------------------------------------- */
const parts = [
  { n: 1, title: "Partie 1 — Barre utilitaire", render: ubar, count: 5 },
  { n: 2, title: "Partie 2 — En-tête principal", render: mhead, count: 5 },
  { n: 3, title: "Partie 3 — Barre de confiance", render: tbar, count: 5 },
  { n: 4, title: "Partie 4 — Carte promo", render: pcard, count: 5 },
  { n: 5, title: "Partie 5 — Méga menu Catégories", render: mega, count: 5 },
];

const body = parts
  .map((p) => {
    const variants = Array.from({ length: p.count }, (_, i) => i + 1)
      .map(
        (v) => `<div class="demo__variant">
      <div class="demo__label">Variante ${v}</div>
      <div class="demo__stage${p.n === 5 ? " demo__stage--mega" : ""}${p.n === 4 ? " demo__stage--pad" : ""}">${p.render(v)}</div>
    </div>`
      )
      .join("\n    ");
    return `<section class="demo">
    <h2 class="demo__title">${p.title}</h2>
    ${variants}
  </section>`;
  })
  .join("\n  ");

const html = `<!doctype html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Composants — 5 variantes</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/header-system.css">
<style>
  body { background: #eceef0; }
  .demo { padding: 28px 0 8px; }
  .demo__title {
    font-size: 15px; font-weight: 800; text-transform: uppercase;
    letter-spacing: .06em; color: #5b6570; padding: 0 20px; margin-bottom: 14px;
  }
  .demo__variant { margin-bottom: 18px; }
  .demo__label {
    font-size: 11px; font-weight: 700; color: #8a939c;
    padding: 0 20px 6px; letter-spacing: .04em;
  }
  .demo__stage { background: #fff; box-shadow: 0 1px 3px rgba(16,20,24,.1); }
  .demo__stage--pad { padding: 20px; display: flex; justify-content: center; }
  .demo__stage--mega { padding: 20px; position: relative; }
  .demo__stage--mega .mega { position: relative; inset: auto; }
</style>
</head>
<body>
  ${body}
</body>
</html>`;

writeFileSync(join(here, "parts.html"), html);

/* A second page: the four bars stacked, which is how they actually ship. */
const stacked = `<!doctype html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pile d'en-tête</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/header-system.css">
<style>body{background:#fff}.spacer{padding:22px 20px;display:flex;justify-content:center}</style>
</head>
<body>
${ubar(1)}
${mhead(1, { open: true })}
${tbar(1)}
<div class="spacer">${pcard(1)}</div>
</body>
</html>`;

writeFileSync(join(here, "stack.html"), stacked);
writeFileSync(
  join(here, "stack-closed.html"),
  stacked.replace(mhead(1, { open: true }), mhead(1))
);
console.log("wrote parts.html + stack.html + stack-closed.html");
