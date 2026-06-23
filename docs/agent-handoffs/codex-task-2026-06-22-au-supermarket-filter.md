# Agent Handoff: AU Supermarket Filter + Extended Retailer Links

Date: 2026-06-22
Source agent: Claude Code
Target agent: Codex
Project: calorie-search

## Goal

Verify and validate the completed implementation that restricts search results to products sold at Australian supermarkets (Woolworths, Coles, ALDI, IGA, Costco), and adds retailer links for ALDI, IGA, and Costco.

## Context

Claude Code implemented the following changes in this session. All unit tests pass (`npm test`) and TypeScript is clean (`npx tsc --noEmit`). What still needs verification is live app behaviour — running the dev server and confirming searches return only supermarket-tagged products with correct retailer links.

**What was changed:**

1. **Filter logic** (`api/search.ts`): Replaced the old `isANZProduct()` filter (which passed any AU/NZ-tagged product) with `hasAUSupermarketTag()`, applied before normalization. Only products with at least one of `woolworths`, `coles`, `aldi`, `iga`, `costco` in their OFN `stores_tags` are returned. This is intentionally strict — OFN `stores_tags` is crowdsourced so coverage is incomplete, but the tradeoff was accepted by the user.

2. **Retailer detection** (`api/search.ts` `normalizeProduct()`): Added `hasAldi`, `hasIga`, `hasCostco` checks alongside the existing `hasColes` check. Three new URL fields (`aldiUrl`, `igaUrl`, `costcoUrl`) are populated when the respective store tag is present, using search URLs:
   - ALDI: `https://www.aldi.com.au/en/groceries/search/?q=<term>`
   - IGA: `https://www.igashop.com.au/results?q=<term>`
   - Costco: `https://www.costco.com.au/c/search?query=<term>`

3. **Product type** (`src/types.ts`): Added `aldiUrl`, `igaUrl`, `costcoUrl: string | null` to the `Product` interface.

4. **ProductCard UI** (`src/components/ProductCard.tsx`): Retailer chips now render Woolworths, Coles, ALDI, IGA, and Costco links (in that order) when present.

5. **Tests**: All `makeProduct` helpers updated; 10 new tests added for the new retailer URL generation and `hasAUSupermarketTag` filter.

## Relevant Files

- `api/search.ts` — core filter (`hasAUSupermarketTag`) + normalization of all 5 stores
- `src/types.ts` — `Product` interface (added 3 fields)
- `src/components/ProductCard.tsx` — retailer link rendering
- `api/__tests__/search.test.ts` — updated + new tests
- `api/recipe.ts` — Product literals updated to include new fields (no logic change)
- `src/components/__tests__/search-ui.test.tsx` — makeProduct updated
- `src/lib/__tests__/recipeEngine.test.ts` — makeProduct updated

## Proposed Work

This is a **verification task**, not a new implementation. Steps:

1. Run `npm test` to confirm all 49 tests pass.
2. Run `npx tsc --noEmit` to confirm no TypeScript errors.
3. Start the dev server (`npm run dev`) and open the app in a browser.
4. Search for `"tim tam"` — confirm only products with Woolworths/Coles/ALDI tags appear; no random international products without store tags.
5. Search for `"weetbix"` — confirm AU supermarket products show; Woolworths live validation populates a direct product URL where available.
6. Search for `"milo"` — confirm ALDI chip appears if any products are tagged `aldi` in OFN.
7. Search for `"kirkland"` — check if Costco chip appears.
8. Confirm no retailer chip appears for products with no store tags (they should now be filtered out entirely).
9. If any retailer search URL returns a clearly broken page (404 or empty results for common products), note it as a risk and raise it.

## Acceptance Criteria

- `npm test` passes (49 tests).
- `npx tsc --noEmit` exits clean.
- Searches return only products with at least one AU supermarket tag in OFN `stores_tags`.
- Products with no store tags do not appear in results.
- ALDI, IGA, Costco chips render and link to the correct search URLs when present.
- Woolworths live validation still works (direct product link when barcode matches and `IsAvailable === true`).
- No TypeScript errors or console errors in the browser.

## Verification

```bash
npm test
npx tsc --noEmit
npm run dev
```

Then manually open `http://localhost:5173` and run the searches listed above.

## Risks

- **OFN coverage gap**: Many legitimate AU supermarket products are not tagged in `stores_tags` (crowdsourced). These will now be silently excluded. This is by design per user intent, but result counts may feel lower than expected.
- **IGA search URL**: `igashop.com.au` is a platform used by some IGA stores but not all (IGA is decentralized). The search URL may not yield results for every store. If it returns an error page, consider replacing with a DuckDuckGo/Google fallback.
- **ALDI search URL**: ALDI AU's website structure changes periodically. If the search URL format is broken, update the `aldiUrl` template in `api/search.ts` `normalizeProduct()`.
- **Woolworths anti-bot**: The live Woolworths catalog validation (`addValidatedWoolworthsLinks`) has a 2.5s timeout and may be blocked in some environments. It gracefully falls back to `null` on failure.

## Open Questions

- Should the IGA search URL be replaced with a more reliable retailer URL (e.g., a direct Google search for "site:igashop.com.au <product>")?
- Should NZ products (fetched via the `en:new-zealand` OFN query) be removed now that the filter is AU-supermarket-only? They currently pass the supermarket filter only if they also have AU supermarket tags, so the NZ query adds marginal value at the cost of extra network calls.

## Next Agent Prompt

Read `docs/agent-handoffs/codex-task-2026-06-22-au-supermarket-filter.md` and implement it following the procedure in `.Codex/commands/consume-agent-handoff.md`. Confirm the goal and acceptance criteria before making any changes. Run all verification commands before finishing.

---

## Completion Note

Date: 2026-06-22
Agent: Codex

**Status:** Partial

**What was done:**
Ran the required automated checks, started the dev server, exercised the live app/API for `tim tam`, `weetbix`, `milo`, and `kirkland`, checked upstream Open Food Facts data, and tested generated retailer search URLs.

**Verification passed:**
- [x] `npm test` - 49 tests passed.
- [x] `npx tsc --noEmit` - clean.
- [x] `npm run dev` - launched successfully; the new instance used port 5175 because 5173 and 5174 were already occupied, and the existing app on 5173 was also verified.
- [x] Browser smoke check - app loaded and the required searches completed without JavaScript console errors.
- [ ] Live search acceptance - the required searches all returned zero results, so AU supermarket products and retailer chips could not be confirmed in the app.
- [ ] Retailer URL acceptance - the current IGA URL template returned a 404 page for a common generated search URL.

**Decisions made:**
None. This was treated as a verification-only handoff.

**Remaining open questions:**
- The live search endpoint response does not include `stores_tags` for sampled hits, even though direct product API lookups for products such as Vegemite, Weet-Bix Kids, and Milo do include `stores_tags`. Should `api/search.ts` hydrate store tags from the product endpoint or switch to an OFN endpoint that returns store tags reliably before applying the strict filter?
- The IGA template `https://www.igashop.com.au/results?q=<term>` returned a 404 page. Should it be replaced with a more reliable IGA search target or a site-search fallback?
- The NZ fetch appears to add no value for the AU-supermarket-only filter in the sampled live checks and doubles the upstream request work. Should it be removed now?
