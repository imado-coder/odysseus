# CLAUDE.md

> The repository root is **Odysseus**, a self-hosted AI workspace. It is not
> what the `claude/shopify-store-redesign-cod-sxhasy` branch is about. If you
> are on that branch, everything below applies and the Odysseus code is not
> your concern.

## MITOS — cash-on-delivery commerce for Shopify (Algeria)

Three directories, one system:

| Path | What it is |
|---|---|
| `shopify-theme/` | The storefront theme — **a product, sold with the app**, not a demo. Mobile-first, French + Arabic, RTL. |
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
| Install API | `…/functions/v1/install` — **inert** until `MITOS_INSTALL_KEY` is set |
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
- **`carriers` v2** — all five adapters listed, a wrong key returns 404, and
  the Vault leak on delete is **closed**. Deleting a carrier used to leave its
  API token encrypted in `vault.secrets` with nothing pointing at it —
  unreachable by any screen and still valid at the courier, because
  `Carrier.credentialsRef` is the only pointer. v2 reads the ref before the
  DELETE and removes the secret after. Proved end to end against the live
  function: a throwaway carrier wrote one secret, the delete took the row *and*
  the secret, and the vault went back to 0.

All four run `verify_jwt: false` and authenticate themselves (`x-mitos-key`
for `admin`/`carriers`, `MITOS_INSTALL_KEY` for `install`, the shop domain for
`cod`). Keep that flag when redeploying — flipping it on would lock out the
storefront and the call list.

## ⚠️ Still pending — all three need the user

1. **The dashboard is still not deployed.** `mitos-dashboard/index.html` is
   42,635 bytes; the copy on `mitos-commandes.vercel.app` is still the old
   26,725-byte build. Confirmed live again on 2026-08-18: the Arabic save
   button reads **حفط** where the repo has حفظ, and `tabCarriers` appears
   **0** times in the served page against 4 in the repo — so the carriers
   screen does not exist for the merchant, which is what blocks linking TREX
   from a phone.

   The Vercel connector refuses both targets, unchanged:
   `403 You don't have permission to create a Preview Deployment for this
   Vercel project: mitos-commandes`, and `list_projects` returns an empty
   array for team `patrondzds-projects`. The token can resolve the project by
   name but holds no deploy scope on it. This is a permissions problem, not a
   code one. Grant that token deploy rights, or upload the file by hand.
   Do **not** deploy under a second project name — the merchant's bookmark is
   `mitos-commandes.vercel.app`.

2. **No Partners app exists.** `shopify.app.toml` still has no `client_id`
   (the only mention is the comment saying `shopify app config link` fills it
   in), and `application_url` is still `https://example.com`. Creating it
   means signing in to partners.shopify.com — a human action.

3. **The TREX carrier does not exist yet.** Creating it requires the API token,
   which is deliberately not in this repository — see below.

Deploy is by MCP (`deploy_edge_function`, `deploy_to_vercel`). Verify migration
state with `execute_sql` rather than assuming.

### The migration ledger is now consistent

`_prisma_migrations` had **four** rows for **six** migrations — the earlier
hand-applied ones were never recorded. `vercel-build` runs
`prisma migrate deploy`, so the first Vercel build would have tried to replay
`20260817160000_offer_enabled` against a database that already had the columns,
and failed. Both missing rows were inserted with the real sha256 of their
`migration.sql` (the method was proved first against the four rows already
there, which matched byte for byte). All six now line up, so
`prisma migrate deploy` is a no-op rather than a failure waiting for item 3.

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

## What the merchant is buying

**The theme and the COD form ship together, and both come from the app.** A
merchant installs MITOS, pays the subscription, and gets the storefront *and*
the order form — not the form alone. This was misread once already, and the
misreading is what produced two separate implementations of the same form; do
not repeat it.

The theme is not going to the Shopify Theme Store, and cannot: the Theme Store
sells for a one-time price, not a subscription, and it refuses a theme that
depends on an app to work — ours depends on the MITOS server to quote shipping
and record an order. The distribution path is **the app installs the theme**
through the Admin API, which is allowed and is what makes the subscription the
thing being paid for.

Two consequences:

- **`write_themes` will be needed.** Scopes are `write_orders,read_orders,
  read_products` today. Adding it widens what App Store review will ask about,
  so add it when the install path is actually built, not before.
- **Install, never publish.** The app uploads the theme unpublished; the
  merchant previews it and publishes it themselves. An app that overwrites the
  live theme of a store that is currently selling is a disaster, and review
  rejects it.

### One form, two homes

`shopify-theme/snippets/cod-form.liquid` (+ its half of `theme.js`) and
`mitos-app/extensions/mitos-cod/` are today two independent implementations of
the same form. Both are wanted — the merchant who takes our theme and the
merchant who keeps their own must both get a working form — but they must stop
being two codebases, or a fix will land in one and not the other and the gap
will be found by a merchant, not by us.

