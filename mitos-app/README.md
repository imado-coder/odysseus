# MITOS — cash-on-delivery commerce for Shopify

Embedded Shopify app. The storefront theme collects the order; this app turns
it into a real Shopify order and keeps the call-and-deliver workflow Shopify
has no concept of.

## Stack

- `@shopify/shopify-app-react-router` v2 — the current official template
- React Router v7, Node / TypeScript
- Polaris **web components** (`s-*`), loaded from Shopify's CDN by
  `AppProvider`. Polaris React is deprecated and deliberately not a dependency.
- PostgreSQL through Prisma — Supabase in the MVP

Nothing here is Vercel-specific beyond the adapter: the data layer is Prisma
and the session store is Postgres, so moving to Fly.io or a VPS later is a
deployment change, not a rewrite.

## Environment

```
DATABASE_URL=postgresql://…            # pooled connection
DIRECT_URL=postgresql://…              # direct connection, for migrations
SHOPIFY_API_KEY=…
SHOPIFY_API_SECRET=…
SHOPIFY_APP_URL=https://…
SCOPES=write_orders,read_orders,read_products
```

The scopes are exactly what the three GraphQL operations need — `orderCreate`
requires `write_orders` and `read_orders`, the variant price lookup requires
`read_products`. Nothing else is requested.

## Running it

```bash
npm install
npx prisma migrate deploy     # or `migrate dev` on a fresh database
npx prisma db seed            # 58 wilayas, 1,541 communes
npm run dev                   # shopify app dev
```

`npm run typecheck` runs `react-router typegen` first, so route types exist
before `tsc` sees them.

## Verification

```bash
npm run verify
```

Runs 58 checks against a real Postgres with a stubbed Shopify client: payload
validation, phone normalisation, the exact `orderCreate` variables, tenant
isolation, the idempotency constraint, and uninstall behaviour. The Shopify
client is stubbed because the payload it receives is the thing worth asserting
on; everything below that boundary runs for real.

The three GraphQL operations are also validated against Shopify's published
Admin schema rather than written from memory.

## Multi-tenancy

Every merchant-owned row carries `shopId` and every query filters on it. This
is the one rule that cannot be relaxed later: a missing filter means one
merchant reading another's orders. The dashboard's status write is scoped by
`shopId` *and* `id`, so a guessed id from another store updates nothing.

Reference data — wilayas and communes — is deliberately shared and carries no
`shopId`.

## The order endpoint

`POST /api/cod` is public, because it is called by JavaScript on a customer's
phone. It therefore trusts nothing:

- the shop is identified by domain and must exist and be installed
- variant prices are read from Shopify, not from the payload
- shipping is read from the merchant's own rate table, not from the payload
- an idempotency key stops a double-tap becoming two orders
- every response, including errors, is JSON with CORS headers, so the
  storefront can always read what happened

**The lead is written before anything touches Shopify.** If the token is
revoked, the session row is missing, or Shopify is simply down, the customer's
details are still saved, the order is flagged `createFailed` with the reason,
and the merchant sees it in the dashboard as a call to make. Losing a sale to
an API error is the one outcome this endpoint exists to prevent.

When Shopify could not be reached to price the variants, the lead is stored
with `pricesVerified = false` and the dashboard marks the total **À confirmer** —
the amount came from the storefront and has not been checked.

### Phone numbers

Algerian numbering: mobiles are `0` + `5|6|7` + 8 digits, landlines `0` +
`2|3|4` + 7 digits. `+213`, `00213`, spaces, dots and dashes are all folded to
the local form before validation, because customers type all of them.

### Province codes

Shopify wants `provinceCode` (`province` is deprecated), but only accepts codes
for countries whose subdivisions it carries. The wilaya code is sent first; if
Shopify rejects it, the request is retried once with the wilaya's name. Either
way the merchant gets the order.

## Connecting the theme

In the theme editor: **Theme settings → Paiement à la livraison → URL de
l'application**, set to `https://your-app.example.com/api/cod`.

The theme already posts the payload; nothing in the theme changes.

## Before going live

- Customer name, phone and address are protected customer data. A public app
  needs Shopify's approval for that access — request it early, it is not
  instant. A custom app for your own stores does not.
- Verify the API version pinned in `shopify.app.toml` against the current
  release before launch.
- **Nothing here has run inside a real Shopify store yet.** The schema,
  endpoint, validation and order payload are all verified locally and against
  the published Admin schema, but the OAuth handshake, the embedded frame and a
  live `orderCreate` can only be proven by installing on a development store.

## Layout

| Piece | File |
|---|---|
| Data model | `prisma/schema.prisma` |
| Reference data seed | `prisma/seed.ts` |
| Verification suite | `prisma/verify.ts` |
| App config, install hook | `app/shopify.server.ts` |
| Prisma client | `app/db.server.ts` |
| Route table | `app/routes.ts` |
| Document shell | `app/root.tsx`, `app/entry.server.tsx` |
| Install / login screen | `app/routes/_index.tsx` |
| OAuth catch-all | `app/routes/auth.$.tsx` |
| Embedded layout | `app/routes/app.tsx` |
| Orders dashboard | `app/routes/app._index.tsx` |
| Uninstall webhook | `app/routes/webhooks.tsx` |
| Public order endpoint | `app/routes/api.cod.tsx` |
| Order creation | `app/lib/order.server.ts` |
| Payload validation | `app/lib/validate.server.ts` |

Installation creates the shop, its settings and a shipping rate for all 58
wilayas, so the merchant edits numbers instead of facing an empty table.

## Still to build

- Shipping rates editor (`/app/shipping` is linked in the nav, not yet written)
- Settings screen (`/app/settings`, same)
- Offer builder
- Billing through the Shopify Billing API
- Analytics
