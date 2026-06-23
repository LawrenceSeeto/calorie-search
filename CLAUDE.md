# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Vite + React + TypeScript web app with a Vercel serverless API route. Run with `npm run dev` (requires Vercel CLI).

## Architecture

```
src/          React frontend (Vite, TypeScript strict)
api/          Vercel serverless function
api/__tests__ Vitest unit tests
```

### Data flow

1. User submits a query → `useCallback` in `App.tsx` fires `search(q)` (debounced 400ms on input, immediate on Enter/button/chip)
2. `App.tsx` calls `GET /api/search?q=<term>` with an `AbortController` signal and `currentQueryRef` race guard
3. `/api/search` fires **5 parallel store-based fetches** to `world.openfoodfacts.org/cgi/search.pl` — one per AU supermarket (Woolworths, Coles, ALDI, IGA, Costco) — merges store memberships via `dedupeAndMergeStores`, normalises to the `Product` schema, sorts by relevance score then ascending `kcalPer100g`, and returns paginated JSON. Only products found in at least one major AU supermarket are returned.
4. Frontend renders `ProductGrid` (success), `EmptyState` (idle/empty), or `SearchStatus` error block

### Why a backend proxy

The `search.openfoodfacts.org/search` endpoint (search-a-licious) lacks CORS headers so it cannot be called from the browser. The primary endpoint is now `world.openfoodfacts.org/cgi/search.pl` (v2 API) with search-a-licious as a fallback. The proxy at `/api/search` solves CORS for both and adds `Cache-Control: s-maxage=300, stale-while-revalidate=60`.

### Normalization (`api/search.ts`)

- `normalizeKcal()` — uses `energy-kcal_100g` directly; falls back to `energy_100g` (kJ) ÷ 4.184
- `dedupeByCode()` — deduplicates by `product_name|brands` (primary), falls back to barcode (still used in tests)
- `dedupeAndMergeStores()` — deduplicates across 5 store queries, accumulating store labels from all occurrences of the same product
- `normalizeProduct()` — returns `null` for products with no calorie data; sets retailer URLs from `stores_tags`
- `scoreProduct()` — relevance score used as primary sort key (exact name match > prefix > contains)
- `addValidatedWoolworthsLinks()` — upgrades Woolworths URL from search URL to direct product URL via live catalog lookup when barcode matches and `IsAvailable === true`

### Fetch strategy with fallbacks (`api/search.ts`)

1. **Primary**: 5 parallel store queries to `world.openfoodfacts.org/cgi/search.pl` with `stores_tags=<store>` + 4s timeout per query
2. **If some queries fail**: supplements with a tagged AU fallback fetch that returns `stores_tags` in the response
3. **If all 5 fail**: falls back to `search.openfoodfacts.org/search` + per-product hydration (up to 50 products) to recover store tags
4. **429 on any query**: return 429 immediately; partial 5xx → continue with successful results

### Retailer links

All 5 retailers are populated from `stores_tags` (crowdsourced OFN data) and point to search URLs:
- **Woolworths**: search URL set during normalization; `addValidatedWoolworthsLinks()` upgrades to a direct product URL when the live catalog confirms availability
- **Coles**: `https://www.coles.com.au/search?q=<term>`
- **ALDI**: `https://www.aldi.com.au/en/groceries/search/?q=<term>`
- **IGA**: `https://www.iga.com.au/?post_type=product&s=<term>`
- **Costco**: `https://www.costco.com.au/c/search?query=<term>`

### Recipe engine

- `api/recipe.ts` — Vercel serverless route that accepts a `Product[]` and generates a recipe via Google Gemini (free tier). Robust JSON parsing handles markdown-fenced responses.
- `src/lib/recipeEngine.ts` — 22 template-based recipes; used as a fallback or local generation path.

### Race-condition guard

`currentQueryRef` in `App.tsx` tracks the latest in-flight query. Responses that arrive after a newer search has started are silently dropped. `AbortController` tears down the fetch at the network layer.

## Product schema (`src/types.ts`)

```ts
interface Product {
  code, name, brand, imageUrl, kcalPer100g,
  proteinPer100g, fatPer100g, carbsPer100g,
  quantity, servingSize, servingGrams, countries,
  colesUrl, woolworthsUrl, aldiUrl, igaUrl, costcoUrl, sourceUrl
}
interface SearchResponse { results, total, page, pageSize }
```

## Calorie badge thresholds

| Class | Range |
|-------|-------|
| `cal-low` (green) | < 100 kcal/100g |
| `cal-medium` (yellow) | 100–299 kcal/100g |
| `cal-high` (red) | ≥ 300 kcal/100g |

## Components

| File | Responsibility |
|------|----------------|
| `App.tsx` | State machine, `search()` callback, layout |
| `SearchForm.tsx` | Input, debounce (400ms), button |
| `SearchChips.tsx` | Preset query chips (shown in idle state only) |
| `SearchStatus.tsx` | Spinner (loading), error message + retry button |
| `ProductGrid.tsx` | Results label + card grid |
| `ProductCard.tsx` | Individual product card with image fallback |
| `EmptyState.tsx` | Idle hint or no-results message |

## Environment variable

`CALORIE_SEARCH_USER_AGENT` — set in Vercel project settings. Sent on every upstream OFN request per their ToS.

## Deployment

Push to GitHub → import at vercel.com/new → set env var → deploy. Vercel auto-detects Vite.
