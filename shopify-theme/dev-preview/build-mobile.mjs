/* Dev-only harness for the phone storefront and the phone product page. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { icon } from "./icons.mjs";
import { codForm } from "./cod-form.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BRAND = "SOUQNA";
const photo = (i) => `photos/prod-${(i % 10) + 1}.jpg`;

const head = (title, extra = "") => `<!doctype html>
<html lang="fr" dir="ltr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/badges.css">
<link rel="stylesheet" href="../assets/catalog-system.css">
<link rel="stylesheet" href="../assets/header-system.css">
<link rel="stylesheet" href="../assets/home-mobile.css">
<link rel="stylesheet" href="../assets/product-page.css">
<link rel="stylesheet" href="../assets/pdp-mobile.css">
<link rel="stylesheet" href="../assets/cod-form.css">
<link rel="stylesheet" href="../assets/cart.css">
<link rel="stylesheet" href="../assets/motion.css">
${extra}
<script src="../assets/theme.js" defer></script>
</head><body style="background:#fff">`;


const promos = [
  ["Livraison gratuite dès 8 000 DA", "Dans les 58 wilayas", "#7ee787"],
  ["Paiement à la livraison", "Vous payez à la réception", "#f7f0c8"],
  ["Retour sous 7 jours", "Sans justificatif", "#ffffff"],
];

const strip = () => `<div class="ubar" data-variant="1">
  <div class="ubar__inner" role="region" aria-label="Offres du magasin">
    <div class="ubar__track" style="--ubar-count:${promos.length}">
      ${promos
        .map(
          ([t, s, c], i) => `<div class="ubar__item" style="--ubar-index:${i}">
        <span class="ubar__text" style="--item-color:${c}">
          <span class="ubar__title">${t}</span>
          <span class="ubar__sub">${s}</span>
        </span>
      </div>`
        )
        .join("\n      ")}
    </div>
  </div>
</div>`;

/* --- phone home ---------------------------------------------------------- */
const departments = ["Tout", "Hommes", "Femmes", "Maison", "Bijoux", "Sport", "Beauté"];
const sorts = [["", "Tout"], ["star", "Notés 5 étoiles"], ["flame", "Meilleures ventes"], ["gift", "Nouveautés"]];

const items = [
  ["Ensemble 2 pièces homme t-shirt et short de sport", "1 406", "4 200", "7", true],
  ["Set de 4 pièces base de maquillage teint parfait", "2 430", "5 690", "2 000+", false],
  ["Montre connectée étanche IP68 multisport", "4 900", "12 400", "1 200+", false],
  ["Casque audio sans fil réduction de bruit active", "3 550", "8 350", "3 000+", true],
  ["Sac à dos imperméable port USB intégré 30L", "2 970", "9 010", "820", false],
  ["Baskets homme running maille respirante", "5 920", "16 260", "899", false],
];

const card = (it, i) => {
  const [t, p, c, sold, ad] = it;
  return `<article class="pgc">
  <div class="pgc__media">
    <a href="#" tabindex="-1" aria-hidden="true">
      <img class="pgc__img" src="${photo(i)}" alt="" width="700" height="700"
           loading="${i < 4 ? "eager" : "lazy"}" decoding="async"${i === 0 ? ' fetchpriority="high"' : ""}>
    </a>
    ${ad ? '<span class="pgc__ad"><span class="visually-hidden">Annonce : </span>Pub</span>' : ""}
  </div>
  <h3 class="pgc__title"><a href="#">${t}</a></h3>
  <div class="pgc__rating">
    <span class="stars stars--sm" style="--stars-fill:90%" role="img" aria-label="Noté 4,5 sur 5"></span>
    <span class="pgc__sold">${icon("flame", "pgc__flame")} ${sold} ventes</span>
  </div>
  <div class="pgc__price-row">
    <span class="pgc__price-wrap">
      <span class="pgc__deal">Dernier jour</span>
      <span class="pgc__price">${p} DA</span>
      <s class="pgc__compare"><span class="visually-hidden">Prix initial </span>${c} DA</s>
    </span>
    <button class="pgc__add" type="button"
            data-add-to-cart="p${i}" data-title="${t}" data-price="${p.replace(/\s/g, "")}"
            data-image="${photo(i)}" aria-label="Ajouter au panier : ${t}">${icon("cart")}</button>
  </div>
</article>`;
};

