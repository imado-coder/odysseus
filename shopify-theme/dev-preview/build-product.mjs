/* Dev-only harness for the product page.
   The buy box is assembled from a library of independent blocks; `enabled`
   below stands in for the per-product toggles the section schema will expose. */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { icon } from "./icons.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BRAND = "SOUQNA";
const photo = (i) => `photos/prod-${(i % 10) + 1}.jpg`;

/* Every block the merchant can switch on for a product. */
const enabled = {
  savings: true, flash: false, title: true, rating: true, rank: true,
  price: true, priceNote: true, priceDrop: true, stock: true,
  shippingBar: true, promo: true, swatches: true, qty: true,
  cta: true, shipping: true, pills: false, cod: true,
};

const B = [];
const block = (key, html) => { if (enabled[key]) B.push(html); };


/* Carrier marks. In the theme these are image_picker uploads; the harness
   renders a neutral wordmark so the layout is exercised without shipping
   anyone else's logo. */
const carrierMark = (name, bg, fg) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32">
<rect width="120" height="32" rx="4" fill="${bg}"/>
<text x="60" y="21" text-anchor="middle" font-family="system-ui,sans-serif"
      font-size="15" font-weight="800" fill="${fg}">${name}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};

const carriers = [
  { name: "Yalidine", logo: carrierMark("YALIDINE", "#0b3d91", "#ffffff") },
  { name: "ZR Express", logo: carrierMark("ZR EXPRESS", "#c9271c", "#ffffff") },
  { name: "Algérie Poste", logo: carrierMark("POSTE DZ", "#f0f2f3", "#0f7a3d") },
];

/* --- COD lead form -------------------------------------------------------
   Placeholder tariffs: a five-zone model so the preview shows realistic
   per-wilaya pricing. These are DEFAULTS for the merchant to edit in the
   theme editor, not quoted carrier rates. [home, desk] in DA. */
const zone = { 1: [400, 200], 2: [500, 250], 3: [600, 300], 4: [800, 400], 5: [1000, 500] };
const zoneOf = (code) => {
  const n = parseInt(code, 10);
  if ([16].includes(n)) return 1;
  if ([9, 35, 42, 44, 6, 15, 10, 26, 2, 13, 22, 27, 31, 46, 48, 21, 23, 43, 24, 25].includes(n)) return 2;
  if ([5, 12, 14, 17, 18, 19, 20, 28, 29, 34, 36, 38, 40, 41, 45, 4, 7, 3, 32].includes(n)) return 3;
  if ([8, 30, 39, 47, 51, 55, 57, 58, 52].includes(n)) return 4;
  return 5;
};

