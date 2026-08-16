# Souq — COD Commerce

Thème Shopify pour le commerce en paiement à la livraison, conçu pour le
marché algérien et pensé pour le téléphone d'abord.

Tout ce qui suit se règle depuis **Personnaliser** dans l'admin Shopify.
Aucune modification de code n'est nécessaire pour ouvrir une boutique.

---

## Avant d'ouvrir la boutique

Cinq réglages décident de l'allure de la boutique. Faites-les dans cet ordre.

### 1. Identité — `Personnaliser → Paramètres du thème → Identité`

| Réglage | À faire |
|---|---|
| Logo | Une image PNG ou SVG à fond transparent. |
| Texte du logo | Sert **uniquement** si aucune image n'est chargée. Remplacez `MA BOUTIQUE`. |
| Favicon | Carrée, 96×96 minimum. |

### 2. Couleurs — `Paramètres du thème → Couleurs`

Deux couleurs font tout le travail ; les autres sont des neutres que vous
pouvez laisser tels quels.

**Accent** (`#ff6d00` par défaut) — prix, boutons de commande, panneaux de
promotion. C'est la couleur qui pousse à l'achat.

> Le thème n'utilise jamais votre accent brut sur un bouton. Le blanc sur un
> orange vif ne fait que 2,8:1 de contraste, illisible en plein soleil — et
> c'est exactement la situation d'un acheteur sur téléphone. Le thème assombrit
> donc votre accent par petits pas jusqu'à dépasser 4,5:1, et s'arrête là.
> Vous obtenez la couleur la plus proche de votre choix qui reste lisible. Si
> votre accent est déjà assez foncé, il est utilisé tel quel.

**Vert de confiance** (`#0a8800` par défaut) — livraison, garanties, icônes
pleines, badges verts. Une seule valeur commande tout le vert du thème ; les
nuances claire et foncée en sont déduites automatiquement.

### 3. Paiement à la livraison — `Paramètres du thème → Paiement à la livraison`

C'est le cœur du thème. Sans ces réglages le formulaire fonctionne, mais
sans frais de livraison.

| Réglage | Ce que c'est |
|---|---|
| **URL de l'application COD** | L'adresse de votre application de commandes. Laissez vide pour tester le formulaire sans créer de commandes. |
| **Tarifs de livraison par wilaya** | JSON. Voir plus bas. |
| **Tarif par défaut** | `[domicile, stopdesk]` en dinars, pour toute wilaya absente du tableau. |
| **Suffixe de devise** | `DA` |

Format des tarifs — la clé est le **code wilaya**, la valeur `[domicile,
stopdesk]` :

```json
{
  "16": [400, 250],
  "31": [500, 300],
  "09": [500, 300],
  "06": [700, 400]
}
```

Les 58 wilayas et leurs communes sont déjà dans le thème. Vous ne listez que
les tarifs qui diffèrent de votre tarif par défaut.

### 4. Sens de lecture — `Paramètres du thème → Mise en page`

`Sens de lecture` bascule toute la boutique entre français (gauche à droite)
et arabe (droite à gauche). Les deux sont construits à partir du même code :
rien n'est à dupliquer, et aucune mise en page ne se casse en arabe.

### 5. Fiche produit (carte) — `Paramètres du thème → Fiche produit (carte)`

Ce que montre chaque produit dans les grilles. Le nombre de ventes vient du
métachamp `custom.sold_count` ; sans lui, la ligne ne s'affiche pas.

---

## La page produit

La page produit est faite de **blocs** que vous ajoutez, retirez et réordonnez
librement : `Personnaliser → Produit → Informations produit`.

| Bloc | Ce qu'il fait |
|---|---|
| Titre | Nom du produit, repliable sur téléphone |
| Prix | Prix, prix barré, étiquette d'offre |
| Classement | `#1 Meilleure vente` + fiche explicative |
| Panneau promotion | Bandeau avec compte à rebours |
| Variantes | Couleurs, tailles, guide des tailles |
| Quantité | Compteur − / + |
| Livraison | Promesse de livraison + fiche détaillée |
| Transporteurs | Yalidine, ZR Express, Algérie Poste… |
| Garanties | Deux lignes, chacune avec sa fiche |
| Pastilles | Retour, échange, remboursement |
| **Formulaire COD** | Le formulaire de commande |
| Détails du produit | Tableau de caractéristiques + fiche complète |
| Avis | Un bloc par avis |
| Média | Images de la page d'atterrissage |

