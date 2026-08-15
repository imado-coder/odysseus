/* Dev-only harness for the storefront welcome. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { icon } from "./icons.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const BRAND = "SOUQNA";

export function hero() {
  return `<section class="hero-w">
  <div class="hero-w__inner">
    <span class="hero-w__eyebrow">${icon("truck", "icon--sm")} Livraison dans les 58 wilayas</span>
    <h1 class="hero-w__title">Bienvenue chez <em>${BRAND}</em></h1>
    <p class="hero-w__lede">
      Des milliers de produits sélectionnés, au juste prix. Vous commandez,
      vous recevez, et vous payez seulement à la livraison.
    </p>
    <div class="hero-w__actions">
      <a class="hero-w__cta" href="#">${icon("tag")} Voir les offres du jour</a>
      <a class="hero-w__cta hero-w__cta--ghost" href="#">${icon("box")} Suivre ma commande</a>
    </div>
    <div class="hero-w__proof">
      <span class="hero-w__proof-item">${icon("cash")} Paiement à la réception</span>
      <span class="hero-w__proof-item">${icon("truck")} Livraison 2 à 5 jours</span>
      <span class="hero-w__proof-item">${icon("refresh")} Retour sous 7 jours</span>
    </div>
  </div>
</section>`;
}

writeFileSync(
  join(here, "home-hero.html"),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accueil</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/hero.css">
</head><body style="background:#fff">${hero()}</body></html>`
);
console.log("wrote home-hero.html");