function codForm({ id, unit = 1530 }) {
  const tariffs = {};
  for (let i = 1; i <= 58; i++) {
    const code = String(i).padStart(2, "0");
    tariffs[code] = zone[zoneOf(code)];
  }

  const field = (name, label, control, hint) => `<div class="field">
        <label class="field__label" for="${id}-${name}">${label} <span class="field__req" aria-hidden="true">*</span></label>
        ${control}
        ${hint ? `<span class="field__hint">${hint}</span>` : ""}
        <span class="field__error">${icon("shield", "icon--sm")} Ce champ est obligatoire</span>
      </div>`;

  return `<form class="cod" data-cod-form id="${id}"
      data-unit-price="${unit}"
      data-tariffs='${JSON.stringify(tariffs)}'
      data-tariff-fallback="[600,350]"
      data-msg-invalid="Merci de corriger les champs signalés en rouge."
      data-msg-pending="Formulaire valide. Connectez l'application COD pour enregistrer la commande."
      novalidate>
  <div class="cod__head">
    <span class="cod__head-icon" aria-hidden="true">\u{1F4B5}</span>
    <span class="cod__head-text">
      <span class="cod__title">Commander — paiement à la livraison</span>
      <span class="cod__subtitle">Remplissez le formulaire, payez au facteur</span>
    </span>
  </div>

  <div class="cod__body">
    <div class="cod__row cod__row--2">
      ${field("prenom", "Prénom", `<input class="field__control" id="${id}-prenom" name="prenom" type="text" autocomplete="given-name" placeholder="Nassim" data-cod-required>`)}
      ${field("nom", "Nom", `<input class="field__control" id="${id}-nom" name="nom" type="text" autocomplete="family-name" placeholder="Benali" data-cod-required>`)}
    </div>

    <div class="cod__row">
      ${field(
        "tel",
        "Téléphone",
        `<span class="field__affix">
          <span class="field__affix-label" aria-hidden="true">+213</span>
          <input class="field__control" id="${id}-tel" name="telephone" type="tel"
                 inputmode="numeric" autocomplete="tel-national" placeholder="0555 00 00 00"
                 data-cod-required data-cod-pattern="^0[567][0-9]{8}$|^0[1-4][0-9]{7,8}$">
        </span>`,
        "Nous vous appelons sur ce numéro pour confirmer."
      )}
    </div>

    <div class="cod__row cod__row--2">
      ${field("wilaya", "Wilaya", `<select class="field__control" id="${id}-wilaya" name="wilaya" data-cod-wilaya data-cod-required autocomplete="address-level1">
          <option value="">Choisir la wilaya…</option>
        </select>`)}
      ${field("commune", "Commune", `<select class="field__control" id="${id}-commune" name="commune" data-cod-commune data-cod-required autocomplete="address-level2"
          data-placeholder="Choisir la commune…" data-placeholder-empty="Choisissez d'abord la wilaya" disabled>
          <option value="">Choisissez d'abord la wilaya</option>
        </select>`)}
    </div>

    <div class="cod__row">
      ${field(
        "adresse",
        "Adresse de livraison",
        `<textarea class="field__control" id="${id}-adresse" name="adresse" autocomplete="street-address"
           placeholder="Cité, rue, numéro, point de repère…" data-cod-required></textarea>`,
        "Plus l'adresse est précise, plus la livraison est rapide."
      )}
    </div>

    <fieldset class="cod__fieldset">
      <legend class="cod__legend">Mode de livraison</legend>
      <div class="cod__delivery">
        <label class="dopt">
          <input class="dopt__input" type="radio" name="livraison" value="home" data-cod-delivery checked>
          <span class="dopt__mark" aria-hidden="true"></span>
          <span class="dopt__text">
            <span class="dopt__name">À domicile</span>
            <span class="dopt__price" data-cod-opt-price data-idle="—">—</span>
          </span>
        </label>
        <label class="dopt">
          <input class="dopt__input" type="radio" name="livraison" value="desk" data-cod-delivery>
          <span class="dopt__mark" aria-hidden="true"></span>
          <span class="dopt__text">
            <span class="dopt__name">Bureau de livraison</span>
            <span class="dopt__price" data-cod-opt-price data-idle="—">—</span>
          </span>
        </label>
      </div>
    </fieldset>

    <div class="cod__row cod__row--2">
      <div class="field">
        <label class="field__label" for="${id}-qte">Quantité</label>
        <select class="field__control" id="${id}-qte" name="quantite" data-cod-qty>
          <option>1</option><option>2</option><option>3</option><option>4</option>
        </select>
      </div>
    </div>

    <dl class="cod__summary">
      <div class="cod__line"><dt>Sous-total</dt><dd data-cod-out-sub>—</dd></div>
      <div class="cod__line"><dt>Livraison</dt><dd data-cod-out-ship class="cod__muted">—</dd></div>
      <div class="cod__line cod__line--total"><dt>Total à payer</dt><dd data-cod-out-total>—</dd></div>
    </dl>

    <button class="cod__submit" type="submit" data-cod-submit>
      <span class="cod__spinner" aria-hidden="true" hidden></span>
      Confirmer la commande
    </button>

    <p class="cod__reassure">
      <span aria-hidden="true">\u{1F512}</span>
      Aucun paiement en ligne — vous payez à la réception.
    </p>

    <p class="cod__status" data-cod-status role="status" aria-live="polite"></p>
  </div>
</form>`;
}