Sous les blocs viennent, dans l'ordre : les détails, la page d'atterrissage
(vos images et vidéos, ou celles du produit si vous n'en avez ajouté aucune),
les produits similaires, puis les avis.

### Les fiches détaillées

Chaque ligne de promesse ouvre une fiche au toucher. **Écrivez-les.** Une
promesse que l'acheteur ne peut pas vérifier n'est qu'un slogan, et le thème
ne peut pas inventer vos délais ni vos conditions de retour à votre place.

Les textes livrés par défaut sont des exemples cohérents avec le paiement à la
livraison. Relisez-les et corrigez-les pour votre boutique avant d'ouvrir.

### La page de confirmation

Après une commande, l'acheteur doit atterrir quelque part : rien n'a été payé,
donc rien ne semble réglé. Le thème fournit cette page, mais elle demande une
manipulation de votre part, une seule fois :

1. `Boutique en ligne → Pages → Ajouter une page`, titre « Merci ».
2. Dans **Modèle de page**, choisissez `page.merci`.
3. Enregistrez, puis copiez l'adresse de la page.
4. `Personnaliser → Paramètres du thème → Paiement à la livraison → Page de
   confirmation` : collez l'adresse.

Sans cette adresse, le formulaire affiche simplement un message de réussite
sous les champs — rien n'est cassé, mais l'acheteur reste sur la fiche produit.

Le récapitulatif (référence, nom, téléphone, total) transite par la session du
navigateur, pas par l'adresse de la page : une référence et un montant dans une
URL finissent dans l'historique, dans les statistiques, et dans ce que l'acheteur
recopie à un proche. Il s'efface dès qu'il est affiché, pour qu'un rechargement
ne rejoue pas une commande déjà traitée.

### Le bandeau des avis

`Tous les avis proviennent d'achats vérifiés` est **votre déclaration**, pas
celle du thème : les avis sont des blocs que vous saisissez vous-même et rien
ici ne les a vérifiés. Ne gardez cette phrase que si elle est vraie chez vous.
Sinon, videz le champ — le bandeau disparaît.

---

## Téléphone

98 % des visiteurs sur ce marché arrivent par téléphone, et le thème est
construit dans cet ordre.

- Photo produit en plein écran depuis le haut, sans barre au-dessus
- Barre de commande fixe en bas, toujours à portée du pouce
- Bulle panier flottante, masquée quand le panier est vide
- Toutes les cibles tactiles à 44 px minimum
- Champs de saisie à 16 px : en dessous, iOS zoome tout seul à la saisie
- Formulaire de commande en fiche plein écran

Le thème est vérifié à 360, 390 et 414 px de large.

---

## Résolution de problèmes

**Le formulaire n'affiche pas de frais de livraison.**
`Tarifs de livraison par wilaya` n'est pas un JSON valide, ou `Tarif par
défaut` est vide. Le format attendu est `{"16": [400, 250]}`.

**Le logo est invisible.**
Logo clair sur en-tête clair. Chargez une version foncée ou changez la couleur
de l'en-tête dans la section En-tête.

**Des produits d'exemple apparaissent dans une grille.**
Ils ne s'affichent que dans l'éditeur de thème, jamais pour vos clients. Une
grille dont la collection est vide reste vide en boutique.

**La commande est refusée avec « Phone is invalid ».**
Le numéro doit être un mobile algérien (`05`, `06`, `07` + 8 chiffres) ou un
fixe (`02` à `04` + 7 chiffres). Le thème le convertit au format international
avant de créer la commande.

---

## Licence et support

Voir `LICENSE`. Les dépendances tierces sont listées dans
`THIRD-PARTY-NOTICES.md`.

Pour le support, ouvrez une issue sur le dépôt.
