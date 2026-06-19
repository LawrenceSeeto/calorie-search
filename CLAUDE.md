# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file static web app (`index.html`) — no build step, no dependencies, no framework. Open the file directly in a browser to run it.

## Architecture

Everything lives in `index.html`:
- **CSS** — inline `<style>` block; uses CSS Grid for the card layout
- **HTML** — static shell with a search bar, spinner, status text, and a results grid
- **JS** — vanilla script at the bottom; no modules, no bundler

### Data flow

1. User types a query → debounced 400ms `input` handler or immediate `Enter`/button handler fires `search(q)`
2. `search()` fires **two parallel fetches** to `https://world.openfoodfacts.org/api/v2/search` — one with `countries_tags=en:australia`, one with `countries_tags=en:new-zealand` — and merges + deduplicates the results on the `code` (barcode) field
3. Results are filtered to products with a numeric `energy-kcal_100g` value, sorted ascending, capped at 20
4. `makeCard()` builds each card using `document.createElement` + `textContent` (never `innerHTML`) to prevent XSS from user-submitted OFN product data

### Country filtering

Two parallel fetches are made rather than one, because the OFN v2 `countries_tags` parameter reliably accepts one tag per request; comma-separated multi-value behaviour is undocumented. After both resolve, products are merged and deduplicated by `code` field (with a `product_name|brands` fallback for products missing a barcode).

### Race-condition guard

`currentQuery` tracks the in-flight query string. Responses whose `q` doesn't match `currentQuery` are silently dropped. An `AbortController` signal is also passed to both fetches so cancelled requests are torn down at the network layer, not just ignored at render time.

## Calorie badge thresholds

| Class | Range |
|-------|-------|
| `cal-low` (green) | < 100 kcal/100g |
| `cal-medium` (yellow) | 100–299 kcal/100g |
| `cal-high` (red) | ≥ 300 kcal/100g |

## Deployment

Push to a public GitHub repo and enable **Settings → Pages → Source: main branch**. No build step needed — GitHub Pages serves `index.html` directly.
