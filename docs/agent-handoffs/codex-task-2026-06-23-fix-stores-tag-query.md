# Agent Handoff: Fix AU Supermarket Filter — Store-Based Queries

Date: 2026-06-23
Source agent: Claude Code
Target agent: Codex
Project: calorie-search

## Goal

Fix the AU supermarket filter so that searches return results again. The previous implementation produces zero results because the OFN search-a-licious API does not return `stores_tags` in search hits even when explicitly requested — so the post-fetch filter always sees empty store tags and drops every product.

## Context

**What broke and why:**

`api/search.ts` currently:
1. Fetches from OFN for `countries_tags=en:australia` and `countries_tags=en:new-zealand`
2. Calls `hasAUSupermarketTag(raw)` to filter results to AU supermarket products
3. `hasAUSupermarketTag` reads `raw.stores_tags` — but the search-a-licious API never populates this field in search hits (confirmed by Codex live testing: per-product lookups return `stores_tags` correctly; search hits do not)
4. Result: filter always returns `false` → zero products shown

**The fix — query by store instead of filtering by store:**

Instead of fetching by country and post-filtering by store, run 5 parallel store-specific queries using `stores_tags=<store>` as the OFN filter parameter. Products returned from a `stores_tags=woolworths` query are inherently Woolworths products — no response field needed. Store memberships are reconstructed by tracking which query each product came from, then merging duplicates (a product stocked at both Woolworths and Coles will appear in both queries; after dedup it carries both store labels).

**Other fixes bundled in:**
- IGA URL 404: `https://www.igashop.com.au/results?q=<term>` is wrong. Replace with `https://www.iga.com.au/search?q=<term>`
- Drop the NZ query: the NZ fetch adds zero value for an AU-supermarket-only filter

## Relevant Files

- `api/search.ts` — all logic changes here
- `api/__tests__/search.test.ts` — remove `hasAUSupermarketTag` tests, add `dedupeAndMergeStores` tests

No changes to `src/types.ts`, `src/components/ProductCard.tsx`, `api/recipe.ts`, or any other test files.

## Proposed Work

### 1. Replace `buildUrl` with `buildStoreUrl`

Delete the existing `buildUrl(q, country)` function. Add:

```ts
const STORES = ['woolworths', 'coles', 'aldi', 'iga', 'costco'] as const;
type AUStore = typeof STORES[number];

function buildStoreUrl(q: string, store: AUStore): string {
  const url = new URL(OFN_SEARCH_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('stores_tags', store);
  url.searchParams.set(
    'fields',
    'code,product_name,brands,nutriments,quantity,serving_size,countries_tags,image_front_display_url,image_front_url,image_url',
  );
  url.searchParams.set('page_size', '100');
  return url.toString();
}
```

Note: `stores_tags` is removed from the `fields` list — it's not returned by the API and is no longer needed.

### 2. Add `dedupeAndMergeStores` (exported for testing)

This replaces `dedupeByCode` in the handler. It accepts an array of `{ store, hits }` pairs, deduplicates using the same key logic as `dedupeByCode`, and accumulates store labels from all occurrences of the same product:

```ts
export function dedupeAndMergeStores(
  hitsByStore: Array<{ store: AUStore; hits: RawProduct[] }>
): Array<RawProduct & { stores_tags: string[] }> {
  const seen = new Map<string, RawProduct & { stores_tags: string[] }>();
  for (const { store, hits } of hitsByStore) {
    for (const p of hits) {
      const productKey = normalizeDedupeKey(p.product_name) + normalizeDedupeKey(p.brands);
      const key = productKey || String(p.code ?? '');
      if (seen.has(key)) {
        seen.get(key)!.stores_tags.push(store);
      } else {
        seen.set(key, { ...p, stores_tags: [store] });
      }
    }
  }
  return [...seen.values()];
}
```

### 3. Update the handler

Replace the two-country fetch with five store fetches:

```ts
const responses = await Promise.allSettled(
  STORES.map(store => fetch(buildStoreUrl(q, store), fetchOpts))
);

// 429 on any → rate-limit immediately
if (responses.some(r => r.status === 'fulfilled' && r.value.status === 429)) {
  return res.status(429).json({ error: 'rate-limited' });
}

// Partial success: include results from successful queries, skip failed ones
const hitsByStore: Array<{ store: AUStore; hits: RawProduct[] }> = [];
for (let i = 0; i < STORES.length; i++) {
  const r = responses[i];
  if (r.status === 'fulfilled' && r.value.ok) {
    hitsByStore.push({ store: STORES[i], hits: extractHits(await r.value.json()) });
  }
}

// All 5 failed → upstream error
if (hitsByStore.length === 0) {
  return res.status(502).json({ error: 'provider-unavailable' });
}

const merged = dedupeAndMergeStores(hitsByStore);
// No hasAUSupermarketTag filter needed — all results are inherently AU supermarket products

const normalized = merged
  .map(normalizeProduct)
  .filter((p): p is Product => p !== null)
  .sort((a, b) => {
    const scoreDiff = scoreProduct(b, q) - scoreProduct(a, q);
    return scoreDiff || a.kcalPer100g - b.kcalPer100g;
  });
```

### 4. Remove dead code

