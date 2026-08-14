/* Dev-only harness for the product page.
   The buy box is assembled from a library of independent blocks; `enabled`
   below stands in for the per-product toggles the section schema will expose. */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BRAND = "SOUQNA";
const photo = (i) => `photos/prod-${(i % 10) + 1}.jpg`;

/* Every block the merchant can switch on for a product. */
const enabled = {
  savings: true, flash: false, title: true, rating: true, rank: true,
  price: true, priceNote: true, priceDrop: true, stock: true,
  shippingBar: true, promo: true, swatches: true, qty: true,
  cta: true, shipping: true, carriers: true, guarantees: true, pills: true,
};

const B = [];
const block = (key, html) => { if (enabled[key]) B.push(html); };

block("savings", `<div class="bb__savings">
  <span class="bb__savings-flag"><span aria-hidden="true">\u{1F4B0}</span> ÉCONOMIES</span>
  <span class="bb__savings-list">
    <span class="bb__savings-item"><span aria-hidden="true">✔</span> Livraison gratuite</span>
    <span class="bb__savings-item"><span aria-hidden="true">✔</span> Crédit en cas de retard <span aria-hidden="true">›</span></span>
  </span>
</div>`);

block("title", `<div class="bb__title-row">
  <h1 class="bb__title">Support téléphone magnétique à ventouse amélioré, verrouillage rotatif réglable, adapté pour voitures, salles de sport et miroirs (noir / blanc)</h1>
  <button class="bb__share" type="button" aria-label="Partager ce produit"><span aria-hidden="true">↪</span></button>
</div>`);

block("rating", `<div class="bb__rating">
  <span class="bb__rating-score">4,5</span>
  <span class="bb__rating-stars" aria-hidden="true">★★★★⯪</span>
  <span class="visually-hidden">Noté 4,5 sur 5.</span>
  <span class="bb__rating-count">40 000+ ventes</span>
  <span class="bb__rating-sep" aria-hidden="true">|</span>
  <span>Vendu par</span>
  <span class="bb__seller-badge"><span aria-hidden="true">★</span> Vendeur vedette</span>
</div>`);

block("rank", `<div class="bb__rank">
  <span class="bb__rank-badge">#1 Meilleure vente</span>
  <span>dans Supports de téléphone voiture <span aria-hidden="true">›</span></span>
</div>`);

block("price", `<div class="bb__price-row">
  <s class="bb__price-was"><span class="visually-hidden">Prix initial </span>7 380 DA</s>
  <span class="bb__price-deal">
    <span aria-hidden="true">⏰</span>
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
    <span class="bb__promo-timer"><span aria-hidden="true">⏱</span> SE TERMINE DANS 16:04:43</span>
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
  <span class="bb__qty-sold"><span class="pgc__flame" aria-hidden="true">◆</span> 40 000+ ventes</span>
</div>`);

block("cta", `<button class="bb__cta" type="button">
  -79% maintenant ! Ajouter au panier
</button>`);

block("shipping", `<div class="bb__trust">
  <span class="bb__ship-title"><span aria-hidden="true">\u{1F69A}</span> Livraison gratuite dès 8 000 DA <span aria-hidden="true">›</span></span>
  <span class="bb__ship-line">Livraison : <b>2 à 5 jours ouvrés</b></span>
</div>`);

block("carriers", `<div class="bb__carriers">
  <span class="bb__ship-line">Transporteur :</span>
  <span class="bb__carrier"><span class="bb__carrier-logo">YAL</span> Yalidine</span>
  <span class="bb__carrier"><span class="bb__carrier-logo">ZR</span> ZR Express</span>
  <span class="bb__carrier"><span class="bb__carrier-logo">DZ</span> Algérie Poste</span>
</div>`);

block("guarantees", `<div class="bb__trust">
  <span class="bb__trust-row"><span aria-hidden="true">\u{1F4B5}</span> Paiement à la livraison — payez après vérification</span>
  <span class="bb__trust-row"><span aria-hidden="true">\u{1F6E1}</span> Garantie de commande <span aria-hidden="true">›</span></span>
</div>`);

block("pills", `<div class="bb__pills">
  <span class="bb__pill">Retour sous 7 jours</span>
  <span class="bb__pill">Échange gratuit</span>
  <span class="bb__pill">Article endommagé remboursé</span>
</div>`);

/* --- left column --------------------------------------------------------- */
const thumbs = Array.from({ length: 6 }, (_, i) => i);

const gallery = `<div class="gallery">
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
    <img src="${photo(0)}" alt="Support téléphone magnétique, vue principale" width="700" height="875" fetchpriority="high" decoding="async">
  </div>
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
    <span class="reviews__verified"><span aria-hidden="true">✔</span> Tous les avis proviennent d'achats vérifiés</span>
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
        <span class="pgc__sold"><span class="pgc__flame" aria-hidden="true">◆</span> 12 000+ ventes</span>
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
<script src="../assets/theme.js" defer></script>
</head>
<body>
<a class="skip-to-content visually-hidden" href="#MainContent">Aller au contenu</a>
<main class="pdp" id="MainContent" tabindex="-1">
  <div class="pdp__inner">
    <nav class="pdp__crumbs" aria-label="Fil d'Ariane">
      <a href="#">Accueil</a><span class="pdp__crumb-sep" aria-hidden="true">›</span>
      <a href="#">Auto et Moto</a><span class="pdp__crumb-sep" aria-hidden="true">›</span>
      <span class="pdp__crumb-current">Supports de téléphone</span>
    </nav>

    <div class="pdp__grid">
      <div class="pdp__media">
        ${gallery}
        ${reviewsBlock}
        ${landing}
        ${related}
      </div>
      <div class="pdp__buybox">
        <div class="bb">
          ${B.join("\n          ")}
        </div>
      </div>
    </div>
  </div>
</main>

<div class="pdp__mobile-cta">
  <span class="pdp__mobile-price">
    <b>1 530 DA</b>
    <s>7 380 DA</s>
  </span>
  <button class="bb__cta" type="button">Ajouter au panier</button>
</div>
</body>
</html>`;

writeFileSync(join(here, "product.html"), html);
console.log("wrote product.html —", B.length, "buy-box blocks enabled");
