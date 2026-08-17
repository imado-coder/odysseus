# Mise en ligne de MITOS

## Ce qui tourne aujourd'hui

Les commandes arrivent. Le formulaire du thème poste vers une fonction
déployée chez Supabase, qui enregistre le lead puis crée la commande Shopify.

| | |
|---|---|
| Base de données | Supabase `mitos-cod`, région `eu-west-3` (Paris) |
| Endpoint COD | `https://gmgargxjomtaorqjvlyz.supabase.co/functions/v1/cod` |
| Liste d'appels | `https://mitos-commandes.vercel.app` |
| API de la liste | `https://gmgargxjomtaorqjvlyz.supabase.co/functions/v1/admin` |
| Code | `supabase/functions/{cod,admin}/index.ts`, `mitos-dashboard/index.html` |
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
| Ecotrack | `Bearer`, hôte par transporteur | Haute — deux sources concordantes |
| ZR Express | en-têtes `token` (id) + `key` | Moyenne — endpoints confirmés |
| NOEST | `api_token` + `user_guid` dans le corps | Moyenne — création en deux temps |
| Maystro | `Authorization: Token …` | Moyenne — la commune est un **id**, pas un nom |
| Manuel | aucune | — |

Aucun de ces contrats ne peut être prouvé d'ici sans un compte réel. C'est
précisément à quoi sert le bouton **Tester** : le marchand relie un compte,
appuie une fois, et un adaptateur qui s'est trompé le dit tout de suite — au
lieu d'échouer en silence sur le colis d'un vrai client.

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
