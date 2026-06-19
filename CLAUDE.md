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
3. `/api/search` fires **two parallel fetches** to `https://search.openfoodfacts.org/search` — one per country (AU, NZ) — merges + deduplicates on `code`, normalises to the `Product` schema, sorts ascending by `kcalPer100g`, and returns paginated JSON
4. Frontend renders `ProductGrid` (success), `EmptyState` (idle/empty), or `SearchStatus` error block

### Why a backend proxy

The `search.openfoodfacts.org/search` endpoint (search-a-licious) lacks CORS headers, so it cannot be called from the browser. The v2 API at `world.openfoodfacts.org` was returning 503s. The proxy at `/api/search` solves both issues and adds `Cache-Control: s-maxage=300, stale-while-revalidate=60`.

### Normalization (`api/search.ts`)

- `normalizeKcal()` — uses `energy-kcal_100g` directly; falls back to `energy_100g` (kJ) ÷ 4.184
- `dedupeByCode()` — deduplicates by `code` (barcode), falls back to `product_name|brands`
- `normalizeProduct()` — returns `null` for products with no calorie data (filtered out before sorting)

### Race-condition guard

`currentQueryRef` in `App.tsx` tracks the latest in-flight query. Responses that arrive after a newer search has started are silently dropped. `AbortController` tears down the fetch at the network layer.

## Product schema (`src/types.ts`)

```ts
interface Product {
  code, name, brand, imageUrl, kcalPer100g,
  quantity, servingSize, countries, sourceUrl
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
