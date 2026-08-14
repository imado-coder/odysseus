# Reference spec — target behaviour for parts 1-9

Ground truth for review. Derived from the reference screenshots supplied by
the merchant. Reviewers compare the built components against this file; they
cannot see the screenshots themselves.

Deliberate deviation: brand identity is the merchant's own. The reference
belongs to a third party, so its wordmark, app name and "why choose us"
phrasing are settings, never hardcoded. Geometry, density, colour roles and
interaction are matched.

Files under review:
- `assets/base.css` — tokens, reset, primitives
- `assets/components.css` — homepage components
- `assets/header-system.css` — parts 1-5
- `assets/catalog-system.css` — parts 6-9
- `dev-preview/*.mjs` — harness only, not shipped

---

## Part 1 — Utility bar
- Full-bleed near-black strip, ~44px tall, sits above the header.
- Three items, centre-distributed, separated by 1px vertical rules that stop
  short of the strip edges.
- Each item: emoji/icon at ~19px, then a two-line text block — title 13px/700,
  subtitle 11px/400 at ~82% opacity.
- Item 1 title is green and ends with a `›` chevron. Item 2 title is cream.
  Item 3 is plain white. Per-item colour is authorable.
- Below 750px the row becomes a horizontal scroller; the page must not gain
  horizontal overflow.

## Part 2 — Main header
- Solid mid-blue bar, 72px min height, max content width 1512px, 16px gutters.
- Logo: 46px rounded square (12px radius), accent-orange fill, mark above a
  small uppercase wordmark. Must also accept an uploaded image.
- Nav: three text links (700 weight, 14px) each prefixed by an icon, then a
  "Categories" trigger rendered as a pill that fills at 20% white when open,
  with a caret that flips 180°.
- Search: white pill, 44px tall, fully rounded, black 36px circular submit
  button on the trailing edge. Max width ~560px, flexes.
- Trailing cluster: 28px avatar circle, two-line account block (11px greeting
  over 13px/800 label), a help link, a locale chip, and a cart icon carrying a
  red count bubble.
- ≤1200px nav hides; ≤900px account text and utility links hide; ≤749px search
  drops to its own full-width row and header height falls to 56px.

## Part 3 — Trust bar
- Solid green strip, ~7px vertical padding.
- Leading label with a shield icon at 13px/700.
- Trailing list of three icon+label items, 13px/500, separated by 1px rules;
  last item ends with `›`. The list scrolls horizontally when cramped.
- ≤749px the leading label hides.

## Part 4 — Promo card
- Small centred white card, ~208px min width, 6px radius.
- Two stacked uppercase lines at 15px/900; the top line is flanked by accent
  sparkle glyphs.

## Part 5 — Categories mega menu
- Overlay anchored to the header container's leading edge — never to the
  trigger button — so it cannot run past the viewport at any width.
- Two panes: a 250px scrolling category list and a content panel.
- List rows: 14px/500, 11px/18px padding, trailing chevron; hover and current
  rows take a grey fill and 700 weight.
- Panel: 16px/700 title, then a 5-column tile grid, 18px/14px gaps.
- Tile: 92px rounded-8px image that scales 1.06 on hover, optional "HOT"
  badge pinned to the image's top trailing corner, then a 12px label capped at
  ~96px width.
- Max panel height 560px with internal scroll. ≤900px collapses to one column
  and a 3-column tile grid.

## Part 6 — Category pill row
- Horizontally scrolling row of outlined pills on white.
- Pill: 52px min height, fully rounded, 1px #d4d6d8 border, 13px text that may
  wrap to two lines, centred, max width 200px.
- Current pill takes a 2px near-black border and 600 weight, with padding
  compensated so it does not shift its neighbours.
- A 34px circular next button with a drop shadow floats over the trailing
  edge, above a white gradient fade.

## Part 7 — Catalog product card
- Borderless: square image directly on the page, 8px radius, no card chrome.
- Optional "Pub" label pinned to the image's top trailing corner, dark
  translucent, small radius on its inner corner only.
- Optional video affordance: 26px translucent circle, bottom leading corner.
- Title: 13px, clamped to one line.
- Price row on a single line: deal label 13px/700 accent, price 16px/800
  accent, compare-at 12px struck grey — then a 30px circular outlined
  quick-add pushed to the trailing edge.
- Optional note line, 12px: accent for price-drop and low-stock, near-black
  for category rank. Clamped to one line.
- Rating row: near-black stars, flame glyph in accent, sold count in grey.
- Optional featured-seller badge: purple, 4px radius, 11px/600, left-aligned.
- Grid: 5 columns ≥1200px, 4 ≥900px, 3 ≥600px, 2 below.

## Part 8 — Footer
- Dark surface, four link columns, headings 14px/700, links 13px muted with
  underline on hover.
- Fourth column: app perks in a two-column list, then two store buttons
  (outlined, 8px radius, small line over a 13px/700 line), then a social row.
- Below: security certificate chips and payment chips as white rounded chips.
  Payment set must include the local methods, not only global cards.
- Bottom rule, then a centred legal row at 12px with underlined links.

## Part 9 — Load more
- Centred fully-rounded accent button, 48px tall, 44px horizontal padding,
  15px/700 label with a trailing caret.
- Busy state replaces the caret with a CSS-only spinner and sets aria-busy.

---

## Cross-cutting requirements
1. **No horizontal overflow** at 360, 390, 414, 768, 1280, 1440. Deliberate
   scrollers are allowed; the document must never scroll sideways.
2. **RTL**: the same build must serve Arabic. Physical properties
   (`left/right/margin-left/padding-right/…`) are defects; use logical ones.
   Direction-sensitive glyphs and numeric runs must not reorder wrongly.
3. **Touch targets** ≥44px for primary controls.
4. **Variants** are token overrides on the component root, keyed by
   `data-variant`. A variant must never fork markup or duplicate a rule block.
5. **Images** carry width, height and lazy loading so layout does not shift.
6. **Performance**: no external requests, no heavy animation, no duplicated
   declarations, shallow selectors.
7. **Authorability**: every user-visible string and every show/hide must be
   reachable from a Shopify setting once the Liquid is generated.
