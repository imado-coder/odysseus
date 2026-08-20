# Mise en ligne de MITOS

## Ce qui tourne aujourd'hui

Les commandes arrivent. Le formulaire du thème poste vers une fonction
déployée chez Supabase, qui enregistre le lead puis crée la commande Shopify.

| | |
|---|---|
| Base de données | Supabase `mitos-cod`, région `eu-west-3` (Paris) |
| Endpoint COD | `https://gmgargxjomtaorqjvlyz.supabase.co/functions/v1/cod` |
| Liste d'appels | `https://mitos-commandes.vercel.app` — **ancienne version en ligne**, voir plus bas |
| API de la liste | `https://gmgargxjomtaorqjvlyz.supabase.co/functions/v1/admin` |
| API transporteurs | `https://gmgargxjomtaorqjvlyz.supabase.co/functions/v1/carriers` |
| API installation | `https://gmgargxjomtaorqjvlyz.supabase.co/functions/v1/install` — **inerte** sans `MITOS_INSTALL_KEY` |
| Code | `supabase/functions/{cod,admin,carriers,install}/index.ts`, `mitos-dashboard/index.html` |
| Réglage du thème | `cod_endpoint`, déjà renseigné dans `config/settings_data.json` |

Paris parce que c'est la latence la plus basse depuis l'Algérie pour la base.

> Les fonctions Edge, elles, ne tournent **pas** dans la région de la base :
> elles s'exécutent au plus près de l'appelant. Mesuré — un appel depuis les
> États-Unis répond avec `x-sb-edge-region: us-east-1`. Une commande fait donc
> six requêtes entre la région du client et Paris. Pour un client algérien la
> fonction démarre en Europe et le trajet reste court, mais il n'est pas nul.
> On peut épingler la région avec l'en-tête `x-region`, si cela devient
> mesurable.

### Vérifié en direct, sur la vraie boutique

- `orderCreate` avec `financialStatus: PENDING` — la commande apparaît
  **En attente de paiement**, jamais brouillon, jamais payée
- le téléphone converti en format international : le format local est
  **refusé** par Shopify, ce qui aurait fait échouer *toutes* les commandes
- la wilaya envoyée par son **nom** (son code seul est rejeté), et répétée
  dans `address2` parce que le format d'adresse DZ de Shopify supprime la
  province de l'adresse formatée — or c'est la ligne sur laquelle le livreur
  route
- le tarif pris dans la table du marchand, pas dans la requête : 600 DA à
  domicile, 350 DA au bureau, vérifié sur les deux
- la clé d'idempotence : un double-tap ne crée pas deux commandes
- le lead écrit **avant** l'appel à Shopify, pour qu'une panne chez eux ne
  fasse pas perdre la commande
- CORS, téléphone invalide (422), boutique inconnue (404)

### Deux défauts trouvés en branchant le thème

Ils auraient cassé la production, et ne se voyaient qu'une fois les deux
moitiés reliées :

- le formulaire n'envoyait pas `shop`. L'application sert plusieurs boutiques
  depuis un seul endpoint et identifie l'appelant par ce champ — **toutes** les
  commandes seraient reparties en 404.
- sans clé d'idempotence, la clé de repli était `téléphone + articles`, sans
  aucune composante temporelle. Le même client recommandant le même produit le
  mois suivant aurait été classé « doublon » et ne serait jamais arrivé.

---

## Le formulaire dans le thème du marchand

`extensions/mitos-cod/` — une **extension de thème**, c'est-à-dire un bloc que
le marchand ajoute depuis l'éditeur de thème : **Personnaliser → Ajouter un
bloc → Applications → Formulaire COD**.

C'était le plus gros trou de l'application. Le formulaire n'existait que dans
`shopify-theme/snippets/cod-form.liquid`, à l'intérieur de *notre* thème : un
marchand qui installait l'application sur son propre thème n'obtenait rien. Le
flux n'a pas changé — c'est le portage du même formulaire et du même
`theme.js`, parce que c'est ce flux-là qui a fait passer de vraies commandes.

L'adresse de l'application est **déjà renseignée** dans le bloc, donc le cas
courant ne demande aucune saisie. Détails et réglages :
`extensions/mitos-cod/README.md`.

Trois adaptations forcées par la sortie de notre thème, toutes vérifiées :