block("savings", `<div class="bb__savings">
  <span class="bb__savings-flag">${icon("tag")} ÉCONOMIES</span>
  <span class="bb__savings-list">
    <span class="bb__savings-item">${icon("check", "icon--sm")} Livraison gratuite</span>
    <span class="bb__savings-item">${icon("check", "icon--sm")} Crédit en cas de retard <span aria-hidden="true">›</span></span>
  </span>
</div>`);

block("title", `<div class="bb__title-row">
  <h1 class="bb__title">Support téléphone magnétique à ventouse amélioré, verrouillage rotatif réglable, adapté pour voitures, salles de sport et miroirs (noir / blanc)</h1>
  <button class="bb__share" type="button" aria-label="Partager ce produit">${icon("share")}</button>
</div>`);

block("rating", `<div class="bb__rating">
  <span class="bb__rating-score">4,5</span>
  <span class="bb__rating-stars" aria-hidden="true">★★★★⯪</span>
  <span class="visually-hidden">Noté 4,5 sur 5.</span>
  <span class="bb__rating-count">40 000+ ventes</span>
  <span class="bb__rating-sep" aria-hidden="true">|</span>
  <span>Vendu par</span>
  <span class="bb__seller-badge">${icon("star")} Vendeur vedette</span>
</div>`);

block("rank", `<div class="bb__rank">
  <span class="bb__rank-badge">#1 Meilleure vente</span>
  <span>dans Supports de téléphone voiture <span aria-hidden="true">›</span></span>
</div>`);

block("price", `<div class="bb__price-row">
  <s class="bb__price-was"><span class="visually-hidden">Prix initial </span>7 380 DA</s>
  <span class="bb__price-deal">
    ${icon("clock")}
    <span class="bb__price-label">Dernier jour</span>
    <span class="bb__price-now">1 530 DA</span>
  </span>
</div>`);

block("priceNote", `<div class="bb__price-note">
  <span>après remises et crédits appliqués sur <b>4 470 DA</b> <span aria-hidden="true">›</span></span>
  <span class="bb__off">79% DE RÉDUCTION</span>
</div>`);

block("priceDrop", `<span class="bb__notice">A baissé de 210 DA</span>`);
block("stock", `<span class="bb__notice">PRESQUE ÉPUISÉ <span aria-hidden="true">ⓘ</span></span>`);

block("promo", `<div class="bb__promo">
  <div class="bb__promo-head">
    <span class="bb__promo-name">GRANDES PROMOS</span>
    <span class="bb__promo-rule" aria-hidden="true"></span>
    <span class="bb__promo-timer">${icon("clock", "icon--sm")} SE TERMINE DANS 16:04:43</span>
    <span class="bb__promo-more" aria-hidden="true">›</span>
  </div>
  <div class="bb__promo-body">
    <div class="bb__promo-line">
      <img class="bb__promo-thumb" src="${photo(0)}" alt="" width="64" height="64" loading="lazy" decoding="async">
      <span class="bb__promo-fields">
        <span>Modèle : <b>Ensemble Classique</b></span>
        <label>Qté
          <select class="bb__qty-select" aria-label="Quantité">
            <option>1</option><option>2</option><option>3</option>
          </select>
        </label>
      </span>
      <button class="bb__promo-add" type="button">AJOUTER<br>AU PANIER</button>
    </div>
  </div>
</div>`);

const swatches = [
  ["Ensemble Classique Noir", 0], ["Ensemble Premium Blanc", 1],
  ["Ensemble Sport Bleu", 2], ["Ensemble Compact", 3], ["Ensemble Pro", 4],
];
block("swatches", `<div>
  <div class="bb__opt-label">Couleur : <b>Ensemble Classique Noir</b></div>
  <div class="bb__swatches" role="group" aria-label="Choisir une couleur">
    ${swatches
      .map(
        ([name, i], n) => `<button class="bb__swatch" type="button"${n === 0 ? ' aria-current="true"' : ""}>
      <img src="${photo(i)}" alt="" width="96" height="96" loading="lazy" decoding="async">
      <span class="bb__swatch-name">${name}</span>
    </button>`
      )
      .join("\n    ")}
  </div>
</div>`);