writeFileSync(
  join(here, "mobile-home.html"),
  head("Accueil") +
    strip() + `
<div class="msearch">
  <form class="msearch__field" role="search" action="/search" method="get">
    <label class="visually-hidden" for="MSearch">Rechercher</label>
    <input class="msearch__input" id="MSearch" name="q" type="search" placeholder="ensemble homme">
    <button class="msearch__lens" type="button" aria-label="Rechercher par image">${icon("tag")}</button>
    <button class="msearch__go" type="submit" aria-label="Lancer la recherche">${icon("search")}</button>
  </form>
</div>

<nav class="deptabs" aria-label="Rayons">
  ${departments.map((d, i) => `<a class="deptab" href="#"${i === 0 ? ' aria-current="page"' : ""}>${d}</a>`).join("\n  ")}
</nav>

<div class="promises">
  <span class="promise">
    ${icon("check", "promise__icon")}
    <span class="promise__text">
      <span class="promise__title">Livraison gratuite</span>
      <span class="promise__sub">Dès 8 000 DA</span>
    </span>
  </span>
  <span class="promise">
    ${icon("refresh", "promise__icon")}
    <span class="promise__text">
      <span class="promise__title">Retour sous 7 jours</span>
      <span class="promise__sub">À partir de la livraison</span>
    </span>
  </span>
</div>

<a class="mtrust" href="#">
  ${icon("shield-check")} <span class="mtrust__label">Pourquoi choisir ${BRAND} ?</span>
  <span class="mtrust__end">Paiement à la livraison ${icon("chevron", "icon--sm")}</span>
</a>

<a class="mpartner" href="#">
  <span class="mpartner__brand">${BRAND} ${icon("truck", "icon--sm")}</span>
  <span class="mpartner__text"><span>Ensemble pour une meilleure livraison</span>${icon("chevron", "icon--sm")}</span>
</a>

<nav class="sorttabs" aria-label="Trier les produits">
  ${sorts.map(([ic, l], i) => `<a class="sorttab" href="#"${i === 0 ? ' aria-current="page"' : ""}>${ic ? icon(ic, "icon--sm") : ""}${l}</a>`).join("\n  ")}
</nav>

<div class="cgrid">
  ${items.map(card).join("\n  ")}
</div>

<div class="mnav-spacer"></div>

<nav class="mnav" aria-label="Navigation principale">
  <a class="mnav__item" href="#" aria-current="page">${icon("home")}Accueil</a>
  <a class="mnav__item" href="#">${icon("menu")}Catégories</a>
  <a class="mnav__item" href="#">${icon("user")}<span class="mnav__badge">99+</span>Vous</a>
  <button class="mnav__item" type="button" data-cart-open>${icon("cart")}<span class="mnav__badge" data-cart-count hidden>0</span>Panier</button>
  <span class="mnav__promo">Durée limitée<br>Livraison gratuite</span>
</nav>

<div class="drawer" id="CartDrawer" data-cart-drawer data-open="false" data-step="cart" data-free-shipping="8000">
  <div class="drawer__scrim" data-drawer-close></div>
  <div class="drawer__panel" role="dialog" aria-modal="true" aria-label="Panier">
    <div class="drawer__head">
      <span class="drawer__title">Mon panier</span>
      <span class="drawer__count" data-drawer-count>0 article(s)</span>
      <button class="drawer__close" type="button" data-drawer-close aria-label="Fermer">${icon("close")}</button>
    </div>
    <div class="drawer__body">
      <div data-cart-items></div>
      <div class="cod-mount">
        <button class="drawer__back" type="button" data-cart-back>${icon("chevron")} Retour au panier</button>
        <div class="cod-recap" data-cod-recap></div>
        ${codForm({ id: "cod-cart" })}
      </div>
    </div>
    <div class="drawer__foot" data-cart-foot hidden>
      <dl>
        <div class="drawer__line"><dt>Sous-total</dt><dd data-cart-sub>—</dd></div>
        <div class="drawer__line"><dt>Livraison</dt><dd>Calculée à l'étape suivante</dd></div>
        <div class="drawer__line drawer__line--total"><dt>Total</dt><dd data-cart-total>—</dd></div>
      </dl>
      <button class="drawer__cta" type="button" data-cart-checkout>
        ${icon("cash")} Passer la commande
      </button>
      <p class="drawer__note">${icon("lock", "icon--sm")} Paiement à la livraison — aucun paiement en ligne</p>
    </div>
  </div>
</div>

<div class="toast" data-toast data-open="false">
  <span class="toast__icon">${icon("check")}</span>
  <span data-toast-text></span>
</div>
</body></html>`
);

console.log("wrote mobile-home.html");
