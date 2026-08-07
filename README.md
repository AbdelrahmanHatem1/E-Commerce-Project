# ShopStream

A React storefront with a full admin panel and a visual **Site Builder** — drag-and-drop page composition, seasonal themes, and scheduled layouts, all running client-side against a public demo API.

![react](https://img.shields.io/badge/React-19-61dafb)
![vite](https://img.shields.io/badge/Vite-blueviolet)

**[Live demo →](https://e-commerce-project-abdelrahmanhatem1.vercel.app)**

---

## What it does

**For shoppers** — browse 194 products, filter and sort, quick-view, wishlist, cart, multi-step checkout, order history, returns, and a support desk with ticketing.

**For the admin** — inventory with image uploads, order and returns queues, customer management, a data-health scanner, a storage inspector, and a WordPress-style page builder that composes the storefront visually.

Everything persists to the browser. There is no backend to run.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

**Sign in as an admin** with any of the DummyJSON accounts that carry the `admin` role — for example:

| Username | Password |
|---|---|
| `emilys` | `emilyspass` |

Then visit `/admin`.

> **If a change doesn't appear, clear Vite's cache.** A hard refresh only clears the browser; Vite keeps its own cache on disk.
> ```bash
> rm -rf node_modules/.vite && npm run dev
> # Windows:  rmdir /s /q node_modules\.vite  &&  npm run dev
> ```

---

## Tech

| | |
|---|---|
| Framework | React 19 · React Router 7 |
| Build | Vite |
| UI | React-Bootstrap · Bootstrap Icons · React Icons |
| HTTP | Axios |
| Data | [DummyJSON](https://dummyjson.com) · [open.er-api.com](https://open.er-api.com) for FX rates |

<sub>Exact versions are pinned in `package.json`.</sub>

No state library. Eight React contexts cover the app's state, and persistence goes through one storage module.

---

## Routes

**Public**

```
/                    Home (built-in layout, or whatever the builder published)
/products            Catalogue — filters, sort, grid/list
/product/:id         Product detail
/categories          Department index
/p/:slug             Admin-built custom pages
/cart                Cart and saved items
/support             Help centre and ticket form
/privacy  /terms     Legal
/login  /register    Guests only
```

**Signed in**

```
/profile  /orders  /returns  /checkout  /order-confirmation
```

**Admin** (requires the `admin` role)

```
/admin              Dashboard
/admin/inventory    Products, images, stock
/admin/orders       Order queue
/admin/customers    Customer records
/admin/returns      Return requests
/admin/support      Ticket queue
/admin/builder      Site Builder
/admin/health       Data-quality scanner
/admin/storage      Storage usage and cleanup
```

---

## The Site Builder

`/admin/builder` composes the storefront out of blocks. What you drag on the canvas is rendered by the same component the shopper sees, so the preview is not a separate implementation that can drift.

### Blocks

**Storefront sections** — wrappers around the real home-page sections. They draw live store data; you control how they look and what they list, not the markup.

| Block | Default items |
|---|---|
| Featured products | 8 |
| Top categories | 4 |
| Deals of the day | 4 |
| Top rated | 4 |
| Recently viewed | 8 |
| Testimonials | 3 |
| Benefits strip | 4 |
| Newsletter | — |

Each carries a product picker: show only specific IDs, exclude IDs, a minimum rating, and an in-stock filter.

**Content blocks** — you supply the content. `hero`, `text`, `cards`, `banner`, `productRail`, `countdown`, `spacer`, `marquee`. These get the full design panel: background, section height, content width, alignment, text colour, corner radius, per-breakpoint visibility and motion.

> Storefront sections deliberately hide the size and padding controls — they bring their own container and vertical rhythm, and an outer one only fought it.

### Themes

Six palettes, each with separate light and dark values, plus an optional ambient canvas effect:

`default` · `winter` (snowfall) · `spring` (petals) · `summer` (bubbles) · `autumn` (leaves) · `midnight` (sparkles)

A theme writes CSS custom properties onto `<html>`:

```
--ss-accent  --ss-accent-soft  --ss-accent-text
--ss-surface --ss-canvas --ss-ink --ss-muted --ss-line
```

Stylesheets read them with a literal fallback — `var(--ss-surface, #ffffff)` — so the original design survives untouched when no theme is active.

### Presets

Six ready-made arrangements: Classic storefront, Black Friday, Ramadan, Minimal, Summer sale, Winter holiday. Each is a **factory**, not a frozen object, so applying one twice mints fresh block IDs instead of reusing the same objects.

### Also included

Undo/redo (40 steps, `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+S`) · device preview · WCAG contrast checker · reusable saved sections · scheduling · A/B testing with sticky buckets · JSON import/export.

---

## Branding

The logo is an inline SVG component (`src/components/Logo.jsx`), not an image file. It paints in `currentColor`, so it inherits `--ss-accent` and re-colours itself for every season and for dark mode — one asset instead of twelve exports.

```jsx
import Logo from './components/Logo.jsx';

<Logo />                        // mark + wordmark
<Logo size={48} />              // any size, one viewBox, always sharp
<Logo showText={false} />       // mark alone
<Logo animated={false} />       // no hover motion
```

The mark is a shopping bag whose left edge dissolves into three motion lines — *shop* plus *stream*. On hover the lines pull back in a stagger, and the whole thing is disabled under `prefers-reduced-motion`.

`public/favicon.svg` is a separate, filled variant: an outline mark turns to mush at 16px on a tab strip, so the favicon knocks a white bag out of a solid accent tile instead. Point `index.html` at it:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

---

## Architecture

```
src/
├── contexts/          Auth · Cart · Wishlist · Wallet · Currency
│                      Admin · Support · Layout
├── lib/
│   ├── storage.js     Every localStorage read/write, one place
│   ├── imageStore.js  IndexedDB blob store for uploads
│   ├── layoutStore.js Layout profiles + templates (IndexedDB)
│   └── migrateImages.js
├── components/
│   └── layout/        BlockRenderer · LayoutRenderer · SeasonalEffect
├── pages/
│   └── admin/builder/ Palette · Canvas · Inspector · blockTypes · themes
└── Router.jsx
```

**Provider order** (`App.jsx`):

```
Cart → Wishlist → Wallet → Admin → Support → Layout → Themed → App
```

`LayoutProvider` applies the palette, not a component further down the tree — anything lower would paint after its children had already rendered.

### How native sections survive the builder

The hand-written home-page sections are passed into `LayoutRenderer` as **slots**. The renderer decides the order and drops each real section into place. So a "Featured products" block dragged to the bottom renders the genuine carousel there, not a copy of it.

### Persistence

**localStorage** — 20 keys, all namespaced `shopstream_*`, all routed through `src/lib/storage.js`. Quota errors are caught and reported rather than crashing a render.

**IndexedDB** — `shopstream` (uploaded images as Blobs) and `shopstream-layouts` v2 (layout profiles and saved sections).

> Images are stored as Blobs rather than base64. Browsers charge localStorage in UTF-16 code units, so a 130 KB JPEG costs ~346 KB as a data URL versus 130 KB as a Blob.

### A note on the API

DummyJSON accepts `POST`, `PUT` and `DELETE` and returns a success response, but **nothing persists server-side**. Every admin change is therefore kept in a local override layer that merges over the fetched data. Deleted products stay hidden, edits stick, and created products behave like real ones — all on the device.

---

## Engineering notes

The project was built alongside a suite of regression tests, each written against a bug that actually shipped and each verified to fail when its fix is reverted. The tests are not in this repository, but the fixes and the reasoning behind them are — every non-obvious rule in the codebase carries a comment explaining what broke.

Bugs worth knowing about, because they are easy to reintroduce:

- **Vendor class collisions.** `.bi` is Bootstrap Icons' base class; styling it repainted every icon in the app as a white box.
- **The `background` shorthand.** It resets `background-size`, `-position` and `-repeat` even when it only names a colour. On an element carrying a photo that silently destroys the image sizing. The category tiles now use a real `<img>` child for exactly this reason.
- **Attribute-substring selectors.** `[style*='center']` matched any element whose inline style merely *contained* the word — a `justify-content: center` from an unrelated control was enough. Alignment keys off a real class now.
- **Effect cleanup order.** A preview that paints `<html>` and cleans up on unmount will wipe whatever the app painted there, and the app's own effect will not re-run to restore it.
- **`localStorage` quota.** A write throws when the origin is full; unguarded, that takes a render down with it. Every write goes through `src/lib/storage.js`.

---

## Conventions

**Scoped CSS.** Every page and component owns a prefix — `.pp-` products, `.pd-` detail, `.cg-` categories, `.sp-` support, `.ad-` admin, `.ssb-` builder blocks, `.insp-` inspector, and so on. A test enforces that no stylesheet reaches into another's classes or into a vendor namespace.

**Theme variables carry a fallback.** `var(--ss-surface, #ffffff)` — never the bare variable. The literal keeps the original design intact when no theme is applied.

**Longhand over shorthand for backgrounds.** `background-color` rather than `background` anywhere an element might also carry an image; the shorthand resets every sub-property it does not mention.

**Every control does something.** No decorative UI.

---

## Licence

MIT
