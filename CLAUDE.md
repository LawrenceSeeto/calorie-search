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
2. `search()` fetches `https://world.openfoodfacts.org/api/v2/search` with fields `product_name, brands, nutriments, image_front_small_url`
3. Results are filtered to products with a numeric `energy-kcal_100g` value, sorted ascending, capped at 20
4. `renderCard()` builds HTML strings inserted via `grid.innerHTML`

### Race-condition guard

`currentQuery` tracks the in-flight query string. Responses whose `q` doesn't match `currentQuery` are silently dropped, preventing stale results from a slow earlier fetch overwriting a faster later one.

## Calorie badge thresholds

| Class | Range |
|-------|-------|
| `cal-low` (green) | < 100 kcal/100g |
| `cal-medium` (yellow) | 100–299 kcal/100g |
| `cal-high` (red) | ≥ 300 kcal/100g |

## Deployment

Push to a public GitHub repo and enable **Settings → Pages → Source: main branch**. No build step needed — GitHub Pages serves `index.html` directly.