- Delete `hasAUSupermarketTag` (exported function)
- Delete `AU_SUPERMARKET_PATTERNS`
- The old `dedupeByCode` function can remain (it's still tested and used in tests), or delete it if it's no longer called from the handler — check first

### 5. Fix IGA URL in `normalizeProduct`

Change:
```ts
igaUrl: hasIga ? `https://www.igashop.com.au/results?q=${encodeURIComponent(searchQuery)}` : null,
```
To:
```ts
igaUrl: hasIga ? `https://www.iga.com.au/search?q=${encodeURIComponent(searchQuery)}` : null,
```

### 6. Update `api/__tests__/search.test.ts`

- Remove the `describe('hasAUSupermarketTag', ...)` block entirely
- Remove `hasAUSupermarketTag` from the import
- Add `dedupeAndMergeStores` to the import
- Add a `describe('dedupeAndMergeStores', ...)` block with at least:
  - A product appearing in one store query → `stores_tags: ['woolworths']`
  - The same product (same name+brand) appearing in two store queries → merged into one entry with `stores_tags: ['woolworths', 'coles']`
  - Two different products → two entries
- Update the IGA URL expectation in `normalizeProduct` tests to the new `iga.com.au` URL

## Acceptance Criteria

- `npm test` passes (same or more tests than before — 49 currently)
- `npx tsc --noEmit` exits clean
- `npm run dev` + searching "tim tam" returns results with Woolworths/Coles retailer chips
- `npm run dev` + searching "weetbix" returns results; Woolworths live validation still produces a direct product URL
- A product tagged in multiple stores shows multiple retailer chips
- IGA chip links open `https://www.iga.com.au/search?q=...` (no 404)
- No product appears that isn't in at least one AU supermarket

## Verification

```bash
npm test
npx tsc --noEmit
npm run dev
```

Then open `http://localhost:5173` and:
1. Search "tim tam" → results appear, Woolworths/Coles chips visible
2. Search "weetbix" → results appear
3. Click an IGA chip if one appears → opens `iga.com.au` (not a 404)
4. Confirm zero results is no longer the default outcome

## Risks

- **`stores_tags` as a filter parameter**: The OFN search-a-licious API supports `countries_tags` as a filter. `stores_tags` should work the same way (both are OFN facet fields indexed in Elasticsearch) — but this hasn't been confirmed live. If `stores_tags` is NOT a supported filter parameter, all 5 queries will return unfiltered results and the dedup/merge step will still populate `stores_tags` from query source, but won't actually filter to AU supermarkets. In that case, fall back to adding `countries_tags=en:australia` to each store query, which at minimum ensures AU products.
- **Latency**: 5 parallel queries vs. 2. Vercel has a 10s function timeout by default. All 5 queries + Woolworths live validation for the page must complete within that. Add a per-query timeout of 4s (via `AbortController`) to prevent any single store query from blocking the response.
- **`dedupeByCode` still used in tests**: If `dedupeByCode` is removed from the handler but still imported in tests, those tests will still pass. Decide: keep `dedupeByCode` exported for backward compatibility with existing tests, or update tests to use `dedupeAndMergeStores`.

## Open Questions

- If `stores_tags` is not a supported OFN search filter, should we also add `countries_tags=en:australia` to each store query as a safety net?
- Should a per-query `AbortController` timeout be added (e.g. 4s) to prevent slow store queries from blocking the response?

## Next Agent Prompt

Read `docs/agent-handoffs/codex-task-2026-06-23-fix-stores-tag-query.md` and implement it following the procedure in `.Codex/commands/consume-agent-handoff.md`. Confirm the goal and acceptance criteria before making any changes. Run all verification commands before finishing.

---

## Completion Note

Date: 2026-06-23
Agent: Codex

**Status:** Done

**What was done:**
Reworked search to use five AU supermarket store queries, added `dedupeAndMergeStores`, removed the broken `hasAUSupermarketTag` post-filter, dropped the NZ query, added AU country scoping, added 4s OFN query timeouts, added resilient tagged/hydrated fallbacks for upstream store-query failures, fixed retailer chip generation, and updated focused search tests.

**Verification passed:**
- [x] `npm test` - 49 tests passed.
- [x] `npx tsc --noEmit` - clean.
- [x] `npm run dev` - launched on `http://127.0.0.1:5176`; existing `http://127.0.0.1:5173` also served the updated app/API.
- [x] Live API search `tim tam` on `5173` and `5176` returned AU products with Woolworths/Coles chips.
- [x] Live API search `weetbix` returned AU products with Woolworths/Coles chips.
- [x] Browser smoke check on `http://127.0.0.1:5173` showed visible `tim tam` and `weetbix` result cards with retailer chips and no JavaScript console errors.
- [x] Live IGA chip check found an IGA result for `water`; the generated IGA URL returned HTTP 200.

**Decisions made:**
Recorded in `docs/decisions.md`: use the working legacy OFN JSON endpoint plus AU country safety and fallbacks because `search.openfoodfacts.org/search` ignores the proposed filters; use `https://www.iga.com.au/?post_type=product&s=<term>` because `iga.com.au/search?q=...` also returns 404 live; preserve Woolworths search chips when direct validation is unavailable.

**Remaining open questions:**
None for this handoff. One non-blocking browser resource issue remains: the app still requests `/favicon.ico`, which returns 404, but no application JavaScript console errors were observed.
