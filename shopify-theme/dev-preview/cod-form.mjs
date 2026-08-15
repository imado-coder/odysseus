import { icon } from "./icons.mjs";

const photo = (i) => `photos/prod-${(i % 10) + 1}.jpg`;

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

export function codForm({ id, unit = 1530 }) {
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


