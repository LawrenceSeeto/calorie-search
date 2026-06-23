import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Product, SearchResponse } from '../src/types';

const OFN_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFN_FALLBACK_SEARCH_URL = 'https://search.openfoodfacts.org/search';
const OFN_PRODUCT_API_URL = 'https://world.openfoodfacts.org/api/v2/product';
const WOOLWORTHS_SEARCH_URL = 'https://www.woolworths.com.au/apis/ui/Search/products';
const PAGE_SIZE = 20;
const RETAILER_FETCH_TIMEOUT_MS = 2500;
const OFN_FETCH_TIMEOUT_MS = 4000;
const FALLBACK_HYDRATE_LIMIT = 50;
const STORES = ['woolworths', 'coles', 'aldi', 'iga', 'costco'] as const;

type AUStore = typeof STORES[number];

type Nutriments = Record<string, unknown>;
type RawProduct = {
  code?: unknown;
  product_name?: unknown;
  brands?: unknown;
  nutriments?: Nutriments;
  quantity?: unknown;
  serving_size?: unknown;
  countries_tags?: unknown;
  stores_tags?: unknown;
};
type WoolworthsProduct = Record<string, unknown>;
type WoolworthsMatchResult = { match: WoolworthsProduct | null; cacheable: boolean };
type WoolworthsUrlCacheEntry = { url: string | null; expiresAt: number };

const woolworthsUrlCache = new Map<string, WoolworthsUrlCacheEntry>();
const WOOLWORTHS_CACHE_TTL_MS = 10 * 60 * 1000;
const WOOLWORTHS_CACHE_MAX = 500;
const WOOLWORTHS_MAX_CONCURRENT_FETCHES = 5;

let activeWoolworthsFetches = 0;
const woolworthsQueue: Array<() => void> = [];

export function normalizeKcal(nutriments: Nutriments): number | null {
  const kcal = nutriments['energy-kcal_100g'];
  if (typeof kcal === 'number' && isFinite(kcal)) return kcal;
  const kj = nutriments['energy_100g'];
  if (typeof kj === 'number' && isFinite(kj)) return kj / 4.184;
  return null;
}

function normalizeMacro(val: unknown): number | null {
  return typeof val === 'number' && isFinite(val)
    ? Math.round(val * 10) / 10
    : null;
}

function parseServingGrams(serving: unknown): number | null {
  if (typeof serving !== 'string') return null;
  const match = /(\d+(?:\.\d+)?)\s*g/i.exec(serving);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isFinite(val) && val > 0 ? Math.round(val) : null;
}