block("qty", `<div class="bb__qty-row">
  <label>Qté
    <select class="bb__qty-select" aria-label="Quantité">
      <option>1</option><option>2</option><option>3</option><option>4</option>
    </select>
  </label>
  <span class="bb__qty-sold">${icon("flame")} 40 000+ ventes</span>
</div>`);

block("cta", `<button class="bb__cta" type="button">
  -79% maintenant ! Ajouter au panier
</button>`);

block("shipping", `<div class="deliv">
  <span class="deliv__title">${icon("truck")} Livraison gratuite sur toutes les commandes ${icon("chevron", "icon--sm")}</span>
  <span class="deliv__row">Livraison : <b>2 à 5 jours ouvrés</b></span>
  <span class="deliv__carriers">
    <span class="deliv__row">Transporteur :</span>
    ${carriers
      .map(
        (c) => `<span class="deliv__carrier">
      <img class="deliv__logo" src="${c.logo}" alt="" width="120" height="32" loading="lazy" decoding="async">
      ${c.name}
    </span>`
      )
      .join("\n    ")}
  </span>
  <span class="deliv__partner">
    <span class="deliv__partner-brand">SOUQNA <span aria-hidden="true">&times;</span> ${icon("truck", "icon--sm")}</span>
    <span class="deliv__partner-text">Ensemble pour une meilleure livraison</span>
  </span>
  <span class="deliv__line">${icon("shield-check")} Paiement à la livraison &middot; Données protégées ${icon("chevron", "icon--sm")}</span>
  <span class="deliv__line">${icon("box")} Garantie de commande ${icon("chevron", "icon--sm")}</span>
  <span class="deliv__pills">
    <span class="deliv__pill">Retour sous 7 jours</span>
    <span class="deliv__pill">Échange gratuit</span>
    <span class="deliv__pill">Article endommagé remboursé</span>
  </span>
</div>`);


const COD_MODE = "button"; // "inline" | "button" — exposed as a theme setting

block("cod", `<div class="cod-wrap" data-cod-wrap data-mode="${COD_MODE}" data-open="false" id="cod-anchor">
  <button class="bb__reveal" type="button" data-cod-reveal>
    <span class="bb__reveal-main">-79% maintenant ! Commander</span>
    <span class="bb__reveal-sub">Paiement à la livraison — remplissez le formulaire</span>
  </button>
  ${codForm({ id: "cod-desktop" })}
</div>`);

block("pills", `<div class="bb__pills">
  <span class="bb__pill">Retour sous 7 jours</span>
  <span class="bb__pill">Échange gratuit</span>
  <span class="bb__pill">Article endommagé remboursé</span>
</div>`);


/* --- left column --------------------------------------------------------- */
const thumbs = Array.from({ length: 6 }, (_, i) => i);

const gallery = `<div class="gallery" data-gallery>
  <div class="gallery__thumbs" role="group" aria-label="Miniatures du produit">
    ${thumbs
      .map(
        (i) => `<button class="gallery__thumb" type="button"${i === 0 ? ' aria-current="true"' : ""} aria-label="Image ${i + 1}">
      <img src="${photo(i)}" alt="" width="64" height="64" loading="lazy" decoding="async">
    </button>`
      )
      .join("\n    ")}
  </div>

  <div class="gallery__stage">
    <img src="${photo(0)}" alt="Vue principale du produit" width="700" height="875"
         fetchpriority="high" decoding="async">
  </div>

  <div class="gallery__slider" data-gallery-slider tabindex="0"
       role="region" aria-label="Photos du produit">
    ${thumbs
      .map(
        (i) => `<div class="gallery__slide">
      <img src="${photo(i)}" alt="Photo ${i + 1} du produit" width="700" height="700"
           ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
    </div>`
      )
      .join("\n    ")}
  </div>

  <div class="gallery__float">
    <span class="gallery__float-group">
      <a class="gfab" href="#" aria-label="Retour">${icon("chevron")}</a>
    </span>
    <span class="gallery__float-group">
      <a class="gfab" href="#" aria-label="Rechercher">${icon("search")}</a>
      <button class="gfab" type="button" aria-label="Partager">${icon("share")}</button>
    </span>
  </div>

  <div class="gallery__dots" role="tablist" aria-label="Choisir une photo">
    ${thumbs
      .map(
        (i) => `<button class="gallery__dot" type="button" data-gallery-dot${i === 0 ? ' aria-current="true"' : ""} aria-label="Photo ${i + 1}"></button>`
      )
      .join("\n    ")}
  </div>

  <span class="gallery__count"><span data-gallery-index>1</span>/${thumbs.length}</span>
</div>`;

