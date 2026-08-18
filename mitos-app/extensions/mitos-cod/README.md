# Le formulaire COD, dans le thème du marchand

Jusqu'ici le formulaire de commande n'existait que dans *notre* thème
(`shopify-theme/snippets/cod-form.liquid`). Un marchand qui installait
l'application sur un thème qu'il avait déjà n'obtenait rien du tout. Ce bloc
est le même formulaire, porté par l'application : il arrive avec l'installation
et survit à un changement de thème.

## Ce que le marchand fait

1. **Personnaliser → Ajouter un bloc → Applications → Formulaire COD**, sur le
   modèle de page produit.
2. Le placer où il veut dans la page (le bloc suit la largeur de la section).
3. C'est tout. L'adresse de l'application est déjà renseignée.

Le bloc peut aussi être posé sur la page d'accueil ou une page ordinaire ; il
faut alors **choisir un produit** dans ses réglages, puisqu'il n'y en a pas dans
la page. Sur une page produit, laisser ce réglage vide : le produit de la page
est utilisé.

## Ce qui est réglable

| Réglage | À quoi ça sert |
|---|---|
| Adresse de l'application | Reçoit la commande et renvoie les tarifs. Pré-remplie ; à ne changer que si l'application en a donné une autre. |
| Page de confirmation | Facultative. Sans elle, le formulaire affiche lui-même la confirmation. |
| Tarifs de secours | Utilisés **uniquement** si l'application ne répond pas. Les vrais tarifs viennent de la table de livraison. |
| Textes | Laisser vide pour le texte traduit de l'application (français / arabe selon la langue de la boutique). |
| Champs | Masquer l'en-tête, la livraison, la quantité ou le récapitulatif. |
| Couleurs | En-tête et bouton. |

## Ce qui n'est pas réglable, et pourquoi

**Les tarifs de livraison et les offres par quantité.** Ils viennent de
l'application, pas du thème. C'est l'application qui facture : elle recalcule
la livraison depuis la table du marchand et ignore ce que la vitrine lui
envoie. Si le réglage et la table pouvaient diverger, le client serait affiché
un prix et facturé un autre. Le réglage n'est donc qu'un filet de secours.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `blocks/cod-form.liquid` | Le bloc et son schéma. |
| `assets/mitos-cod.js` | Le comportement, porté de `theme.js`. |
| `assets/mitos-cod.css` | Le style, porté de `cod-form.css`. |
| `assets/mitos-dz-locations.js` | 58 wilayas, 1 541 communes. |
| `locales/` | Textes client (fr, ar) et libellés de l'éditeur (fr, en). |

### Trois choses qui ont dû changer en sortant de notre thème

- **Les classes sont préfixées `mitos-`.** L'original utilisait `.field`,
  `.field__control` — des noms que Dawn et la plupart des thèmes définissent
  déjà. Sans préfixe, le thème hôte restyle nos champs et nous restylons les
  siens, et c'est l'ordre des feuilles de style qui tranche.

- **Les règles bidi voyagent avec le bloc.** Elles vivaient dans le `base.css`
  du thème. Sans elles, une vitrine arabe réordonne les chiffres latins et le
  client relit un numéro de téléphone qui n'est pas celui qu'il a tapé.

- **Les crochets sont `data-mitos-cod-*`.** Un marchand qui utilise *notre*
  thème *et* installe l'application aurait sinon deux initialiseurs sur le même
  formulaire : `theme.js` cherche `[data-cod-form]` sur chaque page.

## Vérifier

```bash
npm run test:extension
```

57 assertions sur le vrai bloc rendu : la cascade wilaya → commune, les totaux,
la validation, la clé d'idempotence, la table de l'application qui prime sur le
secours, la confirmation, l'arabe.
