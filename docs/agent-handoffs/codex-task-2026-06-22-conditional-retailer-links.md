# Agent Handoff: Conditional Woolworths/Coles Retailer Links

Date: 2026-06-22
Source agent: Claude Code
Target agent: Codex
Project: calorie-search

## Goal

Only show Woolworths and Coles retailer links on a product card when Open Food Facts data confirms the product is stocked at that retailer, using the `stores_tags` field already available in the OFN search-a-licious API response.

## Context

Every `ProductCard` currently renders both "Coles ↗" and "Woolworths ↗" links unconditionally. These links point to retailer search pages (not direct product pages). The problem: products that are NZ-only, European imports, etc. still show both AU retailer links, leading users to dead search results.

Open Food Facts returns a `stores_tags` array for each product (e.g. `["woolworths", "coles", "aldi"]`) but we are not currently requesting or using that field. The fix is to request `stores_tags` from the API, check it during normalization, and only set a retailer URL when the tag is present. Both URL fields become nullable (`string | null`) and the frontend renders them conditionally.

**Known caveat:** OFN `stores_tags` is crowdsourced, so some stocked products may lack the tag and will silently lose the link. This is the accepted tradeoff — a missing link is preferable to a link that returns zero results.

## Relevant Files

- `api/search.ts` — `RawProduct` type, `buildUrl()`, `normalizeProduct()`
- `src/types.ts` — `Product` interface (`colesUrl`, `woolworthsUrl`)
- `src/components/ProductCard.tsx` — renders the `.retailer-links` div
- `api/__tests__/search.test.ts` — unit tests for `normalizeProduct` and the `makeProduct` helper

## Proposed Work

1. **`api/search.ts` — `RawProduct` type**: add `stores_tags?: unknown;`

2. **`api/search.ts` — `buildUrl()`**: append `stores_tags` to the `fields` query param string (comma-separated, no spaces):
   ```
   'code,product_name,brands,nutriments,quantity,serving_size,countries_tags,stores_tags,image_front_display_url,image_front_url,image_url'
   ```

3. **`api/search.ts` — `normalizeProduct()`**: derive presence flags and set URLs conditionally:
   ```ts
   const storesTags = Array.isArray(p.stores_tags)
     ? p.stores_tags.map(s => String(s).toLowerCase())
     : [];
   const hasWoolworths = storesTags.some(t => t.includes('woolworths'));
   const hasColes      = storesTags.some(t => t.includes('coles'));
   ```
   Then in the return object:
   ```ts
   colesUrl:      hasColes      ? `https://www.coles.com.au/search?q=${encodeURIComponent(searchQuery)}`                                    : null,
   woolworthsUrl: hasWoolworths ? `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(searchQuery)}` : null,
   ```

4. **`src/types.ts`**: change both fields to nullable:
   ```ts
   colesUrl: string | null;
   woolworthsUrl: string | null;
   ```

5. **`src/components/ProductCard.tsx`**: wrap the retailer links section with conditional rendering:
   ```tsx
   {(product.colesUrl || product.woolworthsUrl) && (
     <div className="retailer-links">
       {product.colesUrl      && <a className="retailer-link" href={product.colesUrl}      target="_blank" rel="noopener noreferrer">Coles ↗</a>}
       {product.woolworthsUrl && <a className="retailer-link" href={product.woolworthsUrl} target="_blank" rel="noopener noreferrer">Woolworths ↗</a>}
     </div>
   )}
   ```

6. **`api/__tests__/search.test.ts`**:
   - Update `makeProduct()` helper: `colesUrl: null`, `woolworthsUrl: null`
   - Add three new test cases inside `describe('normalizeProduct', ...)`:
     - Product with `stores_tags: ['woolworths']` → `woolworthsUrl` is non-null, `colesUrl` is null
     - Product with `stores_tags: ['coles', 'woolworths']` → both URLs non-null
     - Product with no `stores_tags` (or empty array) → both URLs null

## Acceptance Criteria

- A product with `stores_tags: ['woolworths', 'coles']` renders both retailer links.
- A product with `stores_tags: ['woolworths']` renders only the Woolworths link.
- A product with no `stores_tags` renders no retailer links (the `.retailer-links` div is absent).
- All existing tests continue to pass.
- TypeScript compiles without errors (`npx tsc --noEmit`).

## Verification

```bash
npx vitest run
npx tsc --noEmit
```

Manual check: run `npm run dev`, search "tim tams" or "vegemite", inspect product cards — some should show retailer links, some should not, depending on their OFN store data.

## Risks

- **Low OFN tag coverage**: many AU products in OFN don't have `stores_tags` set even if sold at Coles/Woolworths. This means most cards will lose the links initially. If coverage turns out to be too low to be useful, a fallback (show links for all `en:australia` products regardless) can be added later.
- **Tag naming variants**: OFN stores_tags could be `"coles-supermarkets"`, `"woolworths-supermarkets"` etc. The `t.includes('coles')` / `t.includes('woolworths')` substring match handles these variants.

## Open Questions

- None. Implementation is fully specified. Proceed directly.

## Next Agent Prompt

Read `docs/agent-handoffs/codex-task-2026-06-22-conditional-retailer-links.md` and implement it following the procedure in `.Codex/commands/consume-agent-handoff.md`. Confirm the goal and acceptance criteria before making any changes. Run all verification commands before finishing.

---

## Completion Note

Date: 2026-06-22
Agent: Codex

**Status:** Done

**What was done:**
Retailer URL fields are nullable, product cards render the retailer links section only when at least one URL is present, and normalization tests now cover Woolworths-only, Coles-plus-Woolworths, and untagged store data. Component tests also cover no links, one link, and both links.

**Verification passed:**
- [x] `npx vitest run`
- [x] `npx tsc --noEmit`
- [x] `npm run dev` manual path: verified live `vegemite` search product rows render without `.retailer-links` when OFN returns null retailer URLs. Common live queries checked had no Coles/Woolworths `stores_tags`, so linked-card rendering was verified through unit/component tests with tagged products.

**Decisions made:**
Recorded `2026-06-22 - Conditional Retailer Links` in `docs/decisions.md`.

**Remaining open questions:**
None.
