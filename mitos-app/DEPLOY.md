# Mise en ligne de MITOS

Tant que cette application n'est pas en ligne, **aucune commande n'est
enregistrée**. Le thème valide le formulaire et confirme au client que sa
commande est prise — mais rien ne vous parvient. C'est la seule chose qui
sépare la boutique de sa première vraie commande.

Comptez 30 minutes. Tout est gratuit à ce volume.

---

## 1. La base de données — Supabase

1. [supabase.com](https://supabase.com) → **New project**. Région : `eu-west`
   (Francfort ou Paris — la latence depuis l'Algérie y est la plus basse).
2. Notez le mot de passe généré, il n'est plus affiché ensuite.
3. **Project settings → Database → Connection string → URI**.

Vous avez besoin de **deux** adresses, et la différence compte :

| Variable | Port | Pourquoi |
|---|---|---|
| `DATABASE_URL` | `6543` | Les fonctions serverless ouvrent et ferment des connexions sans arrêt et épuisent la limite de Postgres. Le pooler absorbe ça. Ajoutez `?pgbouncer=true&connection_limit=1`. |
| `DIRECT_URL` | `5432` | Les migrations ne peuvent pas passer par un pooler : elles ont besoin d'une session, pas d'une transaction. |

---

## 2. L'application — Vercel

```bash
cd mitos-app
npx vercel            # première fois : liez le projet
npx vercel --prod
```

Vercel vous donne une adresse du type `https://mitos-cod.vercel.app`.
C'est elle qui va partout ensuite.

**Variables d'environnement** (Vercel → Settings → Environment Variables) —
la liste exacte est dans `.env.example` :

```
SHOPIFY_API_KEY        depuis le tableau de bord Partners
SHOPIFY_API_SECRET     idem
SHOPIFY_APP_URL        https://mitos-cod.vercel.app
SCOPES                 write_orders,read_orders,read_products
DATABASE_URL           l'adresse port 6543
DIRECT_URL             l'adresse port 5432
```

Redéployez après les avoir ajoutées : Vercel ne les injecte pas
rétroactivement dans un build déjà fait.

---

## 3. Relier l'application à Shopify

Dans `shopify.app.toml`, remplacez les trois `https://example.com` par votre
adresse Vercel, puis :

```bash
npx shopify app config link     # écrit le client_id
npx shopify app deploy          # enregistre les URLs chez Shopify
```

Puis installez-la sur la boutique depuis le tableau de bord Partners.

> Si l'installation échoue avec **redirect_uri mismatch**, c'est que
> `application_url` et `redirect_urls` dans `shopify.app.toml` ne
> correspondent pas exactement à `SHOPIFY_APP_URL`. Une barre oblique finale
> de différence suffit.

---

## 4. Brancher le thème

`Personnaliser → Paramètres du thème → Paiement à la livraison →
URL de l'application COD` :

```
https://mitos-cod.vercel.app/api/cod
```

Passez une commande de test sur la boutique. Elle doit apparaître dans
**Shopify → Commandes**, au statut **En attente de paiement** — jamais comme
brouillon, et jamais payée : le client paiera le livreur.

---

## Ce qui est déjà vérifié, et ce qui ne l'est pas

**Vérifié en direct contre l'API Shopify**, sur une vraie boutique :

- `orderCreate` avec `financialStatus: PENDING`
- le téléphone converti en format international — le format local est
  **refusé** par Shopify, ce qui aurait fait échouer *toutes* les commandes
- la wilaya envoyée par son **nom** : son code seul est rejeté
- l'enregistrement du lead **avant** tout appel à Shopify, pour qu'une panne
  chez eux ne fasse pas perdre la commande
- 63 contrôles de validation, et le typage complet du projet

**Jamais testé**, parce qu'il faut une adresse publique et que
l'environnement où ce code a été écrit n'y a pas accès :

- le parcours OAuth d'installation
- l'affichage de l'app dans le cadre de l'admin Shopify

C'est la première chose à confirmer une fois l'application en ligne, et c'est
aussi la plus susceptible de demander un ajustement.
