import { describe, it, expect } from 'vitest';
import { normalizeKcal, dedupeByCode, normalizeProduct } from '../search';

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
