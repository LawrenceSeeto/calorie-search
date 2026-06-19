# Calorie Search

A lightweight website that searches food products and returns results sorted by lowest calories first (kcal per 100g).

**Live site:** https://YOUR-USERNAME.github.io/calorie-search/

## How it works

- Searches the [Open Food Facts](https://world.openfoodfacts.org/) database (free, no API key required, 900k+ products)
- Filters results to only show products with verified calorie data
- Sorts by calories per 100g, lowest first
- Colour-coded badges: green (< 100 kcal), yellow (100–300 kcal), red (> 300 kcal)

## Deploy to GitHub Pages

1. Create a new **public** repository on GitHub
2. Push this folder to the `main` branch
3. Go to **Settings → Pages → Source: main branch** → Save
4. Your site will be live at `https://<your-username>.github.io/<repo-name>/`

## Tech

Single HTML file — no build tools, no dependencies, no cost.
