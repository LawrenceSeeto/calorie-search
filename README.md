# Calorie Search

A website that searches food products and returns results sorted by lowest calories first (kcal per 100g). Targets Australia & New Zealand products.

**Live site:** https://YOUR-PROJECT.vercel.app

## How it works

- Searches [Open Food Facts](https://world.openfoodfacts.org/) via a backend proxy (no API key required)
- Filters results to products with verified calorie data
- Sorts by calories per 100g, lowest first
- Colour-coded badges: green (< 100 kcal), yellow (100–300 kcal), red (> 300 kcal)

## Tech

- **Frontend:** Vite + React 18 + TypeScript
- **Backend:** Vercel serverless route at `/api/search`
- **Hosting:** Vercel

## Local development

```sh
npm install
npm run dev      # starts vercel dev (frontend + API together)
```

Requires the [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`

## Environment variables

Set these in Vercel project settings (not committed):

| Variable | Description |
|---|---|
| `CALORIE_SEARCH_USER_AGENT` | Sent on every OFN request per their ToS, e.g. `CalorieSearch-AUNZ/1.0 (you@example.com)` |

## Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Set the `CALORIE_SEARCH_USER_AGENT` environment variable in project settings
4. Deploy — Vercel auto-detects the Vite framework

## Tests

```sh
npm run test        # run Vitest tests
npm run typecheck   # TypeScript type check
npm run build       # production build
```