const reviews = [
  ["17***06", "Algérie", "18 juil. 2026", 5, "Très léger et super confortable. La couleur correspond bien à celle de la photo."],
  ["Beverley O.", "France", "29 juil. 2026", 5, "Très bonne qualité pour le prix. La fixation tient parfaitement même sur route dégradée."],
  ["mr***zp", "Algérie", "9 mai 2026", 5, "Produit conforme, livraison rapide. Je recommande vivement."],
  ["99***49", "Tunisie", "30 juin 2026", 4, "Bon rapport qualité-prix, mais la notice est en anglais uniquement."],
];

const fit = [["Trop petit", 3], ["Taille juste", 92], ["Trop grand", 5]];

const reviewsBlock = `<section class="reviews" aria-labelledby="ReviewsTitle">
  <div class="reviews__head">
    <h2 class="reviews__count" id="ReviewsTitle">739 avis</h2>
    <span class="reviews__sep" aria-hidden="true">|</span>
    <span class="reviews__score">4,6
      <span class="reviews__stars" aria-hidden="true">★★★★⯪</span>
    </span>
    <span class="reviews__verified">${icon("check", "icon--sm")} Tous les avis proviennent d'achats vérifiés</span>
  </div>
  <div class="reviews__fit">
    ${fit
      .map(
        ([label, pct]) => `<div class="fitrow">
      <span>${label}</span>
      <span class="fitrow__track"><span class="fitrow__bar" style="inline-size:${pct}%"></span></span>
      <span class="fitrow__val">${pct}%</span>
    </div>`
      )
      .join("\n    ")}
  </div>
  ${reviews
    .map(
      ([name, country, date, stars, text]) => `<article class="review">
    <div class="review__head">
      <span class="review__avatar" aria-hidden="true">${name[0]}</span>
      <span class="review__name">${name}</span>
      <span class="review__meta">Pays : ${country}</span>
      <span class="review__meta">le ${date}</span>
    </div>
    <div class="review__rating">
      <span class="review__stars" aria-hidden="true">${"★".repeat(stars)}${"☆".repeat(5 - stars)}</span>
      <span class="visually-hidden">Noté ${stars} sur 5.</span>
      ${stars >= 5 ? '<span class="review__tag">Excellent</span>' : ""}
    </div>
    <p class="review__text">${text}</p>
  </article>`
    )
    .join("\n  ")}
</section>`;

const landing = `<section class="landing" aria-labelledby="LandingTitle">
  <h2 class="visually-hidden" id="LandingTitle">Détails du produit</h2>
  <button class="landing__toggle" type="button">Voir tous les détails <span aria-hidden="true">▾</span></button>
  <div class="landing__stack">
    ${[5, 6, 7]
      .map(
        (i, n) => `<div class="landing__item">
      <img src="${photo(i)}" alt="" width="700" height="700" loading="lazy" decoding="async">
      ${n === 1 ? '<span class="landing__play" aria-hidden="true">▶</span>' : ""}
    </div>`
      )
      .join("\n    ")}
  </div>
</section>`;

