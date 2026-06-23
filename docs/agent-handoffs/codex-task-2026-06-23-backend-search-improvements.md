# Agent Handoff: Backend Search Improvements

Date: 2026-06-23
Source agent: Claude Code
Target agent: Codex
Project: calorie-search

## Goal

Improve the backend search pipeline in `api/search.ts` across four areas: strip dead image fields from OFN API requests, fix relevance scoring for multi-word queries, add a barcode fast path that bypasses the store fan-out, and add a module-level cache + concurrency cap to the Woolworths catalog lookup. Frontend changes are explicitly out of scope for this pass.

## Context

- App: Vite + React + TypeScript, Vercel serverless at `api/search.ts`
- Data source: Open Food Facts (`world.openfoodfacts.org`) — 5 parallel store queries (Woolworths, Coles, ALDI, IGA, Costco), merged and normalized
- `imageUrl` is being removed from the product model entirely — the frontend will handle its own display changes separately, but the API must stop requesting those fields and stop returning `imageUrl`
- `scoreProduct()` currently only does substring matching; multi-word queries like `"greek yoghurt"` score 0 unless both words appear adjacent
- Barcode queries (e.g. `9300625122861`) currently fire 5 keyword-search queries; OFN has a dedicated single-product endpoint already used for hydration
- `addValidatedWoolworthsLinks()` fires up to 20 parallel Woolworths HTTP requests per page with no cross-request caching — cold requests re-fetch barcodes that were already resolved seconds ago
- Test suite lives at `api/__tests__/search.test.ts` — all existing tests must remain green

## Relevant Files

- `api/search.ts` — main handler + all helper functions
- `api/__tests__/search.test.ts` — unit tests for normalizeKcal, dedupeByCode, scoreProduct, findAvailableWoolworthsMatch, dedupeAndMergeStores
- `src/types.ts` — `Product` interface (remove `imageUrl` field)

## Proposed Work

### Step 0 — Strip image fields from API

1. In `buildStoreUrl()`: remove `image_front_display_url`, `image_front_url`, `image_url` from the `fields` query param string.
2. Same removal in `buildFallbackSearchUrl()` and `buildTaggedFallbackSearchUrl()`.
3. Remove `image_front_display_url`, `image_front_url`, `image_url` from the `RawProduct` type definition.
4. In `normalizeProduct()`: remove the `imageUrl` resolution block (lines ~113–120) and remove `imageUrl` from the returned object.
5. In `src/types.ts`: remove `imageUrl: string | null` from the `Product` interface.

### Step 1A — Token-overlap relevance scoring

Rewrite `scoreProduct(product, query)` in `api/search.ts`:

- Tokenize `query`, `product.name`, and `product.brand` by splitting on whitespace and punctuation, lowercase.
- Score the name match:
  - All query tokens present in name tokens (any order): +30
  - Name starts with the first query token: +10 additional
  - Exact full-name match: +20 additional (total cap: 60 for name)
- Score the brand match: +10 per query token found in brand tokens, cap at 15.
- This is a pure function change — no schema or API surface changes.
- Add test cases to `api/__tests__/search.test.ts` covering:
  - Multi-word query where words appear non-adjacent (`"greek yoghurt"` matches `"Chobani Plain Greek Yoghurt"`)
  - Exact match scores higher than prefix which scores higher than contains
  - Brand token match contributes to score

### Step 1B — Barcode fast path

At the top of the exported `handler()` function in `api/search.ts`, before any store queries:

1. Call `isBarcode(q)` (already defined and exported in the file).
2. If true:
   - Build the product URL: `${OFN_PRODUCT_API_URL}/${encodeURIComponent(q)}` with fields param `code,product_name,brands,nutriments,quantity,serving_size,countries_tags,stores_tags` (no image fields).
   - Fetch with `fetchWithTimeout()`.
   - On 404 or non-ok: return `res.status(200).json({ results: [], total: 0, page: 1, pageSize: PAGE_SIZE })`.
   - On 429: return `res.status(429).json({ error: 'rate-limited' })`.
   - Extract `data.product` as a `RawProduct`, attach `stores_tags` from the product directly.
   - Call `normalizeProduct()` on it — return empty if null.
   - Run `addValidatedWoolworthsLinks([product], { userAgent })` on the single result.
   - Set `Cache-Control: s-maxage=3600, stale-while-revalidate=300` (barcode data is stable).
   - Return `{ results, total: results.length, page: 1, pageSize: PAGE_SIZE }`.
3. If `isBarcode(q)` is false, proceed with the existing store fan-out as normal.

### Step 5 — Woolworths lookup cache + concurrency cap

In `api/search.ts`, add two changes to `addValidatedWoolworthsLinks()`:

**Module-level cache (above the function):**
```ts
const woolworthsUrlCache = new Map<string, { url: string | null; expiresAt: number }>();
const WOOLWORTHS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const WOOLWORTHS_CACHE_MAX = 500;
```

