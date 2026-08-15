/* Dev-only harness for the order confirmation page. */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { icon } from "./icons.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const steps = [
  ["check", "Commande reçue", "Nous avons bien enregistré votre commande.", true],
  ["headset", "Appel de confirmation", "Un conseiller vous appelle sous 24 h pour confirmer l'adresse et la taille.", false],
  ["box", "Préparation et expédition", "Votre colis part le jour même de la confirmation.", false],
  ["truck", "Livraison et paiement", "Vous payez au livreur, après avoir vérifié le colis.", false],
];

export function thanks() {
  return `<section class="ty">
  <div class="ty__card">
    <span class="ty__mark">${icon("check", "", 2.6)}</span>
    <h1 class="ty__title">Merci ! Votre commande est enregistrée</h1>
    <p class="ty__lede">
      Nous vous appelons très vite pour confirmer votre commande, puis nous
      l'expédions immédiatement. Vous ne payez rien avant de recevoir le colis.
    </p>
    <span class="ty__ref">${icon("tag", "icon--sm")} Commande n° <b>DZ-10428</b></span>

    <div class="ty__steps">
      ${steps
        .map(
          ([ic, t, d, done]) => `<div class="ty__step${done ? " ty__step--done" : ""}">
        <span class="ty__step-dot">${icon(ic, "icon--sm")}</span>
        <span>
          <span class="ty__step-title">${t}</span>
          <span class="ty__step-text">${d}</span>
        </span>
      </div>`
        )
        .join("\n      ")}
    </div>

    <dl class="ty__summary">
      <div class="ty__line"><dt>Produit</dt><dd>Support téléphone magnétique</dd></div>
      <div class="ty__line"><dt>Quantité</dt><dd>1</dd></div>
      <div class="ty__line"><dt>Livraison — Alger, Bab Ezzouar</dt><dd>400 DA</dd></div>
      <div class="ty__line ty__line--total"><dt>À payer à la livraison</dt><dd>1 930 DA</dd></div>
    </dl>

    <p class="ty__paynote">${icon("cash", "icon--sm")} Aucun paiement en ligne. Vous réglez au livreur.</p>

    <div class="ty__actions">
      <a class="ty__btn ty__btn--primary" href="#">${icon("tag")} Continuer mes achats</a>
      <a class="ty__btn ty__btn--ghost" href="#">${icon("headset")} Nous contacter</a>
    </div>

    <p class="ty__help">
      Un problème avec votre commande ? Appelez-nous au <a href="tel:0555000000">0555 00 00 00</a>.
    </p>
  </div>
</section>`;
}

writeFileSync(
  join(here, "thanks.html"),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Commande confirmée</title>
<link rel="stylesheet" href="../assets/base.css">
<link rel="stylesheet" href="../assets/thank-you.css">
</head><body>${thanks()}</body></html>`
);
console.log("wrote thanks.html");