export function dedupeByCode(products: RawProduct[]): RawProduct[] {
  const seen = new Set<string>();
  return products.filter(p => {
    const productKey = normalizeDedupeKey(p.product_name) + normalizeDedupeKey(p.brands);
    const key = productKey || String(p.code ?? '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const normalizeDedupeKey = (s: unknown): string =>
  typeof s === 'string' ? s.toLowerCase().replace(/[^a-z0-9]/g, '').trim() : '';

const normalizeBarcode = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

export function isBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
}

function normalizeSearchTerm(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const joined = value
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(' ');
    return joined.length > 0 ? joined : null;
  }

  return null;
}

function buildRetailerSearchQuery(product: Pick<Product, 'name' | 'brand'>): string {
  return [product.name, product.brand]
    .map(value => value.trim())
    .filter(Boolean)
    .join(' ');
}

function hasEnglishName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const ascii = trimmed.replace(/[^\x00-\x7F]/g, '');
  return ascii.length / trimmed.length >= 0.5;
}

export function normalizeProduct(p: RawProduct): Product | null {
  const n = p.nutriments ?? {};
  const kcalPer100g = normalizeKcal(n);
  if (kcalPer100g === null) return null;

  const name = String(p.product_name ?? '');
  if (name && !hasEnglishName(name)) return null;

  const code = String(p.code ?? '');
  const searchQuery = [normalizeSearchTerm(p.product_name), normalizeSearchTerm(p.brands)]
    .filter((v): v is string => v !== null)
    .join(' ');

  const storesTags = Array.isArray(p.stores_tags)
    ? p.stores_tags.map(s => String(s).toLowerCase())
    : [];
  const hasWoolworths = storesTags.some(t => t.includes('woolworths'));
  const hasColes   = storesTags.some(t => t.includes('coles'));
  const hasAldi    = storesTags.some(t => t.includes('aldi'));
  const hasIga     = storesTags.some(t => t.includes('iga'));
  const hasCostco  = storesTags.some(t => t.includes('costco'));

  return {
    code,
    name: name || 'Unknown product',
    brand: String(p.brands ?? ''),
    kcalPer100g: Math.round(kcalPer100g),
    proteinPer100g: normalizeMacro(n['proteins_100g']),
    fatPer100g:     normalizeMacro(n['fat_100g']),
    carbsPer100g:   normalizeMacro(n['carbohydrates_100g']),
    quantity: typeof p.quantity === 'string' ? p.quantity : null,
    servingSize: typeof p.serving_size === 'string' ? p.serving_size : null,
    servingGrams: parseServingGrams(p.serving_size),
    countries: Array.isArray(p.countries_tags) ? p.countries_tags.map(String) : [],
    colesUrl:   hasColes  ? `https://www.coles.com.au/search?q=${encodeURIComponent(searchQuery)}`                              : null,
    woolworthsUrl: hasWoolworths ? `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(searchQuery)}` : null,
    aldiUrl:    hasAldi   ? `https://www.aldi.com.au/en/groceries/search/?q=${encodeURIComponent(searchQuery)}`                 : null,
    igaUrl:     hasIga    ? `https://www.iga.com.au/?post_type=product&s=${encodeURIComponent(searchQuery)}`                    : null,
    costcoUrl:  hasCostco ? `https://www.costco.com.au/c/search?query=${encodeURIComponent(searchQuery)}`                       : null,
    sourceUrl: code ? `https://world.openfoodfacts.org/product/${code}` : '',
  };
}

function buildWoolworthsCatalogUrl(code: string): string {
  const url = new URL(WOOLWORTHS_SEARCH_URL);
  url.searchParams.set('searchTerm', code);
  url.searchParams.set('pageNumber', '1');
  url.searchParams.set('pageSize', '5');
  return url.toString();
}

function extractWoolworthsProducts(data: unknown): WoolworthsProduct[] {
  if (!data || typeof data !== 'object') return [];
  const rootProducts = (data as Record<string, unknown>)['Products'];
  if (!Array.isArray(rootProducts)) return [];

  return rootProducts.flatMap(group => {
    if (!group || typeof group !== 'object') return [];
    const nested = (group as Record<string, unknown>)['Products'];
    return Array.isArray(nested)
      ? nested.filter((product): product is WoolworthsProduct => (
        product !== null && typeof product === 'object'
      ))
      : [group as WoolworthsProduct];
  });
}

export function findAvailableWoolworthsMatch(
  data: unknown,
  code: string,
): WoolworthsProduct | null {
  const barcode = normalizeBarcode(code);
  if (!isBarcode(barcode)) return null;

  return extractWoolworthsProducts(data).find(product => (
    normalizeBarcode(product['Barcode']) === barcode &&
    product['IsAvailable'] === true &&
    product['IsInStock'] !== false
  )) ?? null;
}

function buildWoolworthsProductUrl(product: Product, match: WoolworthsProduct): string {
  const stockcode = String(match['Stockcode'] ?? '').trim();
  const slug = String(match['UrlFriendlyName'] ?? '').trim();
  if (stockcode && slug) {
    return `https://www.woolworths.com.au/shop/productdetails/${encodeURIComponent(stockcode)}/${encodeURIComponent(slug)}`;
  }

  const searchQuery = buildRetailerSearchQuery(product);
  return `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(searchQuery)}`;
}

async function fetchWoolworthsMatch(
  code: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<WoolworthsMatchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RETAILER_FETCH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(buildWoolworthsCatalogUrl(code), {
      headers: {
        Accept: 'application/json',
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    });
    if (!response.ok) return { match: null, cacheable: false };
    return {
      match: findAvailableWoolworthsMatch(await response.json(), code),
      cacheable: true,
    };
  } catch {
    return { match: null, cacheable: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

function getCachedWoolworthsUrl(barcode: string): string | null | undefined {
  const entry = woolworthsUrlCache.get(barcode);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    woolworthsUrlCache.delete(barcode);
    return undefined;
  }
  return entry.url;
}

function setCachedWoolworthsUrl(barcode: string, url: string | null): void {
  if (!woolworthsUrlCache.has(barcode) && woolworthsUrlCache.size >= WOOLWORTHS_CACHE_MAX) {
    const oldestKey = woolworthsUrlCache.keys().next().value;
    if (oldestKey !== undefined) {
      woolworthsUrlCache.delete(oldestKey);
    }
  }

  woolworthsUrlCache.set(barcode, {
    url,
    expiresAt: Date.now() + WOOLWORTHS_CACHE_TTL_MS,
  });
}

async function acquireWoolworthsSlot(): Promise<void> {
  if (activeWoolworthsFetches < WOOLWORTHS_MAX_CONCURRENT_FETCHES) {
    activeWoolworthsFetches++;
    return;
  }

  await new Promise<void>(resolve => woolworthsQueue.push(resolve));
}

function releaseWoolworthsSlot(): void {
  const next = woolworthsQueue.shift();
  if (next) {
    next();
    return;
  }

  activeWoolworthsFetches = Math.max(0, activeWoolworthsFetches - 1);
}

async function fetchValidatedWoolworthsUrl(
  product: Product,
  barcode: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<string | null> {
  await acquireWoolworthsSlot();
  try {
    const { match, cacheable } = await fetchWoolworthsMatch(barcode, fetchImpl, userAgent);
    const url = match ? buildWoolworthsProductUrl(product, match) : null;
    if (cacheable) {
      setCachedWoolworthsUrl(barcode, url);
    }
    return url;
  } finally {
    releaseWoolworthsSlot();
  }
}

export async function addValidatedWoolworthsLinks(
  products: Product[],
  options: {
    fetchImpl?: typeof fetch;
    userAgent?: string;
  } = {},
): Promise<Product[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? 'CalorieSearch-AUNZ/1.0';
  const requestCache = new Map<string, Promise<string | null>>();

  return Promise.all(products.map(async product => {
    const barcode = normalizeBarcode(product.code);
    if (!isBarcode(barcode)) return { ...product, woolworthsUrl: product.woolworthsUrl };

    const cachedUrl = getCachedWoolworthsUrl(barcode);
    if (cachedUrl !== undefined) {
      return {
        ...product,
        woolworthsUrl: cachedUrl ?? product.woolworthsUrl,
      };
    }

    if (!requestCache.has(barcode)) {
      requestCache.set(
        barcode,
        fetchValidatedWoolworthsUrl(product, barcode, fetchImpl, userAgent),
      );
    }

    const url = await requestCache.get(barcode);
    return {
      ...product,
      woolworthsUrl: url ?? product.woolworthsUrl,
    };
  }));
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[\s\W_]+/).filter(Boolean);
}

export function scoreProduct(product: Product, query: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const nameTokens = tokenize(product.name ?? '');
  const brandTokens = tokenize(product.brand ?? '');
  const nameTokenSet = new Set(nameTokens);
  const brandTokenSet = new Set(brandTokens);
  const uniqueQueryTokens = [...new Set(queryTokens)];
  let score = 0;

  const allQueryTokensInName = uniqueQueryTokens.every(token => nameTokenSet.has(token));
  if (allQueryTokensInName) {
    let nameScore = 30;
    if (nameTokens[0] === queryTokens[0]) nameScore += 10;
    if (
      nameTokens.length === queryTokens.length &&
      nameTokens.every((token, index) => token === queryTokens[index])
    ) {
      nameScore += 20;
    }
    score += Math.min(nameScore, 60);
  }

  const brandScore = uniqueQueryTokens
    .filter(token => brandTokenSet.has(token))
    .length * 10;
  score += Math.min(brandScore, 15);

  return score;
}

function buildStoreUrl(q: string, store: AUStore): string {
  const url = new URL(OFN_SEARCH_URL);
  url.searchParams.set('search_terms', q);
  url.searchParams.set('stores_tags', store);
  url.searchParams.set('countries_tags', 'en:australia');
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set(
    'fields',
    'code,product_name,brands,nutriments,quantity,serving_size,countries_tags',
  );
  url.searchParams.set('page_size', '100');
  return url.toString();
}

function buildFallbackSearchUrl(q: string): string {
  const url = new URL(OFN_FALLBACK_SEARCH_URL);
  url.searchParams.set('q', q);
  url.searchParams.set(
    'fields',
    'code,product_name,brands,nutriments,quantity,serving_size,countries_tags',
  );
  url.searchParams.set('page_size', '100');
  return url.toString();
}

function buildTaggedFallbackSearchUrl(q: string): string {
  const url = new URL(OFN_SEARCH_URL);
  url.searchParams.set('search_terms', q);
  url.searchParams.set('countries_tags', 'en:australia');
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set(
    'fields',
    'code,product_name,brands,nutriments,quantity,serving_size,countries_tags,stores_tags',
  );
  url.searchParams.set('page_size', '100');
  return url.toString();
}

function buildBarcodeProductUrl(code: string): string {
  const url = new URL(`${OFN_PRODUCT_API_URL}/${encodeURIComponent(code)}`);
  url.searchParams.set(
    'fields',
    'code,product_name,brands,nutriments,quantity,serving_size,countries_tags,stores_tags',
  );
  return url.toString();
}

function buildProductLookupUrl(code: string): string {
  const url = new URL(`${OFN_PRODUCT_API_URL}/${encodeURIComponent(code)}`);
  url.searchParams.set('fields', 'stores_tags,countries_tags');
  return url.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OFN_FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractHits(data: unknown): RawProduct[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  // search-a-licious returns `hits`; v2 API returns `products`
  const arr = d['hits'] ?? d['products'];
  return Array.isArray(arr) ? (arr as RawProduct[]) : [];
}

export function dedupeAndMergeStores(
  hitsByStore: Array<{ store: AUStore; hits: RawProduct[] }>,
): Array<RawProduct & { stores_tags: string[] }> {
  const seen = new Map<string, RawProduct & { stores_tags: string[] }>();

  for (const { store, hits } of hitsByStore) {
    for (const p of hits) {
      const productKey = normalizeDedupeKey(p.product_name) + normalizeDedupeKey(p.brands);
      const key = productKey || String(p.code ?? '');
      const existing = seen.get(key);

      if (existing) {
        if (!existing.stores_tags.includes(store)) {
          existing.stores_tags.push(store);
        }
      } else {
        seen.set(key, { ...p, stores_tags: [store] });
      }
    }
  }

  return [...seen.values()];
}

function extractMatchingStores(storesTags: unknown): AUStore[] {
  const tags = Array.isArray(storesTags)
    ? storesTags.map(tag => String(tag).toLowerCase())
    : [];
  return STORES.filter(store => tags.some(tag => tag.includes(store)));
}

function hasAustraliaCountryTag(countriesTags: unknown): boolean {
  return Array.isArray(countriesTags)
    ? countriesTags.map(tag => String(tag).toLowerCase()).includes('en:australia')
    : false;
}

function addStores(product: RawProduct & { stores_tags: string[] }, stores: AUStore[]) {
  for (const store of stores) {
    if (!product.stores_tags.includes(store)) {
      product.stores_tags.push(store);
    }
  }
}

async function hydrateProductsWithStoreTags(
  products: Array<RawProduct & { stores_tags: string[] }>,
  fetchOpts: RequestInit,
  limit = FALLBACK_HYDRATE_LIMIT,
): Promise<Array<RawProduct & { stores_tags: string[] }>> {
  await Promise.all(products.slice(0, limit).map(async product => {
    const code = normalizeBarcode(product.code);
    if (!isBarcode(code)) return;

    try {
      const response = await fetchWithTimeout(buildProductLookupUrl(code), fetchOpts);
      if (!response.ok) return;
      const data = await response.json() as {
        product?: {
          stores_tags?: unknown;
          countries_tags?: unknown;
        };
      };
      if (Array.isArray(data.product?.countries_tags)) {
        product.countries_tags = data.product.countries_tags;
      }
      addStores(product, extractMatchingStores(data.product?.stores_tags));
    } catch {
      // Fallback hydration is best-effort; products without confirmed store tags are excluded.
    }
  }));

  return products.filter(product => (
    product.stores_tags.length > 0 &&
    hasAustraliaCountryTag(product.countries_tags)
  ));
}

async function hydrateStoreTagsFromProducts(
  hits: RawProduct[],
  fetchOpts: RequestInit,
): Promise<Array<{ store: AUStore; hits: RawProduct[] }>> {
  const products = await hydrateProductsWithStoreTags(
    hits.map(hit => ({ ...hit, stores_tags: [] })),
    fetchOpts,
  );
  const hitsByStore = new Map<AUStore, RawProduct[]>(
    STORES.map(store => [store, []]),
  );

  for (const product of products) {
    for (const store of product.stores_tags) {
      if (STORES.includes(store as AUStore)) {
        hitsByStore.get(store as AUStore)!.push(product);
      }
    }
  }

  return STORES.map(store => ({ store, hits: hitsByStore.get(store)! }))
    .filter(({ hits }) => hits.length > 0);
}

function groupHitsByStoreTags(hits: RawProduct[]): Array<{ store: AUStore; hits: RawProduct[] }> {
  const hitsByStore = new Map<AUStore, RawProduct[]>(
    STORES.map(store => [store, []]),
  );

  for (const hit of hits) {
    if (!hasAustraliaCountryTag(hit.countries_tags)) continue;
    for (const store of extractMatchingStores(hit.stores_tags)) {
      hitsByStore.get(store)!.push(hit);
    }
  }

  return STORES.map(store => ({ store, hits: hitsByStore.get(store)! }))
    .filter(({ hits }) => hits.length > 0);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = String(req.query['q'] ?? '').trim();
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));

  if (!q) return res.status(400).json({ error: 'q is required' });

  const userAgent =
    process.env['CALORIE_SEARCH_USER_AGENT'] ?? 'CalorieSearch-AUNZ/1.0';

  const fetchOpts: RequestInit = { headers: { 'User-Agent': userAgent } };

  try {
    if (isBarcode(q)) {
      const response = await fetchWithTimeout(buildBarcodeProductUrl(q), fetchOpts);
      if (response.status === 429) {
        return res.status(429).json({ error: 'rate-limited' });
      }
      if (!response.ok) {
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');
        return res.status(200).json({
          results: [],
          total: 0,
          page: 1,
          pageSize: PAGE_SIZE,
        } satisfies SearchResponse);
      }

      const data = await response.json() as { product?: RawProduct };
      const product = data.product ? normalizeProduct({ ...data.product }) : null;
      const results = product
        ? await addValidatedWoolworthsLinks([product], { userAgent })
        : [];

      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');
      return res.status(200).json({
        results,
        total: results.length,
        page: 1,
        pageSize: PAGE_SIZE,
      } satisfies SearchResponse);
    }

    const responses = await Promise.allSettled(
      STORES.map(store => fetchWithTimeout(buildStoreUrl(q, store), fetchOpts)),
    );

    if (responses.some(r => r.status === 'fulfilled' && r.value.status === 429)) {
      return res.status(429).json({ error: 'rate-limited' });
    }

    const hitsByStore: Array<{ store: AUStore; hits: RawProduct[] }> = [];
    const hasStoreQueryFailures = responses.some(r => (
      r.status !== 'fulfilled' || !r.value.ok
    ));
    for (let i = 0; i < STORES.length; i++) {
      const response = responses[i];
      const store = STORES[i];
      if (response?.status === 'fulfilled' && response.value.ok && store) {
        hitsByStore.push({ store, hits: extractHits(await response.value.json()) });
      }
    }

    if (hasStoreQueryFailures) {
      try {
        const taggedFallbackResponse = await fetchWithTimeout(
          buildTaggedFallbackSearchUrl(q),
          fetchOpts,
        );
        if (taggedFallbackResponse.status === 429) {
          return res.status(429).json({ error: 'rate-limited' });
        }
        if (taggedFallbackResponse.ok) {
          hitsByStore.push(...groupHitsByStoreTags(
            extractHits(await taggedFallbackResponse.json()),
          ));
        }
      } catch {
        // If the tagged fallback is unavailable, use successful store queries or the final fallback below.
      }
    }

    let usedHydratedFallback = false;
    if (hitsByStore.length === 0) {
      const fallbackResponse = await fetchWithTimeout(buildFallbackSearchUrl(q), fetchOpts);
      if (fallbackResponse.status === 429) {
        return res.status(429).json({ error: 'rate-limited' });
      }
      if (!fallbackResponse.ok) {
        return res.status(502).json({ error: 'provider-unavailable' });
      }
      hitsByStore.push(...await hydrateStoreTagsFromProducts(
        extractHits(await fallbackResponse.json()),
        fetchOpts,
      ));
      usedHydratedFallback = true;
    }

    const merged = usedHydratedFallback
      ? dedupeAndMergeStores(hitsByStore)
      : await hydrateProductsWithStoreTags(dedupeAndMergeStores(hitsByStore), fetchOpts);

    const normalized = merged
      .map(normalizeProduct)
      .filter((p): p is Product => p !== null)
      .sort((a, b) => {
        const scoreDiff = scoreProduct(b, q) - scoreProduct(a, q);
        return scoreDiff || a.kcalPer100g - b.kcalPer100g;
      });

    const total = normalized.length;
    const start = (page - 1) * PAGE_SIZE;
    const results = await addValidatedWoolworthsLinks(
      normalized.slice(start, start + PAGE_SIZE),
      { userAgent },
    );

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    return res.status(200).json({
      results,
      total,
      page,
      pageSize: PAGE_SIZE,
    } satisfies SearchResponse);
  } catch {
    return res.status(502).json({ error: 'provider-unavailable' });
  }
}