- les classes sont préfixées `mitos-` (l'original utilisait `.field`, un nom
  que Dawn définit déjà — sans préfixe, les deux thèmes se restylent l'un
  l'autre) ;
- les règles `unicode-bidi` sont embarquées dans la feuille du bloc ; elles
  vivaient dans le `base.css` du thème et, sans elles, une vitrine arabe
  réordonne les chiffres latins d'un numéro de téléphone ;
- les crochets JS sont `data-mitos-cod-*`, pour qu'un marchand utilisant notre
  thème *et* l'application n'ait pas deux initialiseurs sur le même formulaire.

> **Déployer l'extension** demande un compte Partners lié
> (`npx shopify app deploy`). Le code est prêt et testé ; le lien Partners
> reste à faire — c'est le point 3 de l'ordre de travail.

```bash
npm run test:extension   # 57 assertions sur le bloc réellement rendu
```

Deux défauts trouvés en écrivant ces tests, tous deux corrigés :

- la clé d'idempotence était effacée **après** l'affichage de la confirmation.
  Tout ce qui aurait échoué pendant ce rendu laissait la clé sur le formulaire,
  et la commande *suivante* du même client aurait été écartée comme doublon.
  Elle est maintenant effacée dès que la commande est acceptée.
- sans adresse d'application configurée, le formulaire affichait le panneau de
  succès : on annonçait au client une commande enregistrée alors que rien
  n'avait été envoyé nulle part, et il aurait attendu un appel qui ne venait
  pas. C'est désormais un avis orange, et la saisie du client est conservée.

---

## Confidentialité — les trois webhooks obligatoires

Shopify impose `customers/data_request`, `customers/redact` et `shop/redact` à
toute application publique, et un examinateur les envoie sur une boutique de
test pour regarder ce qui a changé. Renvoyer 200 sans rien faire passe le
contrôle de livraison et rate l'examen — et surtout, c'est un mensonge fait au
client qui a demandé à être oublié.

Ils sont déclarés dans `shopify.app.toml` avec `compliance_topics` (pas
`topics` : Shopify les configure par application et non par boutique, c'est ce
qui leur permet d'arriver *après* la désinstallation). Le récepteur reste
`app/routes/webhooks.tsx` ; la logique est isolée dans
`app/lib/gdpr.server.ts` pour que `npm run test:gdpr` la fasse tourner contre
une base en mémoire — **58 assertions**.

**`customers/redact` vide la fiche, il ne la supprime pas.** `Lead` cascade
vers `CodOrder` puis vers `Shipment` : supprimer réécrirait le chiffre
d'affaires du marchand et effacerait la trace d'un colis que le transporteur a
peut-être encore en main. Le RGPD demande que la donnée personnelle disparaisse,
pas que la comptabilité soit falsifiée. Donc nom, téléphone, commune, adresse,
note, IP et user-agent sont vidés ; les montants et la wilaya restent — une
wilaya, c'est un million de personnes, elle n'identifie personne et c'est elle
qui donne encore un sens à la ligne. `Lead.redactedAt` marque le passage, sans
quoi une fiche effacée est indiscernable d'une fiche cassée dans la liste
d'appels.

**Le téléphone est la seule jointure possible**, et les deux côtés ne l'écrivent
pas pareil : `Lead` n'a pas de colonne e-mail, nous stockons `0…`, Shopify
envoie `+213…`. Comparer les chaînes brutes ne trouve rien — et ne rien trouver
ressemble exactement, vu de l'extérieur, à une suppression réussie.

**`Shipment.request` et `Shipment.response` sont nettoyés aussi.** C'est le JSON
échangé avec le transporteur : il contient le nom, le téléphone et la rue. C'est
la copie la plus facile à oublier.

**`shop/redact` supprime pour de bon**, 48 h après la désinstallation. Deux
choses ne pendent pas à `Shop` et lui survivraient : les `Session` (indexées par
domaine, elles contiennent le jeton Admin) et les secrets Vault des
transporteurs. `Carrier.credentialsRef` est le seul pointeur vers eux, donc ils
partent *avant* la ligne — sinon un jeton d'API courrier valide reste chiffré
dans `vault.secrets`, sans rien qui le référence et sans moyen de le retrouver.

> Le même trou existait dans `carriers/index.ts` : supprimer un transporteur
> laissait son secret derrière. Corrigé — la fonction lit `credentialsRef`
> avant le `DELETE`, puis supprime le secret. **Cette fonction doit être
> redéployée** pour que le correctif soit actif.

**`customers/data_request` enregistre la demande ; l'export est assemblé au
moment où le marchand l'ouvre**, dans Réglages → Confidentialité. Shopify
n'offre aucun moyen d'y répondre par API — l'application remet les données au
marchand, qui les remet au client. Stocker la réponse toute faite recopierait le
client dans une seconde table qu'une suppression ultérieure devrait retrouver.
Assemblée à la demande, une suppression arrivée entre-temps ne laisse simplement
rien à exporter, ce qui est le bon résultat.

### La migration est appliquée — et le registre a été redressé

`prisma/migrations/20260818090000_gdpr/` ajoute `Lead.redactedAt` et la table
`DataRequest`. Purement additive, donc sans danger pour les fonctions déjà en
ligne. **Appliquée le 18/08/2026** : `Lead.redactedAt` existe, `DataRequest`
existe avec ses trois index et sa clé étrangère vers `Shop` — vérifié par
`information_schema`, pas supposé.

L'avertissement qui était ici n'était pas théorique. `_prisma_migrations` ne
contenait que **quatre** lignes pour **six** migrations : celles appliquées à
la main par le connecteur n'y avaient jamais été inscrites. Au premier build
Vercel, `prisma migrate deploy` aurait rejoué `20260817160000_offer_enabled`
sur une base où les colonnes existaient déjà, et le déploiement aurait échoué
— précisément au moment où l'on croit enfin mettre l'application en ligne.

Les deux lignes manquantes ont été insérées avec le vrai `sha256` de leur
`migration.sql`. La méthode a été **prouvée d'abord** contre les quatre lignes
déjà présentes, dont les sommes calculées localement correspondaient
exactement. Une somme inventée aurait fait échouer `migrate deploy` sur un
« checksum mismatch » : le même mur, simplement déplacé.

Les six migrations sont désormais alignées, donc `prisma migrate deploy` ne
fera rien — ce qui est exactement le but.

Contrôle de non-régression après le changement de schéma : `cod` (santé et
devis 58 wilayas), `admin` (liste et rates) et `carriers` répondent tous.

## Installer une deuxième boutique — `install`

`supabase/functions/install/` — `POST /functions/v1/install`.

Pourquoi une fonction Edge et pas une route : `api.admin.bootstrap.tsx` écrit
déjà presque les mêmes lignes, mais elle vit dans l'application React Router,
qui **n'est pas déployée**. Autrement dit, le seul chemin qui met une boutique
en service n'était joignable de nulle part. Celle-ci tourne à côté de `cod`,
`admin` et `carriers`, sur une infrastructure à qui l'on n'a aucun secret à
confier : l'URL de la base est injectée par la plateforme.

### La devise est demandée, jamais supposée

La route bootstrap met `DZD` par défaut. C'est juste pour cette boutique-ci et
faux pour la suivante, et la panne est **silencieuse** : la vitrine annonce et
la commande se crée dans une devise que le marchand ne vend pas, et personne
ne le voit avant qu'un client se fasse réclamer le mauvais montant. La devise
est donc lue chez Shopify, et une installation dont le jeton ne sait pas
répondre **ne va pas plus loin**.

Cela fait aussi office de contrôle du jeton : un jeton qui ne peut pas lire
`shop` ne pourra pas créer de commande non plus. Le découvrir maintenant, avec
quelqu'un devant l'écran, coûte infiniment moins cher que de le découvrir sur
la commande d'un client. **Rien n'est écrit avant que Shopify ait répondu.**

### Ce qu'elle sème

- les **58 wilayas** (données de référence, partagées par toutes les boutiques) ;
- un transporteur **`MANUEL`** par défaut — il ne demande aucun identifiant,
  donc le marchand a un transporteur qui marche dès le premier jour et relie un
  vrai quand il a son jeton d'API ;
- la **table de livraison** (58 lignes) aux tarifs par défaut de la boutique.

Les deux derniers **seulement si la boutique n'en a aucun**. Relancer après une
rotation de jeton remplace le jeton et ne touche à rien d'autre.

### Inerte tant qu'elle n'est pas configurée

Elle répond **404** — jamais 401 — sans `MITOS_INSTALL_KEY`, avec une clé
fausse, et sur GET. C'est le seul endpoint capable de créer une boutique : un
déploiement non configuré ne signale même pas qu'il existe. Vérifié en ligne
sur les trois cas.

> Pour l'activer : ajouter le secret `MITOS_INSTALL_KEY` dans Supabase
> (Edge Functions → Secrets). Aucun redéploiement n'est nécessaire.

```bash
curl -X POST "$SUPABASE_URL/functions/v1/install" \
  -H "x-mitos-key: $MITOS_INSTALL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"shop":"la-boutique.myshopify.com","accessToken":"shpat_..."}'
```

La réponse renvoie la devise **lue** chez Shopify, ce qui a été semé, la clé de
la liste d'appels, et les étapes suivantes dans l'ordre où le marchand les fait.

### La copie des wilayas

La fonction embarque sa propre copie des 58 wilayas : une fonction Edge ne peut
pas importer `app/lib/`. Une copie, ça dérive — et ce dépôt s'est déjà fait
mordre par deux implémentations de la même chose. `npm run test:install` échoue
si cette copie s'écarte de `wilayas.server.ts`, ou si le `dz-locations.js` du
thème cesse d'être d'accord sur les codes. **C'est la seule raison pour
laquelle cette duplication est tolérée.**

---

## L'installation d'une boutique

Une boutique dont l'application a été créée **dans son propre admin** détient
déjà un token Admin API et n'a aucun parcours OAuth à faire : le token doit
simplement être écrit dans la table `Session`, la même ligne qu'OAuth aurait
écrite. C'est ce que fait `POST /api/admin/bootstrap` (action
`install-shop`), protégé par `ADMIN_KEY` et inerte tant que la variable n'est
pas définie.

Une boutique installée depuis le tableau de bord Partners passe par OAuth, et
`afterAuth` fait la même chose toute seule.

---

## La liste d'appels

`https://mitos-commandes.vercel.app` — à ouvrir sur le téléphone. À la
première visite elle demande une clé ; ensuite le navigateur la retient.

La clé de cette boutique est dans `ShopSettings.dashboardToken`. Elle ne donne
accès qu'à cette boutique : chaque requête est filtrée par `shopId`, y compris
les écritures, pour qu'un identifiant devine ne suffise pas à toucher les
commandes d'un autre marchand. Une clé fausse ou absente renvoie **404** —
l'API ne confirme même pas qu'il y a quelque chose à cette adresse. Pour la
changer, il suffit de mettre une nouvelle valeur dans la colonne.

C'est un fichier statique, et c'est volontaire : il ne contient aucun secret,
ne parle à aucune base, n'a besoin d'aucune variable d'environnement. La clé
vit dans le navigateur du marchand et voyage en en-tête `x-mitos-key`. C'est
la seule raison pour laquelle il a pu être mis en ligne sans que personne
colle un identifiant nulle part.

> Pourquoi l'interface n'est pas servie par la fonction elle-même : la
> passerelle Supabase réécrit **toute** réponse d'une Edge Function en
> `text/plain`, avec `nosniff` et `default-src 'none'; sandbox`. C'est un
> durcissement volontaire — on ne peut pas héberger de page sur une adresse
> `supabase.co`. Du HTML renvoyé de là arrive au marchand sous forme de code
> source. La fonction reste donc une API, et l'interface est ailleurs.

L'adresse de production `mitos-commandes.vercel.app` est publique. L'alias
d'équipe `mitos-commandes-patrondzds-projects.vercel.app` est, lui, derrière
l'authentification Vercel et renvoie une redirection : c'est l'adresse
courte qu'il faut donner.

---

## Ce qui reste

**La liste d'appels elle-même n'est pas à jour.** Le fichier du dépôt fait
42 ko, celui servi par Vercel 26 ko : c'est encore la version d'avant. Deux
conséquences visibles pour le marchand — le bouton d'enregistrement arabe
affiche toujours **حفط** au lieu de حفظ, et l'écran **Transporteurs** n'existe
pas en ligne, donc TREX ne peut pas être relié depuis le téléphone tant que
ceci n'est pas déployé.

Le connecteur Vercel refuse les deux cibles :

```
403 You don't have permission to create a Preview/Production Deployment
    for this Vercel project: mitos-commandes
```

Il voit le projet mais n'a pas le droit d'y déployer, et `list_projects`
revient vide : c'est une question de portée du jeton, pas de code. Il faut
soit accorder le droit de déploiement à ce jeton, soit téléverser
`mitos-dashboard/index.html` à la main. **Ne pas** le déployer sous un autre
nom de projet : l'adresse que le marchand a en favori est
`mitos-commandes.vercel.app`.

Une fois en ligne, vérifier comme la dernière fois que les octets servis sont
identiques au fichier du dépôt :

```bash
curl -s https://mitos-commandes.vercel.app | md5sum
md5sum mitos-dashboard/index.html
```

**Le tableau de bord embarqué** (`app/routes/app._index.tsx`), celui qui
s'affiche dans l'admin Shopify, n'est pas en ligne. La liste d'appels
ci-dessus fait le travail en attendant. Il a besoin de Vercel, et Vercel a
besoin de ses variables d'environnement — que le connecteur ne sait pas
écrire. Deux façons de le débloquer, l'une ou l'autre :

1. coller le bloc de variables dans Vercel → Settings → Environment Variables
   (Vercel accepte un `.env` entier d'un coup) ;
2. donner à Vercel l'accès au dépôt GitHub, ce qui permet de lier le projet —
   mais les variables restent à coller : les secrets n'ont pas leur place
   dans le dépôt.

Une fois en ligne, `SHOPIFY_APP_URL` et les trois `https://example.com` de
`shopify.app.toml` doivent pointer sur l'adresse Vercel, puis :

```bash
npx shopify app config link
npx shopify app deploy
```

> Si l'installation échoue avec **redirect_uri mismatch**, c'est que
> `application_url` et `redirect_urls` ne correspondent pas exactement à
> `SHOPIFY_APP_URL`. Une barre oblique finale de différence suffit.

**Jamais testés**, faute d'adresse publique : le parcours OAuth et
l'affichage de l'app dans le cadre de l'admin. C'est la première chose à
confirmer, et la plus susceptible de demander un ajustement.

**Les 58 wilayas et 1 541 communes** sont chargées. Les communes sont entrées
par `POST /functions/v1/admin/communes`, corps = `prisma/algeria.json`, ce qui
évite de les embarquer dans le bundle : aucun chemin de requête n'en lit une —
le thème envoie la commune en texte depuis sa propre copie — et les porter
coûterait 50 ko à chaque démarrage à froid. `npm run prisma:seed` fait la même
chose depuis une machine qui atteint la base.

---

## Les transporteurs

Un adaptateur par transporteur derrière une seule interface : créer un colis,
rendre un numéro de suivi, dire quand le statut change. Rien en dehors de
`supabase/functions/carriers/index.ts` ne sait quel transporteur une boutique
utilise.

| Transporteur | Authentification | Confiance sur le contrat |
|---|---|---|
| Yalidine | `X-API-ID` + `X-API-TOKEN` | Haute — endpoint et champs publics |
| Ecotrack | `Bearer`, hôte par transporteur | **Confirmée en direct** — voir ci-dessous |
| ZR Express | en-têtes `token` (id) + `key` | Moyenne — endpoints confirmés |
| NOEST | `api_token` + `user_guid` dans le corps | Moyenne — création en deux temps |
| Maystro | `Authorization: Token …` | Moyenne — la commune est un **id**, pas un nom |
| Manuel | aucune | — |

Aucun de ces contrats ne peut être prouvé d'ici sans un compte réel. C'est
précisément à quoi sert le bouton **Tester** : le marchand relie un compte,
appuie une fois, et un adaptateur qui s'est trompé le dit tout de suite — au
lieu d'échouer en silence sur le colis d'un vrai client.

### TREX Express passe par Ecotrack

Confirmé par le courrier d'ouverture de compte — « plateforme ECOTRACK — TREX
Express », version web `trexexpress.ecotrack.dz`. **Aucun adaptateur à
écrire** : c'est un transporteur de type `ECOTRACK` avec cette adresse.

L'adaptateur a été vérifié **avec un vrai token** contre cet hôte :

| Chemin | Réponse | Ce que cela prouve |
|---|---|---|
| `/api/v1/get/desks` | `200` | authentification par `Bearer` + token de 60 caractères |
| `/api/v1/create/order` | `422` | le serveur a listé lui-même ses champs obligatoires |
| `/api/v1/get/trackings/info` | `404` | existe, et le paramètre est `trackings[]` |

Corps vide envoyé à `create/order`, le serveur répond avec sa propre liste :
`nom_client`, `telephone`, `adresse`, `code_wilaya`, `commune`, `montant`,
`type`. **Les sept correspondent exactement** à ce que l'adaptateur envoie.

> **Un défaut trouvé grâce à ce test.** L'adaptateur interrogeait le suivi avec
> `?tracking[]=` au singulier. Le serveur veut `?trackings[]=` — le singulier
> renvoie `422` et **chaque synchronisation de statut aurait échoué**. Corrigé.
> Au passage, un colis pas encore enregistré répond `404` : c'est un « pas
> encore », pas une panne, et il est traité comme tel plutôt que d'inscrire une
> erreur à chaque passage.

Reste non vérifié : la forme de la réponse pour un suivi qui existe. Cela
demande un vrai colis, et en créer un pour le savoir coûte une vraie livraison.

> Un refus arrive en **HTML** (page de connexion), alors qu'une vraie erreur
> d'API arrive en JSON. D'où la lecture du corps en texte avant de tenter le
> parsing : un `.json()` sec jetterait la seule partie utile de l'échec le plus
> courant.

Il reste à fournir le **token API**, pris dans le tableau de bord Ecotrack —
pas le mot de passe du compte. Ce sont deux choses différentes et seule la
première fonctionne ici.

### Trois règles non négociables

- **Le colis part à la confirmation, jamais à la création.** C'est tout le
  sens du paiement à la livraison : on appelle d'abord, parce qu'une part
  importante des commandes ne survit pas à l'appel. Pousser à la création
  enverrait au transporteur chaque commande abandonnée, et chaque retour est
  payé par le marchand.
- **Un colis, une fois.** `Shipment.codOrderId` est unique en base, et la ligne
  est réservée *avant* l'appel sortant : deux appuis simultanés se heurtent à
  la base, pas au transporteur.
- **Le montant remis au transporteur inclut déjà la livraison.** Chaque
  adaptateur le lui dit explicitement (`freeshipping`, `montant`, `Total`…).
  Sans cela le transporteur ajoute son propre tarif et le client se voit
  réclamer plus que ce que la boutique a annoncé. C'est le détail le plus cher
  à rater.

### La fuite de jeton à la suppression — fermée (v2)

Supprimer un transporteur laissait son jeton d'API chiffré dans
`vault.secrets`, sans rien qui le référence : introuvable depuis n'importe quel
écran, et **toujours valide chez le transporteur**. `Carrier.credentialsRef`
est le seul pointeur vers le secret, donc il faut le lire *avant* le DELETE —
après, il n'y a plus de chemin de retour.

Prouvé de bout en bout sur la fonction en ligne, pas seulement en lisant le
code : un transporteur jetable a écrit un secret (vault 0 → 1), la suppression
a emporté la ligne *et* le secret (vault 1 → 0), sans résidu.

> `verify_jwt: false` conservé au redéploiement. L'activer couperait la vitrine
> et la liste d'appels.

### Les identifiants

Ils vont dans **Supabase Vault**, chiffrés au repos ; la table `Carrier` ne
garde que l'identifiant du secret. Aucune requête écrite plus tard pour un
écran ne peut donc sérialiser un token par accident.

### Les prix par transporteur

`ShippingRate` est désormais identifié par *(boutique, transporteur, wilaya)*.
La colonne est **nullable** et la migration purement additive : les lignes
existantes deviennent « la liste propre de la boutique », utilisée quand aucun
transporteur n'est relié ou quand le transporteur relié n'a pas tarifé cette
wilaya.

> L'index unique ne peut pas s'écrire en Prisma : Postgres considère deux
> `NULL` comme distincts, donc une contrainte ordinaire laisserait passer des
> doublons pour exactement le cas le plus courant. La migration le construit
> sur `COALESCE("carrierId", '')`.

---

## Le doublon assumé

L'endpoint existe deux fois : `app/routes/api.cod.tsx` (canonique) et
`supabase/functions/cod/index.ts` (portage Deno). Le portage existe parce
qu'il n'a besoin d'aucun secret : l'URL de la base est injectée par la
plateforme et le token Shopify est lu dans la table.

Toute modification de la validation, du calcul des prix ou de la création de
commande doit être faite **dans les deux**. Les sections du portage indiquent
le fichier avec lequel elles doivent s'accorder. Le jour où Vercel a ses
variables, le portage peut être supprimé et le thème repointé sur
`/api/cod` : rien d'autre n'en dépend.

---

## Ce qui n'a pas pu être vérifié d'ici

La liste d'appels a été vérifiée côté API, requête par requête : clé absente
et clé fausse (404), préflight CORS, lecture, filtre par statut, écriture de
statut, statut inventé (400), identifiant d'une autre boutique (404), et les
octets servis par Vercel sont identiques au fichier du dépôt.

Ce qui n'a **pas** pu l'être : la page pilotée dans un vrai navigateur. Le
conteneur où ce code a été écrit ne laisse pas Chromium passer par son proxy.
Le script est syntaxiquement valide et le balisage équilibré, mais le premier
chargement sur un téléphone reste le vrai test.
