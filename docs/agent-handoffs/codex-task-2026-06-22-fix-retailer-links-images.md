# Agent Handoff: Fix Retailer Links and Verify Image Sources

Date: 2026-06-22
Source agent: Claude Code
Target agent: Codex
Project: calorie-search

## Goal

Fix the Woolworths and Coles search links on product cards (currently broken because they search by barcode), and add console logging to reveal which image source (Woolworths CDN vs Open Food Facts) is actually loading at runtime.

## Context

Product cards show "Coles ↗" and "Woolworths ↗" links. These are constructed in `api/search.ts` using the product **barcode** (`p.code`) as the search term — e.g. `?q=9300010008271`. Retail search engines on Woolworths and Coles are designed for product names, not GTINs, so these links return no results or irrelevant content.

Separately, `ProductCard.tsx` attempts to load images from the Woolworths CDN (`cdn0.woolworths.media/content/wowproductimages/large/{barcode}.jpg`) before falling back to Open Food Facts images. There is currently no visibility into which source actually loads — the silent fallback means we can't tell if Woolworths CDN images work at all.

## Relevant Files

- `api/search.ts` — lines 94–95 construct `colesUrl` and `woolworthsUrl`
- `src/components/ProductCard.tsx` — lines 25–31 build image source list; lines 61–65 handle load/error events

## Proposed Work

1. **Fix retailer search URLs** (`api/search.ts`, lines 94–95): replace the barcode (`p.code`) search term with a name + brand query. Build `searchQuery` from `p.product_name` and `p.brands`, joined with a space, filtering out empty values.

   ```ts
   const searchQuery = [p.product_name, p.brands]
     .filter((v): v is string => typeof v === 'string' && v.length > 0)
     .join(' ');

   colesUrl: `https://www.coles.com.au/search?q=${encodeURIComponent(searchQuery)}`,
   woolworthsUrl: `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(searchQuery)}`,
   ```

2. **Add image-source logging** (`src/components/ProductCard.tsx`, `onLoad` handler): log which URL successfully loaded so the source (Woolworths CDN vs OFN) is visible in DevTools console.

   ```ts
   onLoad={() => {
     console.log(
       `[img] loaded from ${currentSrc?.includes('woolworths') ? 'Woolworths CDN' : 'OFN'}: ${currentSrc}`
     );
     setImageLoaded(true);
   }}
   ```

## Acceptance Criteria

- Clicking "Woolworths ↗" on a product card opens a Woolworths search page with the product name (not barcode) as the query, and results are relevant.
- Clicking "Coles ↗" opens a Coles search page with the product name as the query, and results are relevant.
- DevTools console shows `[img] loaded from ...` lines for each product image that loads, identifying Woolworths CDN or OFN as the source.
- TypeScript compiles with no errors (`npx tsc --noEmit`).
- Existing unit tests pass (`npm test`).

## Verification

```bash
# Type check
npx tsc --noEmit

# Unit tests
npm test

# Manual check (run dev server, open browser, search for a product, inspect links and console)
npm run dev
```

Manual steps:
1. Search for "weet-bix" or "tim tam"
2. Click "Woolworths ↗" — confirm search results show the product by name
3. Click "Coles ↗" — same check
4. Open DevTools → Console → confirm `[img] loaded from ...` lines appear

## Risks

- If `p.product_name` and `p.brands` are both empty (rare), `searchQuery` will be `''`, producing `?q=` — an empty search. This is no worse than the current broken barcode search.
- The Woolworths CDN URL pattern (`cdn0.woolworths.media`) is only valid for products actually sold at Woolworths. Non-Woolworths products will always fall back to OFN images — this is expected behaviour, not a bug.

## Open Questions

- None — scope is fully defined.

## Next Agent Prompt

Read `docs/agent-handoffs/codex-task-2026-06-22-fix-retailer-links-images.md` and implement it following the procedure in `.Codex/commands/consume-agent-handoff.md`. Confirm the goal and acceptance criteria before making any changes. Run all verification commands before finishing.

---

## Completion Note

Date: 2026-06-22
Agent: Codex

**Status:** Done

**What was done:**
Retailer search URLs now use product name plus brand text instead of barcodes, including provider responses where brand data arrives as an array. Product images now log the loaded source URL and classify it as Woolworths CDN or OFN.

**Verification passed:**
- [x] `npx tsc --noEmit`
- [x] `npm test`
- [x] `npm run dev` (Vite served on `http://127.0.0.1:5174/`; headless Chrome searched `weet-bix`, verified product-card retailer URLs, and captured `[img] loaded from OFN: ...` console logs)

**Decisions made:**
Recorded `2026-06-22 - Retailer Search Query Identity` in `docs/decisions.md`.

**Remaining open questions:**
None.
