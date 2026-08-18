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
| Call list (UI) | `https://mitos-commandes.vercel.app` |

Real orders have gone through end to end — Shopify `#1008`–`#1011`, created at
`financialStatus: PENDING`.

## ⚠️ Open regression — fix this first

**`POST /functions/v1/admin/rates` returns 500.** The carriers migration
dropped the `(shopId, wilayaCode)` unique index that the *deployed* admin
function upserts on. The repo copy is already fixed; it has never been
deployed. Order intake, the storefront quote and the call list are unaffected —
only saving shipping rates.

## Written, committed, NOT deployed

The Supabase and Vercel MCP connectors were unreachable for several sessions,
so a backlog accumulated. Deploy in this order:

1. **`admin` edge function** — clears the 500 above.
2. **Migration `20260817160000_offer_enabled`** — adds `Offer.enabled` and
   `Offer.updatedAt`. (`20260817120000_carriers` is already applied.)
3. **`cod` and `carriers` edge functions.**
4. **`mitos-dashboard/index.html`** to Vercel — also ships a correction to the
   Arabic save button, which currently reads حفط instead of حفظ.
5. **Create the TREX carrier** and press Test — see below.

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