The direction: **the App Block is the implementation**, and the theme consumes
it. `sections/main-product.liquid` now accepts `@app` blocks, which is the
prerequisite. What is *not* done, on purpose: the theme's own `cod_form` block
is still there and still wired into `templates/product.json`. It is the form
carrying real orders right now, and it does not come out until the App Block
has been proven on the dev store — which needs the Partners app, item 3.

## Where this is going

The decision (2026-08-18): finish MITOS as a **custom / unlisted Shopify app**
first, install it on real stores one at a time, keep iterating on it, and
submit to the Shopify App Store later. Nothing here is throwaway — every item
below is required for the App Store too, so building them now shortens that
submission rather than duplicating it.

The store currently connected (`test-test-1234123412341296`) is a **development
store**. It is where things get proven. The merchant's real store comes after.

What an App Store submission would still need today, from the audit:

1. ~~**No Theme App Extension.**~~ **Closed** — `mitos-app/extensions/mitos-cod/`
   carries the COD form as an App Block, so a merchant installing the app on
   their own theme now gets the form. Written and tested; still to be deployed
   with the Partners link.
2. **Protected customer data.** Name, phone and address are protected. A public
   app needs Shopify's review; a custom app does not. Scopes in
   `shopify.app.toml` are already minimal (`write_orders,read_orders,read_products`)
   — keep them that way.
3. ~~**Two of three mandatory GDPR webhooks are missing.**~~ **Closed** — all
   three are declared with `compliance_topics` in `shopify.app.toml` and do
   real work, not a 200.
4. **Credentials are a custom app's, not a Partners app's.** OAuth install does
   not exist yet; the token lives in `Session` because it was pasted there.

## Order of work

Done: carriers · nav routes (`/app/shipping`, `/app/settings`) · Offers ·
Dashboard · **Theme App Extension** · **GDPR webhooks** · **`install`**.

1. ~~**Theme App Extension**~~ — **built**, in `mitos-app/extensions/mitos-cod/`.
   An App Block a merchant adds from the theme editor. The flow is the port,
   not a rewrite: it still sends `shop`, still mints one idempotency key per
   order, still quotes through `/cod?shop=…&product=…`. The endpoint is a block
   setting (a merchant's theme has no `settings.cod_endpoint`) and ships
   pre-filled. `npm run test:extension` runs 57 assertions against the real
   rendered block. Not deployed yet — `npx shopify app deploy` needs the
   Partners link, which is item 3.

   Three things had to change on the way out of our theme, and they are the
   things to preserve if this is ever touched: classes are prefixed `mitos-`
   (`.field` collides with Dawn), the `unicode-bidi` rules travel in the
   block's own stylesheet (they lived in the theme's `base.css`, and without
   them Arabic reorders a phone number), and the JS hooks are
   `data-mitos-cod-*` so our own theme's `theme.js` cannot double-bind the
   same form.
2. ~~**The three GDPR webhooks**~~ — **built and tested**, undeployed for the
   same reason as item 1. Logic in `mitos-app/app/lib/gdpr.server.ts`, kept out
   of the route so `npm run test:gdpr` can drive all three against an in-memory
   database: 58 assertions.

   Three decisions worth not undoing. **`customers/redact` empties the lead
   and does not delete it** — `Lead` cascades to `CodOrder` and to `Shipment`,
   so deleting would rewrite the merchant's revenue and erase the record of a
   parcel a carrier may still hold. Personal fields go, amounts and wilaya
   stay, `Lead.redactedAt` marks it so the call list shows an erasure rather
   than what looks like a broken row. **Phone is the only join that can work**
   — `Lead` has no email, we store `0…`, Shopify sends `+213…`, and matching
   raw finds nothing, which is indistinguishable from a redaction that worked.
   **`Shipment.request`/`response` are scrubbed too**; they hold the JSON
   posted to the courier, name and street included, and are the copy that is
   easiest to miss. `shop/redact` deletes for real, and deletes the carriers'
   Vault secrets first — `credentialsRef` is the only pointer to them.

   `customers/data_request` records the request and Réglages assembles the
   export on demand. Storing the assembled answer would copy the shopper into a
   second table that a later redaction would have to find again.
3. **Partners app + deploy `mitos-app`** — this is what unlocks OAuth. Needs
   the env vars set once in Vercel (they cannot be committed, and a previous
   attempt to put them in `vercel.json` was correctly refused).