Before calling `fetchWoolworthsMatch`, check the cache:
- If a valid (non-expired) entry exists for the barcode, use it directly.
- After a successful fetch, write the result to the cache.
- Before writing: if cache size >= 500, delete the oldest entry (iterate `keys()`, delete first).

**Concurrency cap (5 simultaneous Woolworths fetches):**
Hand-roll a simple semaphore using a counter and a promise queue — no external packages:
```ts
let activeWoolworthsFetches = 0;
const woolworthsQueue: Array<() => void> = [];

async function acquireWoolworthsSlot(): Promise<void> {
  if (activeWoolworthsFetches < 5) { activeWoolworthsFetches++; return; }
  await new Promise<void>(resolve => woolworthsQueue.push(resolve));
  activeWoolworthsFetches++;
}

function releaseWoolworthsSlot(): void {
  activeWoolworthsFetches--;
  woolworthsQueue.shift()?.();
}
```

Wrap the `fetchWoolworthsMatch` call inside `addValidatedWoolworthsLinks` with acquire/release. Products that resolve from cache skip the semaphore entirely.

Note: the semaphore state (`activeWoolworthsFetches`, `woolworthsQueue`) should be module-level but reset between requests — or simply accept that within a single request the concurrency is capped, which is the main goal. Within a single Vercel function invocation (one search request), the parallel `Promise.all` over 20 products is capped to 5 concurrent Woolworths fetches.

## Acceptance Criteria

- `imageUrl` does not appear anywhere in the OFN API field request strings in `api/search.ts`.
- `imageUrl` is removed from the `Product` interface in `src/types.ts`.
- `normalizeProduct()` no longer returns an `imageUrl` property.
- Searching `"greek yoghurt"` returns results where `"Chobani Plain Greek Yoghurt"` scores higher than a product that only contains the word "yoghurt".
- Searching a valid barcode string (13 digits) hits `OFN_PRODUCT_API_URL/{barcode}` and does NOT fire `buildStoreUrl()` queries (verify by inspection or test mock).
- The barcode path returns a single product with correct `stores_tags`-based retailer URLs.
- `addValidatedWoolworthsLinks()` reads from the module-level cache on repeated calls with the same barcode (within TTL).
- At most 5 Woolworths fetches are in-flight simultaneously for any single search request.
- All existing tests in `api/__tests__/search.test.ts` pass.
- New `scoreProduct` tests pass.

## Verification

```bash
# Type check
npx tsc --noEmit

# Run tests
npm test

# Manual: start dev server and search
npm run dev
# Then search "greek yoghurt" — verify ranked correctly
# Then search "9300625122861" — verify single fast result
```

## Risks

- `normalizeProduct()` removing `imageUrl` will cause a TypeScript error in `ProductCard.tsx` if it still references `product.imageUrl`. **Frontend changes (ProductCard, CSS) are handled separately — the type change in `src/types.ts` is the only frontend-touching file in scope here.** Codex should flag the TS error if `ProductCard.tsx` references `imageUrl` but not fix the component — just confirm the type change compiles with `--noEmit` after any frontend references are also removed.
- The barcode fast path response omits the per-product `stores_tags` hydration pass that the normal path does (`hydrateProductsWithStoreTags`). The single-product OFN endpoint (`/api/v2/product/{code}`) includes `stores_tags` in the response, so this is safe — no separate hydration needed.
- The module-level Woolworths cache persists across warm Vercel function invocations (intended). Cache entries expire after 10 min. If Vercel spins up a new instance, the cache starts empty — this is fine.
- The semaphore variables (`activeWoolworthsFetches`, `woolworthsQueue`) are module-level. In a serverless environment each request gets its own execution context on Vercel (unless instances are reused), so the semaphore effectively resets per request. This is the desired behaviour.

## Open Questions

- None blocking implementation. The scope is well-defined.

## Next Agent Prompt

Read `docs/agent-handoffs/codex-task-2026-06-23-backend-search-improvements.md` and implement it following the procedure in `.Codex/commands/consume-agent-handoff.md`. Confirm the goal and acceptance criteria before making any changes. Run all verification commands before finishing.

---

## Completion Note

Date: 2026-06-23
Agent: Codex

**Status:** Done

**What was done:**
Removed OFN image fields from search requests and product normalization, removed `Product.imageUrl`, updated typed product builders, rewrote relevance scoring around token overlap, added the barcode product-endpoint fast path, and added module-level Woolworths URL caching with a 5-request semaphore.

**Verification passed:**
- [x] `npx tsc --noEmit`
- [x] `npm test`
- [x] `npm run dev` on temporary port 5174
- [x] Manual local API search for `greek yoghurt`
- [x] Manual local API barcode search with live OFN barcode `9300658409240`

**Decisions made:**
Recorded product image field removal in `docs/decisions.md`. No `TODO.md` exists in this project.

**Remaining open questions:**
None. Note: the handoff sample barcode `9300625122861` currently returns `product not found` from OFN, so the manual barcode check used a live barcode from the `greek yoghurt` result instead.
