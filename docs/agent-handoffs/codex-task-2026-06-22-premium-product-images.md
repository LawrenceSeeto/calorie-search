# Agent Handoff: Premium Product Images via OFN Display URLs

Date: 2026-06-22
Source agent: Claude Code
Target agent: Codex
Project: calorie-search

## Goal

Upgrade product images to use Open Food Facts' display-optimised `image_front_display_url` field (a processed ~400px packshot) instead of the raw `image_front_url`, and make the image slot larger and more polished in the UI so products look professional.

## Context

The app currently fetches `image_front_url` and `image_url` from the OFN search-a-licious API. OFN also provides `image_front_display_url` — a server-processed version of the front image specifically intended for display (typically ~400px wide, cleaner crop). The image slot in the card is only 64×64px, which is too small to show a meaningful packshot. The plan is to: (1) add the new field to the API fetch, (2) use it as the primary image source with the existing fields as fallbacks, and (3) increase the slot size and add a shimmer loading animation so the UI looks polished while images load.

No changes are needed to `src/types.ts` — `imageUrl: string | null` already covers this.

## Relevant Files

- `api/search.ts` — OFN fetch, `RawProduct` type, `normalizeProduct()`, `buildUrl()` fields param
- `src/components/ProductCard.tsx` — image rendering, fallback logic, state
- `src/styles/index.css` — `.product-image-slot`, `.product-image`, `.product-image-placeholder` (around line 246)

## Proposed Work

1. **`api/search.ts`** — add `image_front_display_url` field:
   - Add `image_front_display_url?: unknown` to the `RawProduct` type.
   - Add `image_front_display_url` to the `fields` string in `buildUrl()`.
   - Update the image priority chain in `normalizeProduct()` to: `image_front_display_url` → `image_front_url` → `image_url` → `null`.

2. **`src/components/ProductCard.tsx`** — add shimmer loading state:
   - Add `imageLoaded` state (`useState(false)`).
   - Add `product-image-loading` class to the image slot when `showImage && !imageLoaded`.
   - Add `onLoad={() => setImageLoaded(true)}` to the `<img>` element.
   - Reset `imageLoaded` to `false` if the product changes (add `imageUrl` to a `useEffect` dependency or just initialise fresh per render — the key-based approach via `product.code` on the `<li>` is sufficient if ProductGrid already keys by code).

3. **`src/styles/index.css`** — larger slot + shimmer animation:
   - Increase `.product-image-slot` from `64px` → `88px` (width and height).
   - Update the mobile breakpoint (`≤480px`) from `56px` → `72px`.
   - Add `box-shadow: 0 1px 4px rgba(0,0,0,0.08)` to `.product-image` so packshots lift off the background.
   - Add a `@keyframes shimmer` animation and `.product-image-loading` class:
     ```css
     @keyframes shimmer {
       0%   { background-position: -200% 0; }
       100% { background-position: 200% 0; }
     }
     .product-image-loading {
       background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
       background-size: 200% 100%;
       animation: shimmer 1.4s infinite;
     }
     ```

## Acceptance Criteria

- `api/search.ts` requests `image_front_display_url` in the `fields` param sent to OFN.
- `normalizeProduct()` uses `image_front_display_url` as the first-choice image URL.
- The image slot in `ProductCard` renders with the `product-image-loading` shimmer class until the image has loaded.
- The image slot is visually 88×88px on desktop and 72×72px on mobile (≤480px).
- The existing SVG placeholder still appears when `imageUrl` is null or the image fails to load.
- All existing Vitest tests in `api/__tests__/search.test.ts` continue to pass.

## Verification

```bash
# Type-check
npx tsc --noEmit

# Unit tests
npm test

# Manual: run the dev server and search "tim tam" or "milo"
# — images should be noticeably larger packshots
# — shimmer should be visible on slow network (throttle in DevTools)
# — SVG placeholder should appear for products without images
npm run dev
```

## Risks

- OFN doesn't guarantee `image_front_display_url` is populated for every product — the fallback chain handles this, but expect some products to still show the placeholder.
- The shimmer class overrides the `.product-image-slot` background. Ensure the class is only applied when `showImage` is true (i.e. don't shimmer on placeholder slots).
- Increasing the slot size may affect card row alignment on narrow screens — check the 375px viewport in DevTools.

## Open Questions

- None — requirements are fully defined by the approved plan.

## Next Agent Prompt

Read `docs/agent-handoffs/codex-task-2026-06-22-premium-product-images.md` and implement it following the procedure in `.Codex/commands/consume-agent-handoff.md`. Confirm the goal and acceptance criteria before making any changes. Run all verification commands before finishing.

---

## Completion Note

Date: 2026-06-22
Agent: Codex

**Status:** Done

**What was done:**
Added `image_front_display_url` to the OFN search field request and normalized image priority, added ProductCard image loading state with the `product-image-loading` shimmer class, enlarged desktop/mobile image slots, and preserved placeholder fallback behavior.

**Verification passed:**
- [x] `npx tsc --noEmit`
- [x] `npm test`
- [x] `npm run dev` via the running Vite dev server at `http://127.0.0.1:5173/`; headless Chrome searched `milo`, observed the loading shimmer class, verified `88px` desktop slots, verified `72px` mobile slots, and confirmed display-image URLs.

**Decisions made:**
Recorded `image_front_display_url` source priority in `docs/decisions.md`.

**Remaining open questions:**
None.