4. ~~**`install` edge function**~~ — **built and deployed**, in
   `mitos-app/supabase/functions/install/`. It runs beside `cod`/`admin`/
   `carriers` precisely because the equivalent route
   (`api.admin.bootstrap.tsx`) lives in the undeployed app, so the one path
   that onboards a store was unreachable from anywhere.

   **The currency is read from Shopify, never defaulted** — the bootstrap
   route defaults it to `DZD`, which is right for this shop and wrong for the
   next one, and the failure is silent until a customer is asked for the wrong
   amount. Asking Shopify doubles as the token check: a token that cannot read
   `shop` cannot create an order either, and nothing is written until it
   answers. It seeds the 58 wilayas, a `MANUAL` default carrier (no
   credentials, so every merchant has a working one on day one), and the
   58-row shipping table from the shop's own defaults — the last two only when
   the shop has none, so a re-run after a token rotation touches nothing else.

   It is **inert until `MITOS_INSTALL_KEY` is set** as a Supabase secret, and
   answers 404 — never 401 — to a missing or wrong key, because this is the
   one endpoint that can create a store. Verified live: 404 with no key, with
   a wrong key, and on GET.

   It carries its own copy of the 58 wilayas (an edge function cannot import
   `app/lib/`). `npm run test:install` fails if that copy ever drifts from
   `wilayas.server.ts`, or if the theme's `dz-locations.js` stops agreeing on
   the codes — that test is the only reason the duplication is allowed.
5. **Billing (`appSubscriptionCreate`)** — nothing charges anyone today. The
   `Subscription` model exists and not one line writes it. Shopify requires app
   payments to run through its Billing API, so there is no monthly plan without
   this and no listing either. Not needed for the first trial stores, which are
   the merchant's own — but every screen built before it must not assume every
   shop is entitled.
6. **Collapse the two COD forms into one** — the theme renders the App Block
   instead of its own snippet, and `snippets/cod-form.liquid` plus its part of
   `theme.js` come out. Only after the App Block works on the dev store; the
   theme's copy is what is taking orders until then.
7. **Install the theme from the app** — `write_themes`, `themeCreate` from a
   released zip, uploaded **unpublished**. The hard part is not the first
   install but the second: once a merchant has set their colours and rewritten
   their text, a new version cannot overwrite `settings_data.json` and the JSON
   templates. It goes in beside the old one and the merchant switches.
8. ~~**Prove the theme against a catalogue that is not ours**~~ — **audited**,
   four real defects found and fixed. Shopify's own `theme-check` now reports
   **zero errors** (`npx @shopify/theme-check-node`), and the four cases named
   here were each walked by hand, because a linter does not know what data a
   shop has.

   **A product with no image showed nothing on a phone.** The placeholder lives
   in the desktop stage, and `.gallery__stage` is `display:none` below 990px;
   the phone slider was wrapped in `if media_count > 0`. The same guard also
   held the floating back/search/cart buttons — the whole of that page's
   navigation on a phone — so an imageless product lost its way out as well as
   its photo. Slider and controls now always render; a missing photo gets the
   placeholder, styled to fill the slide (it is an `<svg>`, so the `img` rule
   never reached it).

   **An empty collection served the whole catalogue.** The `collections.all`
   fallback exists so an unconfigured *home page* is not blank, but it was also
   reaching the collection page: a merchant with an empty "Manteaux d'hiver"
   would have shown every product they sell under that heading, pill still
   reading "Manteaux d'hiver". The fallback is now confined to the teaser path,
   and a real empty collection says so and offers a way to all products.

   **Five hundred products meant fifty.** `collection.products` stops at 50
   without a `paginate` tag and the theme had none anywhere — 450 products with
   no link, no page two, nothing. The load-more button had been designed and
   styled (`catalog-system.css`, part 9) and never built. The collection page
   now paginates and renders it as a plain `<a>` to the next page: it works
   before JavaScript arrives, and page three is a real URL a search engine can
   land on.

   **The add-to-cart form did not parse.** `{% form 'product', product, id:
   'AddToCart-' | append: section.id %}` — a filter cannot be applied to a tag
   argument, so Liquid failed the whole tag. Unnoticed because orders come
   through the COD form, not the cart. The id is assigned first now.

   Also fixed: a `"//"` pseudo-comment inside the `@app` block's section schema.
   Section schemas are strict JSON, Shopify rejects the property, and a rejected
   schema is a section the theme editor will not load — the `@app` block would
   never have appeared, and item 6 would have been debugged in the extension.

   Not done, and deliberate: `product.has_only_default_variant` is already
   guarded at all three call sites, so a product with no options was correct
   before this pass.
9. **Deploy `mitos-dashboard/index.html`** (blocked: Vercel returns 403 on
   `mitos-commandes` — the token can read the project but not deploy to it).
   The repo copy carries the حفظ fix and the carriers tab; neither is live.
   Then link TREX (`ECOTRACK`, `https://trexexpress.ecotrack.dz`) and press
   Test.

Then, from the original brief and still outstanding: **improve** the existing
Orders page (tabs, search, filters, bulk actions, export, desktop table, detail
view) — improve, not replace, on the same canonical order data. Then Products,
preferring Shopify as the source of truth over copying the catalogue.
Operations last, and only once TREX's warehousing capabilities are confirmed.

Do not scaffold a new app, redesign the COD/call-centre flow, or create a
second order system.
