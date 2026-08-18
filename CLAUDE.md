# CLAUDE.md

> The repository root is **Odysseus**, a self-hosted AI workspace. It is not
> what the `claude/shopify-store-redesign-cod-sxhasy` branch is about. If you
> are on that branch, everything below applies and the Odysseus code is not
> your concern.

## MITOS — cash-on-delivery commerce for Shopify (Algeria)

Three directories, one system:

| Path | What it is |
|---|---|
| `shopify-theme/` | The storefront theme. Mobile-first, French + Arabic, RTL. Holds the COD order form. |
| `mitos-app/` | The Shopify app: Prisma schema, embedded admin routes, and the Supabase edge functions under `supabase/functions/`. |
| `mitos-dashboard/` | One static HTML file: the merchant's call list, live on Vercel. |

**Read `mitos-app/DEPLOY.md` first.** It is the source of truth for what is
live, what is not, and why each decision was made.

## Live right now

| | |
|---|---|
| Database | Supabase project `gmgargxjomtaorqjvlyz`, region `eu-west-3` (Paris) |
| Order intake | `https://gmgargxjomtaorqjvlyz.supabase.co/functions/v1/cod` |
| Call-list API | `…/functions/v1/admin` |
| Carriers API | `…/functions/v1/carriers` |
| Call list (UI) | `https://mitos-commandes.vercel.app` — **serving an old build**, see below |

Real orders have gone through end to end — Shopify `#1008`–`#1011`, created at
`financialStatus: PENDING`.

## Supabase is fully deployed — the backlog is cleared

The Supabase connector came back and the whole Supabase side of the backlog
went out. Verified live, not assumed:

- **`admin` v4** — the `/rates` 500 is **fixed**. The conflict target now
  matches the index that actually exists, `(shopId, COALESCE(carrierId,''),
  wilayaCode)`. `POST /rates` answers `{"ok":true,"saved":58}`.
- **Migration `offer_enabled` applied** — `Offer.enabled` and
  `Offer.updatedAt` exist. This had to land *before* `cod`, which selects
  `Offer … WHERE enabled = true`; deploying `cod` first would have broken the
  storefront quote.
- **`cod` v4** — health, the 58-wilaya quote and the offers query all answer.
- **`carriers` v1** — deployed for the **first time**. All five adapters are
  listed, and a wrong key returns 404.

All three run `verify_jwt: false` and authenticate themselves (`x-mitos-key`,
or the shop domain for `cod`). Keep that flag when redeploying — flipping it on
would lock out the storefront and the call list.

## ⚠️ Still pending — both need the user

1. **The dashboard is not deployed.** `mitos-dashboard/index.html` in the repo
   is 42 kB; the copy live on Vercel is the old 26 kB one. So the live call
   list still says **حفط** instead of حفظ *and* has no carriers screen at all —
   which means the TREX carrier cannot be linked from the phone until this
   ships. The connector refuses both targets:
   `403 You don't have permission to create a Preview/Production Deployment for
   this Vercel project: mitos-commandes`. It can see the project but cannot
   deploy to it, and `list_projects` comes back empty — a token-scope problem,
   not a code one. Needs deploy rights granted, or the file uploaded by hand.
   Do **not** deploy it under a new project name: the merchant's bookmark is
   `mitos-commandes.vercel.app`.
2. **The TREX carrier does not exist yet.** Creating it requires the API token,
   which is deliberately not in this repository — see below.

Deploy is by MCP (`mcp__Supabase__deploy_edge_function`,
`mcp__Vercel__deploy_to_vercel`). Verify migration state with
`mcp__Supabase__execute_sql` rather than assuming.

## TREX Express

TREX runs on **Ecotrack**, confirmed from their account email and their own
host. No adapter to write — it is a carrier of type `ECOTRACK` with base URL
`https://trexexpress.ecotrack.dz`. The adapter was verified against that host
with a live token: `get/desks` returns 200, and an empty POST to `create/order`
made the server list its own required fields, all seven of which match what the
adapter sends.

The API token is **not in this repository**. Ask the user; it comes from
Ecotrack → API et Synchronisation → Voir Token, and it is a single 60-character
string (their UI wraps it across two lines).

## Where secrets live — none are in the repo

- **Shopify Admin token** → the `Session` table, written by OAuth or by
  `POST /api/admin/bootstrap`.
- **Carrier API keys** → Supabase Vault; `Carrier.credentialsRef` holds only
  the secret's id, so no screen query can serialise a token by accident.
- **Call-list key** → `ShopSettings.dashboardToken`; issue or rotate it from
  `/app/settings`.
- **Vercel env vars** for the embedded app → never set. This is the only reason
  `mitos-app` itself is not deployed; the connector cannot write them, and they
  do not belong in git.

## Invariants — do not change these silently

- A shipment is created **only** after `CONFIRMED`. Never for a `PENDING`
  order. One shipment per order; `Shipment.codOrderId` is unique and the row is
  claimed *before* the outbound call.
- The COD amount handed to a carrier **includes** delivery, and every adapter
  says so explicitly. Otherwise the carrier adds its own tariff and the
  customer is asked for more than the shop quoted.
- **Displayed price = charged price.** The server recomputes shipping from the
  canonical table and re-reads offers by `(shop, product, quantity)`. Anything
  arriving in a request is a suggestion.
- The lead is persisted **before** Shopify is called. A Shopify failure must
  never cost the merchant the customer.
- Every read and write is scoped by `shopId`. An id alone is never enough.
- Phone numbers are stored **local** (`0…`) and converted to `+213` only at the
  Shopify boundary — Shopify rejects the local form.
- Every input is **16px** minimum, or iOS zooms on focus and never zooms back.
- Latin digits inside Arabic text carry `unicode-bidi: plaintext`, never
  `isolate`.

## Order of work (from the user's brief)

Done: carriers · nav routes (`/app/shipping`, `/app/settings`) · Offers ·
Dashboard.

Next: **improve** the existing Orders page (tabs, search, filters, bulk
actions, export, desktop table, detail view) — improve, not replace, and it
must stay on the same canonical order data. Then Products, preferring Shopify
as the source of truth rather than copying the catalogue. Operations last, and
only once TREX's warehousing capabilities are confirmed.

Do not scaffold a new app, redesign the COD/call-centre flow, or create a
second order system.
