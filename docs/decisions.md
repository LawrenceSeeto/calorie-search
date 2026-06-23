# Decisions

## 2026-06-22 - Strict ANZ Search Results

Search responses filter normalized products to require `en:australia` or `en:new-zealand` in `countries`, even though upstream Open Food Facts queries already request those country tags.

Reason: The search-a-licious country filter can behave as a soft preference. Returning fewer, country-tagged products is preferable to showing products that cannot be verified as Australia or New Zealand results.

## 2026-06-22 - Conditional Retailer Links

Product retailer links are only populated when a retailer-specific availability signal exists. Coles currently uses Open Food Facts `stores_tags`; Woolworths uses live catalog validation. Missing or unvalidated store data produces `null` retailer URLs, and product cards omit the retailer links section.

Reason: Store-tag coverage is crowdsourced, but a missing link is preferable to showing a retailer search link that returns no relevant result.

## 2026-06-22 - Woolworths Catalog Validation

Woolworths links are populated only after the Woolworths catalog API returns an available product whose barcode exactly matches the Open Food Facts product code. Validated Woolworths links point to the direct Woolworths product details page. Coles links remain limited to confirmed OFN store tags because Coles server-side catalog/search requests return an anti-bot challenge instead of reliable product data.

Reason: Retailer links should represent confirmed store availability. Woolworths exposes barcode and availability fields that support validation; Coles does not currently expose a reliable server-side validation path from this app.

## 2026-06-22 - Retailer Search Query Identity

Product retailer links use normalized product name plus brand text for Coles and Woolworths search URLs, including array-valued brand data returned by the provider.

Reason: Retailer search pages match product names and brands, not GTIN/barcode values. Open Food Facts search responses can expose `brands` as multiple raw values while the card still displays a normalized brand string.

## 2026-06-22 - Search Deduplication Identity

Search result deduplication uses normalized `product_name + brands` as the primary identity and falls back to barcode only when product identity is unavailable.

Reason: Open Food Facts can return the same product under multiple barcodes or country records. Barcode-first deduplication still allowed repeated same-name/same-brand entries such as Vegemite variants on the first page.

## 2026-06-22 - Product Image Source Priority

Superseded by the 2026-06-23 product image field removal decision.

Reason: The product model no longer carries Open Food Facts image URLs.

## 2026-06-22 - Woolworths CDN Image Cascade

Product cards try the Woolworths CDN image URL before the normalized Open Food Facts image URL only when `Product.code` looks like a numeric EAN/GTIN barcode.

Reason: The CDN URL is barcode-keyed, and dummy or invalid codes should not create broken image requests. Invalid or missing codes skip directly to the Open Food Facts fallback or placeholder.

## 2026-06-23 - AU Supermarket Store Queries

AU supermarket filtering uses five store-scoped Open Food Facts legacy JSON queries against `world.openfoodfacts.org/cgi/search.pl`, with `countries_tags=en:australia` as a safety net. When one or more store queries fail, the API also uses an AU-tagged fallback query that returns `stores_tags`; if all tagged queries fail, it falls back to hydrating product records from the v2 product API and keeps only records with both an AU country tag and one of the five target supermarket tags.

Reason: Live verification showed `search.openfoodfacts.org/search` ignores `stores_tags` and `countries_tags` filter parameters, while the legacy JSON endpoint can return usable `stores_tags` but intermittently returns 503 for individual store queries. The layered approach keeps results AU-supermarket-scoped without letting transient upstream failures make common searches return zero results.

## 2026-06-23 - Retailer Search URL Fallbacks

Woolworths-tagged products receive a Woolworths search URL during normalization, and live Woolworths barcode validation upgrades that URL to a direct product page when available. IGA links use `https://www.iga.com.au/?post_type=product&s=<term>`.

Reason: Some Woolworths-only products pass AU supermarket filtering even when live Woolworths validation cannot produce a direct link, so a search fallback prevents chipless supermarket results. Live verification showed both `igashop.com.au/results?q=...` and `iga.com.au/search?q=...` return 404, while the WordPress product search URL returns HTTP 200.

## 2026-06-23 - Product Image Field Removal

Search responses no longer request, normalize, or expose Open Food Facts image fields. Product cards only attempt barcode-derived Woolworths CDN images and otherwise show the existing placeholder.

Reason: The backend product contract is smaller and avoids returning stale or unavailable OFN image URLs while preserving the current barcode-based image path.
