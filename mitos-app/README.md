# MITOS — cash-on-delivery commerce for Shopify

Embedded Shopify app. The storefront theme collects the order; this app turns
it into a real Shopify order and keeps the call-and-deliver workflow Shopify
has no concept of.

## Stack

- `@shopify/shopify-app-react-router` — the current official template
- Node / TypeScript, deployed on Vercel for the MVP
- PostgreSQL on Supabase, through Prisma

Nothing here is Vercel-specific beyond the adapter: the data layer is Prisma
and the session store is Postgres, so moving to Fly.io or a VPS later is a
deployment change, not a rewrite.

## Scaffold the project

The files in this directory are the parts that are specific to MITOS. Generate
the template around them:

```bash
npm init @shopify/app@latest -- --template react-router
# choose TypeScript
```

Then copy in `prisma/schema.prisma`, `app/lib/` and `app/routes/api.cod.tsx`.

## Environment

```
DATABASE_URL=postgresql://…            # Supabase pooled connection
DIRECT_URL=postgresql://…              # Supabase direct connection, for migrations
SHOPIFY_API_KEY=…
SHOPIFY_API_SECRET=…
SHOPIFY_APP_URL=https://…
SCOPES=write_orders,read_orders,read_products,write_draft_orders
```

```bash
npx prisma migrate dev --name init
npm run dev
```

## Multi-tenancy

Every merchant-owned row carries `shopId` and every query filters on it. This
is the one rule that cannot be relaxed later: a missing filter means one
merchant reading another's orders.

Reference data — wilayas and communes — is deliberately shared and carries no
`shopId`.

## The order endpoint

`POST /api/cod` is public, because it is called by JavaScript on a customer's
phone. It therefore trusts nothing:

- the shop is identified by domain and must exist and be installed
- variant prices are read from Shopify, not from the payload
- shipping is read from the merchant's own rate table, not from the payload
- an idempotency key stops a double-tap becoming two orders

The lead is written to the database **before** the Shopify order is attempted.
If `orderCreate` fails, the merchant still has a customer to call — which is
the entire reason a cash-on-delivery funnel exists.

## Connecting the theme

In the theme editor: **Theme settings → Paiement à la livraison → URL de
l'application**, set to `https://your-app.example.com/api/cod`.

The theme already posts the payload; nothing in the theme changes.

## Before going live

- `orderCreate` needs the `write_orders` scope, and customer name, phone and
  address are protected customer data. A public app needs Shopify's approval
  for that access — request it early, it is not instant. A custom app for your
  own stores does not.
- Verify the API version pinned in `shopify.app.toml` against the current
  release before launch.
