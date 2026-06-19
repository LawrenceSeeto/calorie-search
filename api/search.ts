import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Product, SearchResponse } from '../src/types';

const OFN_SEARCH_URL = 'https://search.openfoodfacts.org/search';
const PAGE_SIZE = 20;

type Nutriments = Record<string, unknown>;
type RawProduct = {
  code?: unknown;
  product_name?: unknown;
  brands?: unknown;
  nutriments?: Nutriments;
  quantity?: unknown;
  serving_size?: unknown;
  countries_tags?: unknown;
};

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

export function dedupeByCode(products: RawProduct[]): RawProduct[] {
  const seen = new Set<string>();
  return products.filter(p => {
    const key = String(p.code || `${p.product_name}|${p.brands}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeProduct(p: RawProduct): Product | null {
  const n = p.nutriments ?? {};
  const kcalPer100g = normalizeKcal(n);
  if (kcalPer100g === null) return null;

  return {
    code: String(p.code ?? ''),
    name: String(p.product_name ?? 'Unknown product'),
    brand: String(p.brands ?? ''),
    kcalPer100g: Math.round(kcalPer100g),
    proteinPer100g: normalizeMacro(n['proteins_100g']),
    fatPer100g:     normalizeMacro(n['fat_100g']),
    carbsPer100g:   normalizeMacro(n['carbohydrates_100g']),
    quantity: typeof p.quantity === 'string' ? p.quantity : null,
    servingSize: typeof p.serving_size === 'string' ? p.serving_size : null,
    countries: Array.isArray(p.countries_tags) ? p.countries_tags.map(String) : [],
    colesUrl: `https://www.coles.com.au/search?q=${encodeURIComponent(String(p.code || p.product_name || ''))}`,
    woolworthsUrl: `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(String(p.code || p.product_name || ''))}`,
  };
}

function buildUrl(q: string, country: string): string {
  const url = new URL(OFN_SEARCH_URL);
  url.searchParams.set('q', q);
  url.searchParams.set('countries_tags', `en:${country}`);
  url.searchParams.set('fields', 'code,product_name,brands,nutriments,quantity,serving_size,countries_tags');
  url.searchParams.set('page_size', '60');
  return url.toString();
}

function extractHits(data: unknown): RawProduct[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  // search-a-licious returns `hits`; v2 API returns `products`
  const arr = d['hits'] ?? d['products'];
  return Array.isArray(arr) ? (arr as RawProduct[]) : [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = String(req.query['q'] ?? '').trim();
  const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10));

  if (!q) return res.status(400).json({ error: 'q is required' });

  const userAgent =
    process.env['CALORIE_SEARCH_USER_AGENT'] ?? 'CalorieSearch-AUNZ/1.0';

  const fetchOpts = { headers: { 'User-Agent': userAgent } };

  try {
    const [resAU, resNZ] = await Promise.all([
      fetch(buildUrl(q, 'australia'), fetchOpts),
      fetch(buildUrl(q, 'new-zealand'), fetchOpts),
    ]);

    if (resAU.status === 429 || resNZ.status === 429) {
      return res.status(429).json({ error: 'rate-limited' });
    }

    if (!resAU.ok || !resNZ.ok) {
      return res.status(502).json({ error: 'provider-unavailable' });
    }

    const [dataAU, dataNZ] = await Promise.all([resAU.json(), resNZ.json()]);

    const merged = dedupeByCode([...extractHits(dataAU), ...extractHits(dataNZ)]);

    const normalized = merged
      .map(normalizeProduct)
      .filter((p): p is Product => p !== null)
      .sort((a, b) => a.kcalPer100g - b.kcalPer100g);

    const total = normalized.length;
    const start = (page - 1) * PAGE_SIZE;
    const results = normalized.slice(start, start + PAGE_SIZE);

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
