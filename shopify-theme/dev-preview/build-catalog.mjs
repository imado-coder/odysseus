/* Dev-only harness for catalog components (parts 6-9). */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BRAND = "SOUQNA";

/* Real product photography for the preview (Unsplash licence, unbranded
   subjects only). Dev harness assets — the theme itself renders whatever the
   merchant uploads to Shopify. */
const photo = (i) => `photos/prod-${(i % 10) + 1}.jpg`;

const pal = [
  ["#eef1f4", "#2b3a4a", "#7d94a8"], ["#f0f2ee", "#3d4a2f", "#8fa578"],
  ["#f6eeea", "#7a3b26", "#c98a66"], ["#eceef2", "#3b3f52", "#8c92ad"],
  ["#f2eef4", "#4a2f57", "#9b78ab"], ["#eef4f4", "#1f4f52", "#6ea3a6"],
  ["#f4f1e8", "#5a4a1f", "#b0a06a"], ["#f4eef0", "#5a2436", "#ad7387"],
  ["#e9f0f6", "#1f405c", "#6d97b8"], ["#f0efe9", "#4a4530", "#a09b78"],
];

function img(i) {
  const [bg, dark, mid] = pal[i % pal.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
<rect width="300" height="300" fill="${bg}"/>
<circle cx="${112 + (i % 4) * 18}" cy="118" r="${58 + (i % 3) * 9}" fill="${mid}" opacity=".5"/>
<rect x="98" y="96" width="118" height="126" rx="${14 + (i % 4) * 5}" fill="${dark}" opacity=".9"/>
<rect x="124" y="124" width="66" height="66" rx="${8 + (i % 3) * 6}" fill="${mid}" opacity=".8"/>
<circle cx="157" cy="157" r="17" fill="${bg}" opacity=".9"/>
<rect x="112" y="238" width="90" height="9" rx="4" fill="${dark}" opacity=".2"/>
</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* --- PART 6 -------------------------------------------------------------- */
const pillLabels = [
  "Recommandé", "Beauté et Soins personnels", "Vêtements femme", "Maison et Cuisine",
  "Vêtements homme", "Chaussures femme", "Pyjamas et Sous-vêtements homme",
  "Sports et Activités d'extérieur", "Fournitures de bureau et écoles",
];

function cpills(v) {
  return `<nav class="cpills" data-variant="${v}" data-scroller aria-label="Filtrer par catégorie">
  <ul class="cpills__track" data-scroller-track>
    ${pillLabels
      .map(
        (l, i) =>
          `<li><a class="cpill" href="#" data-label="${l}"${i === 0 ? ' aria-current="page"' : ""}>${l}</a></li>`
      )
      .join("\n    ")}
  </ul>
  <button class="cpills__next" type="button" data-scroller-next aria-label="Catégories suivantes">
    <span aria-hidden="true">\u203a</span>
  </button>
</nav>`;
}

/* --- PART 7 -------------------------------------------------------------- */
const items = [
  { t: "Montre connectée écran tactile étanche IP68 multisport", p: "1.53", c: "7.38", note: "À baissé de €0.21", stars: 4.5, sold: "40,000+", ad: false, seller: true, video: true },
  { t: "Casque audio sans fil réduction de bruit active 40h", p: "4.99", c: "29.32", note: "PLUS QUE 12", noteInfo: true, stars: 4.5, sold: "12,000+", ad: false, seller: false, video: true },
  { t: "Sac à dos imperméable avec port USB intégré 30L", p: "29.97", c: "105.39", note: "#5 Le mieux noté dans Bagages et Voyage", rank: true, stars: 4.5, sold: "5,000+", ad: true, seller: false, video: true },
  { t: "Baskets homme running maille respirante semelle souple", p: "2.97", c: "19.01", stars: 4.5, sold: "29,000+", ad: false, seller: false, video: true },
  { t: "Sac à main cuir texturé anse rigide fermoir doré", p: "2.76", c: "11.15", stars: 4.5, sold: "21,000+", ad: true, seller: true, video: false },
  { t: "Parure bijoux plaqué or pierres naturelles 3 pièces", p: "10.45", c: "48.54", note: "Article meilleure vente dans Bijoux", rank: true, stars: 4.5, sold: "15,000+", ad: false, seller: false, video: true },
  { t: "Set 5 pièces ustensiles de cuisine en fonte émaillée", p: "12.87", c: "51.54", note: "PLUS QUE 3", noteInfo: true, stars: 4, sold: "6,000+", ad: false, seller: false, video: true },
  { t: "Costume 3 pièces homme coupe ajustée laine mélangée", p: "1.39", c: "6.48", note: "#10 DES ARTICLES LES PLUS VENDUS", rank: true, stars: 4.5, sold: "150,000+", ad: false, seller: true, video: false },
  { t: "Horloge murale silencieuse 30 cm cadran minimaliste", p: "2.52", c: "6.15", note: "#2 Article meilleure vente dans Décoration", rank: true, stars: 5, sold: "7,000+", ad: true, seller: true, video: true },
  { t: "Sac à main structuré bandoulière amovible cuir grainé", p: "3.91", c: "13.34", note: "#2 Article meilleure vente dans Sacs", rank: true, stars: 4.5, sold: "150,000+", ad: false, seller: true, video: false },
];

const starStr = (n) =>
  "\u2605".repeat(Math.floor(n)) +
  (n % 1 ? "\u2bea" : "") +
  "\u2606".repeat(5 - Math.ceil(n));

function pgc(it, i, v, idx) {
  const titleId = `pgc-${v}-${idx}`;
  return `<article class="pgc" data-variant="${v}" aria-labelledby="${titleId}">
  <div class="pgc__media">
    <a href="#" tabindex="-1" aria-hidden="true">
      <img class="pgc__img" src="${photo(i)}" alt="" loading="lazy" width="700" height="700">
    </a>
    ${it.ad ? '<span class="pgc__ad"><span class="visually-hidden">Annonce : </span>Pub</span>' : ""}
    ${it.video ? '<span class="pgc__play" aria-hidden="true">\u25b6</span>' : ""}
  </div>
  <h3 class="pgc__title" id="${titleId}"><a href="#">${it.t}</a></h3>
  <div class="pgc__price-row">
    <span class="pgc__price-wrap">
      <span class="pgc__deal">Dernier jour</span>
      <span class="pgc__price">\u20ac${it.p}</span>
      <s class="pgc__compare"><span class="visually-hidden">Prix initial </span>\u20ac${it.c}</s>
    </span>
    <button class="pgc__add" type="button" aria-label="Ajouter au panier : ${it.t}">
      <span aria-hidden="true">\ud83d\uded2</span>
    </button>
  </div>
  ${
    it.note
      ? `<div class="pgc__note${it.rank ? " pgc__note--rank" : ""}">${it.note}${it.noteInfo ? ' <span aria-hidden="true">\u24d8</span>' : ""}</div>`
      : ""
  }
  <div class="pgc__rating">
    <span class="pgc__stars" aria-hidden="true">${starStr(it.stars)}</span>
    <span class="visually-hidden">Noté ${String(it.stars).replace(".", ",")} sur 5.</span>
    <span class="pgc__sold"><span class="pgc__flame" aria-hidden="true">\u25c6</span> ${it.sold} ventes</span>
  </div>
  ${it.seller ? '<span class="pgc__seller"><span aria-hidden="true">\u2605</span> Vendeur vedette</span>' : ""}
</article>`;
}

function cgrid(v, n = 10) {
  return `<div class="cgrid">
  ${items.slice(0, n).map((it, i) => pgc(it, i, v, i)).join("\n  ")}
</div>`;
}

/* --- PART 8 -------------------------------------------------------------- */
const footCols = [
  ["Informations sur l'entreprise", ["À propos de nous", "Programme Affilié et Influenceur", "Contactez-nous", "Carrières", "Presse"]],
  ["Service client", ["Politique de retour et de remboursement", "Politique de propriété intellectuelle", "Informations de livraison", "Signaler une activité suspecte"]],
  ["Aide", ["Centre d'aide et FAQ", "Centre de sécurité", "Protection des achats", "Devenir partenaire"]],
];

const perks = [
  "Alertes de baisse de prix", "Suivez vos commandes",
  "Paiement plus rapide", "Alertes d'articles",
  "Offres exclusives", "Alertes de coupons",
];

const certs = ["PCI DSS", "VISA secure", "ID Check", "SafeKey", "ProtectBuy", "JCB Secure", "APWG"];
const pays = ["VISA", "Master", "AMEX", "Discover", "Maestro", "Diners", "JCB", "Apple Pay", "G Pay", "CIB", "Edahabia", "COD"];

function tfoot(v) {
  return `<footer class="tfoot" data-variant="${v}">
  <div class="tfoot__inner">
    <div class="tfoot__cols">
      ${footCols
        .map(
          ([title, links]) => `<div>
        <h2 class="tfoot__title">${title}</h2>
        <div class="tfoot__list">
          ${links.map((l) => `<a class="tfoot__link" href="#">${l}</a>`).join("\n          ")}
        </div>
      </div>`
        )
        .join("\n      ")}
      <div class="tfoot__col--app">
        <h2 class="tfoot__title">Téléchargez l'app ${BRAND}</h2>
        <div class="tfoot__perks">
          ${perks.map((p) => `<span class="tfoot__perk"><span aria-hidden="true">\u2714</span> <span>${p}</span></span>`).join("\n          ")}
        </div>
        <div class="tfoot__stores">
          <a class="store-btn" href="#">
            <span class="store-btn__icon" aria-hidden="true">🍎</span>
            <span><span class="store-btn__small">Télécharger dans</span><span class="store-btn__big">l'App Store</span></span>
          </a>
          <a class="store-btn" href="#">
            <span class="store-btn__icon" aria-hidden="true">\u25b6</span>
            <span><span class="store-btn__small">Disponible sur</span><span class="store-btn__big">Google Play</span></span>
          </a>
        </div>
        <h2 class="tfoot__title tfoot__social-title">Connectez-vous avec ${BRAND}</h2>
        <div class="tfoot__social">
          <a href="#" aria-label="Instagram">📷</a>
          <a href="#" aria-label="Facebook">📘</a>
          <a href="#" aria-label="X">✖</a>
          <a href="#" aria-label="TikTok">🎵</a>
          <a href="#" aria-label="YouTube">▶️</a>
          <a href="#" aria-label="Pinterest">📌</a>
        </div>
      </div>
    </div>

    <div class="tfoot__badges">
      <div>
        <h2 class="tfoot__title">Certificats de sécurité</h2>
        <div class="tfoot__badge-row">
          ${certs.map((c) => `<span class="paychip">${c}</span>`).join("\n          ")}
        </div>
      </div>
      <div>
        <h2 class="tfoot__title">Nous acceptons</h2>
        <div class="tfoot__badge-row">
          ${pays.map((p) => `<span class="paychip">${p}</span>`).join("\n          ")}
        </div>
      </div>
    </div>

    <div class="tfoot__bottom">
      <span>© 2026 ${BRAND}</span>
      <a href="#">Conditions d'utilisation</a>
      <a href="#">Politique de confidentialité</a>
      <a href="#">Vos choix en matière de confidentialité</a>
    </div>
  </div>
</footer>`;
}

/* --- PART 9 -------------------------------------------------------------- */
function loadmore(v) {
  return `<div class="loadmore" data-variant="${v}">
  <button class="loadmore__btn" type="button" data-loadmore
          data-idle-label="Afficher plus" data-busy-label="Chargement…">
    <span data-loadmore-label>Afficher plus</span>
    <span class="loadmore__caret" aria-hidden="true">\u25be</span>
  </button>
</div>`;
}

/* --- pages --------------------------------------------------------------- */
const head = (title) => `<!doctype html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/header-system.css">
<link rel="stylesheet" href="../assets/catalog-system.css">
<script src="../assets/theme.js" defer></script>
<style>
  body { background: #eceef0; }
  .demo { padding: 26px 0 6px; }
  .demo__title { font-size: 15px; font-weight: 800; text-transform: uppercase;
    letter-spacing: .06em; color: #5b6570; padding: 0 20px; margin-bottom: 14px; }
  .demo__label { font-size: 11px; font-weight: 700; color: #8a939c;
    padding: 0 20px 6px; letter-spacing: .04em; }
  .demo__variant { margin-bottom: 18px; }
  .demo__stage { background: #fff; box-shadow: 0 1px 3px rgba(16,20,24,.1); padding-block: 4px; }
</style>
</head>
<body>`;

const parts = [
  { title: "Partie 6 — Ligne de filtres catégories", render: cpills },
  { title: "Partie 7 — Carte produit catalogue", render: (v) => cgrid(v, 5) },
  { title: "Partie 9 — Bouton Afficher plus", render: loadmore },
];

writeFileSync(
  join(here, "catalog.html"),
  head("Catalogue — 5 variantes") +
    parts
      .map(
        (p) => `<section class="demo">
  <h2 class="demo__title">${p.title}</h2>
  ${[1, 2, 3, 4, 5]
    .map(
      (v) => `<div class="demo__variant">
    <div class="demo__label">Variante ${v}</div>
    <div class="demo__stage">${p.render(v)}</div>
  </div>`
    )
    .join("\n  ")}
</section>`
      )
      .join("\n") +
    "\n</body></html>"
);

writeFileSync(
  join(here, "footer.html"),
  head("Pied de page — 5 variantes") +
    `<section class="demo"><h2 class="demo__title">Partie 8 — Pied de page</h2>
  ${[1, 2, 3, 4, 5]
    .map(
      (v) => `<div class="demo__variant"><div class="demo__label">Variante ${v}</div>${tfoot(v)}</div>`
    )
    .join("\n  ")}
</section>\n</body></html>`
);

/* Assembled collection surface: pills + grid + load more + footer. */
writeFileSync(
  join(here, "collection.html"),
  head("Page collection") +
    `<style>body{background:#fff}</style>
<a class="skip-to-content visually-hidden" href="#MainContent">Aller au contenu</a>
<main id="MainContent" tabindex="-1">
  <h1 class="visually-hidden">Recommandé pour vous</h1>
${cpills(1)}
  <h2 class="visually-hidden">Produits</h2>
${cgrid(1, 10)}
${loadmore(1)}
</main>
${tfoot(1)}
</body></html>`
);

console.log("wrote catalog.html + footer.html + collection.html");
