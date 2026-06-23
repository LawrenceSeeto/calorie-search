# Agent Handoff: Strict ANZ-only Product Filtering

Date: 2026-06-22
Source agent: Claude Code
Target agent: Codex
Project: calorie-search

## Goal

Add a post-normalization filter in the `/api/search` handler so that only products verifiably tagged as Australia or New Zealand are returned, regardless of what the upstream Open Food Facts search-a-licious API lets through.

## Context

The API already queries Open Food Facts with `countries_tags=en:australia` and `countries_tags=en:new-zealand` at the search layer (`buildUrl()` in `api/search.ts`). However, the search-a-licious backend treats this as a soft preference — some results slip through with neither tag. There is no post-normalization guard today.

`normalizeProduct()` already populates `product.countries` from `countries_tags` (line 134 of `api/search.ts`), so the field is always available on every `Product` object. No schema changes are needed.

## Relevant Files

- `api/search.ts` — the only file that needs to change

## Proposed Work

1. Add an `isANZProduct` helper function after `scoreProduct` (~line 258 of `api/search.ts`):

```ts
const ANZ_TAGS = new Set(['en:australia', 'en:new-zealand']);

function isANZProduct(product: Product): boolean {
  return product.countries.some(tag => ANZ_TAGS.has(tag));
}
```

2. In the handler's normalization pipeline (~line 310), add `.filter(isANZProduct)` after the existing null filter:

```ts
const normalized = merged
  .map(normalizeProduct)
  .filter((p): p is Product => p !== null)
  .filter(isANZProduct)   // ← new line
  .sort((a, b) => {
    const scoreDiff = scoreProduct(b, q) - scoreProduct(a, q);
    return scoreDiff || a.kcalPer100g - b.kcalPer100g;
  });
```

## Acceptance Criteria

- Products with no `en:australia` or `en:new-zealand` entry in `countries` are excluded from the response.
- Products that do have either tag are still returned.
- TypeScript compiles without errors.
- Existing tests pass.

## Verification

```bash
npx tsc --noEmit
npm test
```

Manual check: start the dev server (`npm run dev`), search for a generic term (e.g. "milk"), open DevTools → Network → `/api/search` response, confirm every result's `countries` array contains `en:australia` or `en:new-zealand`.

## Risks

- Could reduce result count noticeably for queries where many matching products lack ANZ tags. This is the intended behaviour — fewer but more correct results.
- If OFN's `countries_tags` data is sparse for a product category, users may see empty results for valid ANZ products not yet tagged upstream. Nothing to fix here; it's a data quality issue on OFN's side.

## Open Questions

- None. The approach was designed and confirmed by Claude Code before handoff.

## Next Agent Prompt

Read `docs/agent-handoffs/codex-task-2026-06-22-strict-anz-filter.md` and implement it following the procedure in `.Codex/commands/consume-agent-handoff.md`. Confirm the goal and acceptance criteria before making any changes. Run all verification commands before finishing.

---

## Completion Note

Date: 2026-06-22
Agent: Codex

**Status:** Done

**What was done:**
Added a strict post-normalization ANZ country-tag filter to `/api/search` so only products with `en:australia` or `en:new-zealand` in `countries` are returned.

**Verification passed:**
- [x] `npx tsc --noEmit`
- [x] `npm test`
- [x] Manual dev-server check: `GET /api/search?q=milk` returned 4 results with `BAD_COUNT=0`.

**Decisions made:**
Recorded the strict ANZ search result behavior in `docs/decisions.md`.

**Remaining open questions:**
None.