const related = `<section class="related" aria-labelledby="RelatedTitle">
  <h2 class="related__title" id="RelatedTitle">Produits similaires</h2>
  <div class="cgrid">
    ${[1, 2, 3, 8, 9]
      .map(
        (i, n) => `<article class="pgc" aria-labelledby="rel-${n}">
      <div class="pgc__media">
        <a href="#" tabindex="-1" aria-hidden="true">
          <img class="pgc__img" src="${photo(i)}" alt="" width="700" height="700" loading="lazy" decoding="async">
        </a>
      </div>
      <h3 class="pgc__title" id="rel-${n}"><a href="#">Produit similaire ${n + 1} — accessoire utile pour la voiture</a></h3>
      <div class="pgc__price-row">
        <span class="pgc__price-wrap">
          <span class="pgc__deal">Dernier jour</span>
          <span class="pgc__price">${(1200 + n * 430).toLocaleString("fr-FR")} DA</span>
          <s class="pgc__compare"><span class="visually-hidden">Prix initial </span>${(4200 + n * 610).toLocaleString("fr-FR")} DA</s>
        </span>
        <button class="pgc__add" type="button" aria-label="Ajouter au panier"><span aria-hidden="true">\u{1F6D2}</span></button>
      </div>
      <div class="pgc__rating">
        <span class="pgc__stars" aria-hidden="true">★★★★⯪</span>
        <span class="visually-hidden">Noté 4,5 sur 5.</span>
        <span class="pgc__sold">${icon("flame")} 12 000+ ventes</span>
      </div>
    </article>`
      )
      .join("\n    ")}
  </div>
</section>`;

const html = `<!doctype html>
<html lang="fr" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page produit</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/catalog-system.css">
<link rel="stylesheet" href="../assets/product-page.css">
<link rel="stylesheet" href="../assets/badges.css">
<link rel="stylesheet" href="../assets/pdp-mobile.css">
<link rel="stylesheet" href="../assets/cod-form.css">
<script src="../assets/dz-locations.js" defer></script>
<script src="../assets/theme.js" defer></script>
</head>
<body>
<a class="skip-to-content visually-hidden" href="#MainContent">Aller au contenu</a>
<main class="pdp" id="MainContent" tabindex="-1">
  <div class="pdp__inner">
    <nav class="pdp__crumbs" aria-label="Fil d'Ariane">
      <a href="#">Accueil</a><span class="pdp__crumb-sep">${icon("chevron", "icon--sm")}</span>
      <a href="#">Auto et Moto</a><span class="pdp__crumb-sep">${icon("chevron", "icon--sm")}</span>
      <span class="pdp__crumb-current">Supports de téléphone</span>
    </nav>

    <div class="pdp__grid">
      <div class="pdp__gallery">
        ${gallery}
      </div>
      <div class="pdp__buybox" data-sticky-fit>
        <div class="bb">
          ${B.join("\n          ")}
        </div>
      </div>

      <div class="pdp__details">
        ${landing}
        ${reviewsBlock}
        ${related}
      </div>
    </div>
  </div>
</main>

<div class="pdp__mobile-cta" data-order-bar>
  <span class="pdp__mobile-price">
    <b>1 530 DA</b>
    <s>7 380 DA</s>
  </span>
  <button class="bb__cta" type="button" data-order-jump>Commander maintenant</button>
</div>

<div class="cod-sheet" id="CodSheet" data-open="false">
  <div class="cod-sheet__scrim" data-sheet-close></div>
  <div class="cod-sheet__panel" role="dialog" aria-modal="true" aria-label="Formulaire de commande">
    <div class="cod-sheet__grip">
      <span class="cod-sheet__grip-title">Commander — paiement à la livraison</span>
      <button class="cod-sheet__close" type="button" data-sheet-close aria-label="Fermer">✕</button>
    </div>
    ${codForm({ id: "cod-mobile" })}
  </div>
</div>
</body>
</html>`;

writeFileSync(join(here, "product.html"), html);
console.log("wrote product.html —", B.length, "buy-box blocks enabled");
