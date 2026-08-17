# Mise en ligne de MITOS

## Ce qui tourne aujourd'hui

Les commandes arrivent. Le formulaire du thème poste vers une fonction
déployée chez Supabase, qui enregistre le lead puis crée la commande Shopify.

| | |
|---|---|
| Base de données | Supabase `mitos-cod`, région `eu-west-3` (Paris) |
| Endpoint COD | `https://gmgargxjomtaorqjvlyz.supabase.co/functions/v1/cod` |
| Code de la fonction | `supabase/functions/cod/index.ts` |
| Réglage du thème | `cod_endpoint`, déjà renseigné dans `config/settings_data.json` |

Paris parce que c'est la latence la plus basse depuis l'Algérie, et parce que
la fonction tourne dans la même région que la base : les six requêtes d'une
commande ne traversent pas l'Atlantique.

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

## Ce qui reste

**Le tableau de bord marchand** (`app/routes/app._index.tsx`) n'est pas en
ligne. Il a besoin de Vercel, et Vercel a besoin de ses variables
d'environnement — que le connecteur ne sait pas écrire. Deux façons de le
débloquer, l'une ou l'autre :

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

**Les 1 541 communes** ne sont pas encore chargées. Aucun chemin de requête
n'en lit une — le thème envoie la commune en texte depuis sa propre copie —
donc rien n'est cassé. `npm run prisma:seed` les charge depuis une machine
qui atteint la base.

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
