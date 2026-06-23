import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, it, expect, vi } from 'vitest';
import handler, {
  addValidatedWoolworthsLinks,
  dedupeAndMergeStores,
  dedupeByCode,
  findAvailableWoolworthsMatch,
  normalizeKcal,
  normalizeProduct,
  scoreProduct,
} from '../search';
import type { Product } from '../../src/types';

type MockResponse = {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

function makeProduct(overrides: Partial<Product>): Product {
  return {
    code: '1',
    name: 'Product',
    brand: '',
    kcalPer100g: 100,
    proteinPer100g: null,
    fatPer100g: null,
    carbsPer100g: null,
    quantity: null,
    servingSize: null,
    servingGrams: null,
    countries: [],
    colesUrl: null,
    woolworthsUrl: null,
    aldiUrl: null,
    igaUrl: null,
    costcoUrl: null,
    sourceUrl: '',
    ...overrides,
  };
}

function createResponse(): MockResponse {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers,
    status: vi.fn((statusCode: number) => {
      res.statusCode = statusCode;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
    setHeader: vi.fn((name: string, value: string) => {
      res.headers[name] = value;
      return res;
    }),
    end: vi.fn(() => res),
  };
  return res;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeKcal', () => {
  it('uses energy-kcal_100g directly when present', () => {
    expect(normalizeKcal({ 'energy-kcal_100g': 350 })).toBe(350);
  });

  it('converts kJ to kcal when energy-kcal_100g is absent', () => {
    const result = normalizeKcal({ 'energy_100g': 1674 });
    expect(result).not.toBeNull();
    expect(Math.round(result!)).toBe(400);
  });

  it('returns null when neither field is present', () => {
    expect(normalizeKcal({})).toBeNull();
  });

  it('returns null for non-numeric values', () => {
    expect(normalizeKcal({ 'energy-kcal_100g': 'lots' })).toBeNull();
  });
});

describe('dedupeByCode', () => {
  it('removes duplicate products with the same barcode', () => {
    const products = [
      { code: '9300607123456', product_name: 'Tim Tams', brands: "Arnott's" },
      { code: '9300607123456', product_name: 'Tim Tams', brands: "Arnott's" },
      { code: '9300607999999', product_name: 'Vegemite', brands: 'Bega' },
    ];
    const result = dedupeByCode(products);
    expect(result).toHaveLength(2);
    expect(result[0].code).toBe('9300607123456');
    expect(result[1].code).toBe('9300607999999');
  });

  it('deduplicates by name|brand fallback when code is absent', () => {
    const products = [
      { product_name: 'Milo', brands: 'Nestle' },
      { product_name: 'Milo', brands: 'Nestle' },
    ];
    expect(dedupeByCode(products)).toHaveLength(1);
  });

  it('normalizes fallback keys before deduplicating products without codes', () => {
    const products = [
      { product_name: 'Vegemite', brands: 'Bega' },
      { product_name: 'vege-mite', brands: 'Bega!' },
      { product_name: 'Vegemite Reduced Salt', brands: 'Bega' },
    ];
    expect(dedupeByCode(products)).toHaveLength(2);
  });

  it('deduplicates same normalized product identity across different barcodes', () => {
    const products = [
      { code: '1', product_name: 'Vegemite', brands: 'Vegemite' },
      { code: '2', product_name: 'vege-mite', brands: 'Vegemite!' },
      { code: '3', product_name: 'Vegemite Reduced Salt', brands: 'Vegemite' },
    ];
    expect(dedupeByCode(products)).toHaveLength(2);
  });
});

describe('dedupeAndMergeStores', () => {
  it('adds the source store tag to a product from one store query', () => {
    const result = dedupeAndMergeStores([
      {
        store: 'woolworths',
        hits: [{ code: '1', product_name: 'Tim Tam', brands: "Arnott's" }],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.stores_tags).toEqual(['woolworths']);
  });

  it('merges the same product from multiple store queries', () => {
    const result = dedupeAndMergeStores([
      {
        store: 'woolworths',
        hits: [{ code: '1', product_name: 'Tim Tam', brands: "Arnott's" }],
      },
      {
        store: 'coles',
        hits: [{ code: '2', product_name: 'Tim-Tam', brands: "Arnott's!" }],
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.stores_tags).toEqual(['woolworths', 'coles']);
  });

  it('keeps different products as separate entries', () => {
    const result = dedupeAndMergeStores([
      {
        store: 'woolworths',
        hits: [{ code: '1', product_name: 'Tim Tam', brands: "Arnott's" }],
      },
      {
        store: 'coles',
        hits: [{ code: '2', product_name: 'Vegemite', brands: 'Bega' }],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result.map(p => p.stores_tags)).toEqual([['woolworths'], ['coles']]);
  });
});

describe('scoreProduct', () => {
  it('scores exact name matches above partial matches', () => {
    const exact = makeProduct({ name: 'Tim Tams', brand: "Arnott's" });
    const partial = makeProduct({ name: 'Low Calorie Tim Tams Alternative', brand: 'Other' });

    expect(scoreProduct(exact, 'tim tams')).toBeGreaterThan(scoreProduct(partial, 'tim tams'));
  });

  it('adds brand relevance to the score', () => {
    const branded = makeProduct({ name: 'Spread', brand: 'Vegemite' });
    const unbranded = makeProduct({ name: 'Spread', brand: 'Other' });

    expect(scoreProduct(branded, 'vegemite')).toBeGreaterThan(scoreProduct(unbranded, 'vegemite'));
  });

  it('scores non-adjacent multi-word query tokens in product names', () => {
    const multiWord = makeProduct({ name: 'Chobani Plain Greek Yoghurt', brand: 'Chobani' });
    const singleToken = makeProduct({ name: 'Natural Yoghurt', brand: 'Other' });

    expect(scoreProduct(multiWord, 'greek yoghurt')).toBeGreaterThan(
      scoreProduct(singleToken, 'greek yoghurt'),
    );
  });

  it('scores exact matches above prefix matches above contains matches', () => {
    const exact = makeProduct({ name: 'Tim Tams' });
    const prefix = makeProduct({ name: 'Tim Tams Classic' });
    const contains = makeProduct({ name: 'Low Calorie Tim Tams Alternative' });

    expect(scoreProduct(exact, 'tim tams')).toBeGreaterThan(scoreProduct(prefix, 'tim tams'));
    expect(scoreProduct(prefix, 'tim tams')).toBeGreaterThan(scoreProduct(contains, 'tim tams'));
  });

  it('adds tokenized brand relevance to the score', () => {
    const branded = makeProduct({ name: 'Breakfast Cereal', brand: 'Uncle Tobys' });
    const unbranded = makeProduct({ name: 'Breakfast Cereal', brand: 'Other' });

    expect(scoreProduct(branded, 'uncle cereal')).toBeGreaterThan(
      scoreProduct(unbranded, 'uncle cereal'),
    );
  });
});

describe('normalizeProduct', () => {
  it('returns null when no calorie data is available', () => {
    const result = normalizeProduct({
      code: '123',
      product_name: 'Mystery Food',
      nutriments: {},
    });
    expect(result).toBeNull();
  });

  it('normalizes a product with kcal data', () => {
    const result = normalizeProduct({
      code: '9300607123456',
      product_name: 'Tim Tams',
      brands: "Arnott's",
      nutriments: { 'energy-kcal_100g': 500, proteins_100g: 5, fat_100g: 26, carbohydrates_100g: 59 },
      quantity: '200g',
      serving_size: '25g',
      countries_tags: ['en:australia'],
    });
    expect(result).not.toBeNull();
    expect(result!.kcalPer100g).toBe(500);
    expect(result!.name).toBe('Tim Tams');
    expect(result!.code).toBe('9300607123456');
    expect(result!.countries).toEqual(['en:australia']);
  });

  it('sets a Woolworths search URL during normalization', () => {
    const result = normalizeProduct({
      code: '9300652810257',
      product_name: 'Weet-Bix for kids',
      brands: 'Sanitarium',
      nutriments: { 'energy-kcal_100g': 350 },
      stores_tags: ['woolworths'],
    });

    expect(result).not.toBeNull();
    expect(result!.colesUrl).toBeNull();
    expect(result!.woolworthsUrl).toBe(
      'https://www.woolworths.com.au/shop/search/products?searchTerm=Weet-Bix%20for%20kids%20Sanitarium',
    );
  });

  it('sets Coles and Woolworths search URLs from stores_tags', () => {
    const result = normalizeProduct({
      code: '9300652810257',
      product_name: 'Weet-Bix for kids',
      brands: 'Sanitarium',
      nutriments: { 'energy-kcal_100g': 350 },
      stores_tags: ['coles', 'woolworths'],
    });

    expect(result).not.toBeNull();
    expect(result!.colesUrl).toBe(
      'https://www.coles.com.au/search?q=Weet-Bix%20for%20kids%20Sanitarium',
    );
    expect(result!.woolworthsUrl).toBe(
      'https://www.woolworths.com.au/shop/search/products?searchTerm=Weet-Bix%20for%20kids%20Sanitarium',
    );
  });

  it('sets no retailer URLs when stores_tags is absent or empty', () => {
    const withoutStores = normalizeProduct({
      code: '9300652810257',
      product_name: 'Weet-Bix for kids',
      brands: 'Sanitarium',
      nutriments: { 'energy-kcal_100g': 350 },
    });
    const emptyStores = normalizeProduct({
      code: '9300652810257',
      product_name: 'Weet-Bix for kids',
      brands: 'Sanitarium',
      nutriments: { 'energy-kcal_100g': 350 },
      stores_tags: [],
    });

    expect(withoutStores).not.toBeNull();
    expect(emptyStores).not.toBeNull();
    expect(withoutStores!.colesUrl).toBeNull();
    expect(withoutStores!.woolworthsUrl).toBeNull();
    expect(emptyStores!.colesUrl).toBeNull();
    expect(emptyStores!.woolworthsUrl).toBeNull();
  });

  it('sets ALDI URL from stores_tags', () => {
    const result = normalizeProduct({
      code: '123',
      product_name: 'Corn Thins',
      brands: 'Real Foods',
      nutriments: { 'energy-kcal_100g': 380 },
      stores_tags: ['aldi'],
    });
    expect(result).not.toBeNull();
    expect(result!.aldiUrl).toBe(
      'https://www.aldi.com.au/en/groceries/search/?q=Corn%20Thins%20Real%20Foods',
    );
    expect(result!.igaUrl).toBeNull();
    expect(result!.costcoUrl).toBeNull();
  });

  it('sets IGA URL from stores_tags', () => {
    const result = normalizeProduct({
      code: '123',
      product_name: 'Milk',
      brands: 'Dairy Farmers',
      nutriments: { 'energy-kcal_100g': 60 },
      stores_tags: ['iga-supermarkets'],
    });
    expect(result).not.toBeNull();
    expect(result!.igaUrl).toBe(
      'https://www.iga.com.au/?post_type=product&s=Milk%20Dairy%20Farmers',
    );
    expect(result!.aldiUrl).toBeNull();
    expect(result!.costcoUrl).toBeNull();
  });

  it('sets Costco URL from stores_tags', () => {
    const result = normalizeProduct({
      code: '123',
      product_name: 'Kirkland Almonds',
      brands: 'Kirkland',
      nutriments: { 'energy-kcal_100g': 580 },
      stores_tags: ['costco'],
    });
    expect(result).not.toBeNull();
    expect(result!.costcoUrl).toBe(
      'https://www.costco.com.au/c/search?query=Kirkland%20Almonds%20Kirkland',
    );
    expect(result!.aldiUrl).toBeNull();
    expect(result!.igaUrl).toBeNull();
  });

  it('sets multiple retailer URLs when product is in multiple stores', () => {
    const result = normalizeProduct({
      code: '123',
      product_name: 'Natural Muesli',
      brands: 'Uncle Tobys',
      nutriments: { 'energy-kcal_100g': 370 },
      stores_tags: ['woolworths', 'coles', 'aldi'],
    });
    expect(result).not.toBeNull();
    expect(result!.colesUrl).not.toBeNull();
    expect(result!.aldiUrl).not.toBeNull();
    expect(result!.woolworthsUrl).not.toBeNull();
    expect(result!.igaUrl).toBeNull();
    expect(result!.costcoUrl).toBeNull();
  });

  it('normalizes a product using kJ fallback', () => {
    const result = normalizeProduct({
      code: '456',
      nutriments: { 'energy_100g': 1674 },
    });
    expect(result).not.toBeNull();
    expect(Math.round(result!.kcalPer100g)).toBe(400);
  });

  it('empty-after-filter: array of products with no calorie data yields empty results', () => {
    const raw = [
      { code: '1', nutriments: {} },
      { code: '2', nutriments: { energy_100g: 'unknown' } },
      { code: '3' },
    ];
    const normalized = raw
      .map(normalizeProduct)
      .filter((p): p is NonNullable<typeof p> => p !== null);
    expect(normalized).toHaveLength(0);
  });
});

describe('findAvailableWoolworthsMatch', () => {
  it('matches an available Woolworths product by exact barcode', () => {
    const data = {
      Products: [
        {
          Products: [
            {
              Barcode: '9352042000328',
              Stockcode: 796439,
              UrlFriendlyName: 'vegemite-spread',
              IsAvailable: true,
              IsInStock: true,
            },
          ],
        },
      ],
    };

    expect(findAvailableWoolworthsMatch(data, '9352042000328')).toMatchObject({
      Stockcode: 796439,
    });
  });

  it('rejects Woolworths products that are unavailable, out of stock, or barcode mismatched', () => {
    expect(findAvailableWoolworthsMatch({
      Products: [{ Products: [{ Barcode: '9352042000328', IsAvailable: false, IsInStock: true }] }],
    }, '9352042000328')).toBeNull();

    expect(findAvailableWoolworthsMatch({
      Products: [{ Products: [{ Barcode: '9352042000328', IsAvailable: true, IsInStock: false }] }],
    }, '9352042000328')).toBeNull();

    expect(findAvailableWoolworthsMatch({
      Products: [{ Products: [{ Barcode: '1111111111111', IsAvailable: true, IsInStock: true }] }],
    }, '9352042000328')).toBeNull();
  });
});

describe('addValidatedWoolworthsLinks', () => {
  it('adds a direct Woolworths URL only when the catalog confirms availability', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      Products: [
        {
          Products: [
            {
              Barcode: '9352042000328',
              Stockcode: 796439,
              UrlFriendlyName: 'vegemite-spread',
              IsAvailable: true,
              IsInStock: true,
            },
          ],
        },
      ],
    })));
    const [result] = await addValidatedWoolworthsLinks([
      makeProduct({
        code: '9352042000328',
        name: 'Vegemite',
        brand: 'Vegemite',
      }),
    ], { fetchImpl, userAgent: 'Test-Agent' });

    expect(result!.woolworthsUrl).toBe(
      'https://www.woolworths.com.au/shop/productdetails/796439/vegemite-spread',
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('keeps Woolworths URL hidden when catalog validation fails', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      Products: [{ Products: [{ Barcode: '9352042000329', IsAvailable: false }] }],
    })));
    const [result] = await addValidatedWoolworthsLinks([
      makeProduct({
        code: '9352042000329',
        name: 'Vegemite',
        brand: 'Vegemite',
      }),
    ], { fetchImpl });

    expect(result!.woolworthsUrl).toBeNull();
  });

  it('reuses the module-level Woolworths URL cache for repeated barcodes', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      Products: [
        {
          Products: [
            {
              Barcode: '9300000999999',
              Stockcode: 123456,
              UrlFriendlyName: 'cached-product',
              IsAvailable: true,
              IsInStock: true,
            },
          ],
        },
      ],
    })));
    const product = makeProduct({
      code: '9300000999999',
      name: 'Cached Product',
      brand: 'Test',
    });

    const [first] = await addValidatedWoolworthsLinks([product], { fetchImpl });
    const [second] = await addValidatedWoolworthsLinks([product], { fetchImpl });

    expect(first!.woolworthsUrl).toBe(
      'https://www.woolworths.com.au/shop/productdetails/123456/cached-product',
    );
    expect(second!.woolworthsUrl).toBe(first!.woolworthsUrl);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('caps Woolworths validation fetches at five concurrent requests', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchImpl = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight--;
      return new Response(JSON.stringify({ Products: [] }));
    });
    const products = Array.from({ length: 12 }, (_, index) => makeProduct({
      code: `93000000000${String(index).padStart(2, '0')}`,
      name: `Product ${index}`,
      brand: 'Test',
    }));

    await addValidatedWoolworthsLinks(products, { fetchImpl });

    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(fetchImpl).toHaveBeenCalledTimes(12);
  });
});

