# Agent Handoff: Woolworths CDN Product Images

Date: 2026-06-22
Source agent: Claude Code
Target agent: Codex
Project: calorie-search

## Goal

Replace the single `imageFailed` boolean in `ProductCard.tsx` with a multi-source image cascade that tries the Woolworths product image CDN first (keyed on barcode), then falls back to the existing OFN display URL, then the SVG placeholder — all client-side with no API changes.

## Context

The previous handoff (codex-task-2026-06-22-premium-product-images.md) implemented OFN `image_front_display_url` as the primary image source and is already shipped. The 88×72px image slot and shimmer loading state are already in place.

Woolworths hosts product packshots at a predictable public URL pattern: `https://cdn0.woolworths.media/content/wowproductimages/large/{barcode}.jpg`. Every product already carries a `code` field (the EAN/GTIN barcode) from the OFN API, so these URLs can be constructed entirely in the component with no new fetch or API changes.

The existing `imageFailed: boolean` state only supports a single source. It needs to become a `srcIndex: number` that advances through an ordered list of URLs on each `onError`.

## Relevant Files

- `src/components/ProductCard.tsx` — the only file that changes
- `src/types.ts` — read-only reference; `Product.code: string` and `Product.imageUrl: string | null` are the relevant fields
- `src/styles/index.css` — read-only; shimmer and slot styles already exist from the previous handoff

## Proposed Work

1. **Build the source list** at the top of the component:
   ```tsx
   const sources = [
     product.code ? `https://cdn0.woolworths.media/content/wowproductimages/large/${product.code}.jpg` : null,
     product.imageUrl,
   ].filter((s): s is string => s !== null && s.length > 0);
   ```

2. **Replace state** — swap `useState(false)` / `imageFailed` for `useState(0)` / `srcIndex`:
   ```tsx
   const [srcIndex, setSrcIndex] = useState(0);
   const currentSrc = sources[srcIndex];
   const showImage = currentSrc !== undefined;
   ```

3. **Reset on product change** — add a `useEffect` so a new card doesn't inherit a stale failed index:
   ```tsx
   useEffect(() => { setSrcIndex(0); }, [product.code]);
   ```

4. **Update the `<img>` element**:
   - `src={currentSrc}` (was `src={imageUrl}`)
   - `onError={() => setSrcIndex(i => i + 1)}` (was `onError={() => setImageFailed(true)}`)
   - Keep `onLoad`, `loading="lazy"`, and the shimmer class logic unchanged (shimmer class is applied when `showImage && !imageLoaded`)

5. **Remove the now-unused** `const imageUrl = product.imageUrl;` line.

## Acceptance Criteria

- Searching "tim tam" or "milo" loads images from `cdn0.woolworths.media` (visible in DevTools Network tab).
- Blocking `cdn0.woolworths.media` in DevTools causes graceful fallback to the OFN image URL.
- Products with an empty `code` skip straight to the OFN URL (no broken Woolworths request fired).
- The SVG placeholder still appears when all sources are exhausted or `imageUrl` is null and `code` is empty.
- The shimmer animation still plays while the image is loading (first source or any fallback).
- `npx tsc --noEmit` reports zero errors.
- `npm test` passes with no changes to test files.

## Verification

```bash
# Type-check
npx tsc --noEmit

# Unit tests (no API changes; these should be unaffected)
npm test

# Manual dev server
npm run dev
# Search "tim tam" — Network tab should show cdn0.woolworths.media requests
# Block cdn0.woolworths.media in DevTools → OFN image should load instead
# Search a NZ-only product → placeholder or OFN fallback, no console errors
```

## Risks

- Woolworths CDN is undocumented and could change its URL pattern. If it does, `onError` degrades gracefully — no user-visible breakage, just falls back to OFN.
- NZ-only products won't appear in the Woolworths AU catalogue — `onError` handles this transparently.
- The `useEffect` reset depends on `product.code` being stable per card. It is — ProductGrid keys cards by `product.code`, so each card unmounts/remounts on a new search anyway.

## Open Questions

- None — requirements are fully defined.

## Next Agent Prompt

Read `docs/agent-handoffs/codex-task-2026-06-22-woolworths-cdn-images.md` and implement it following the procedure in `.Codex/commands/consume-agent-handoff.md`. Confirm the goal and acceptance criteria before making any changes. Run all verification commands before finishing.

---

## Completion Note

Date: 2026-06-22
Agent: Codex

**Status:** Done

**What was done:**
Replaced the single `imageFailed` flag in `ProductCard` with an ordered source cascade that tries a Woolworths CDN URL for valid barcode-shaped product codes, then the existing Open Food Facts image URL, then the SVG placeholder. The image load shimmer and existing placeholder branch were preserved.

**Verification passed:**
- [x] `npx tsc --noEmit`
- [x] `npm test`
- [x] `npm run dev` via the running Vite dev server at `http://127.0.0.1:5173/`; headless Chrome verified `tim tam` emits Woolworths CDN image requests and shimmer, blocked Woolworths CDN falls back to OFN for `milo`, empty-code mock products skip CDN and use OFN, all-source exhaustion renders the SVG placeholder, and a real `whittaker` search completes with no console errors.

**Decisions made:**
Recorded the barcode-shape guard for Woolworths CDN image URLs in `docs/decisions.md`.

**Remaining open questions:**
None.