describe('handler barcode search', () => {
  it('uses the OFN product endpoint and skips store fan-out for barcode queries', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/v2/product/9300625122861')) {
        return new Response(JSON.stringify({
          product: {
            code: '9300625122861',
            product_name: 'Chobani Plain Greek Yoghurt',
            brands: 'Chobani',
            nutriments: { 'energy-kcal_100g': 90 },
            quantity: '907g',
            serving_size: '170g',
            countries_tags: ['en:australia'],
            stores_tags: ['woolworths', 'coles'],
          },
        }));
      }

      if (url.includes('woolworths.com.au/apis/ui/Search/products')) {
        return new Response(JSON.stringify({
          Products: [
            {
              Products: [
                {
                  Barcode: '9300625122861',
                  Stockcode: 654321,
                  UrlFriendlyName: 'chobani-plain-greek-yoghurt',
                  IsAvailable: true,
                  IsInStock: true,
                },
              ],
            },
          ],
        }));
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl);
    const res = createResponse();

    await handler(
      { method: 'GET', query: { q: '9300625122861' } } as unknown as VercelRequest,
      res as unknown as VercelResponse,
    );

    const fetchedUrls = fetchImpl.mock.calls.map(([input]) => String(input));
    const productUrl = new URL(fetchedUrls[0]!);
    expect(res.statusCode).toBe(200);
    expect(productUrl.pathname).toBe('/api/v2/product/9300625122861');
    expect(productUrl.searchParams.get('fields')).toBe(
      'code,product_name,brands,nutriments,quantity,serving_size,countries_tags,stores_tags',
    );
    expect(fetchedUrls.some(url => url.includes('/cgi/search.pl'))).toBe(false);
    expect(fetchedUrls.some(url => url.includes('search.openfoodfacts.org/search'))).toBe(false);
    expect(res.headers['Cache-Control']).toBe('s-maxage=3600, stale-while-revalidate=300');
    expect(res.body).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 20,
      results: [
        {
          code: '9300625122861',
          name: 'Chobani Plain Greek Yoghurt',
          colesUrl: 'https://www.coles.com.au/search?q=Chobani%20Plain%20Greek%20Yoghurt%20Chobani',
          woolworthsUrl: 'https://www.woolworths.com.au/shop/productdetails/654321/chobani-plain-greek-yoghurt',
        },
      ],
    });
  });
});
