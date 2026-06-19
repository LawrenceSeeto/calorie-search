import { describe, it, expect } from 'vitest';
import { classifyProduct, generateRecipes } from '../recipeEngine';
import type { SelectedProduct, RecipePreference } from '../../types';

const BASE_PREFS: RecipePreference = {
  maxKcal: 500,
  servings: 1,
  mealType: 'any',
  prepStyle: 'any',
};

function mockProduct(overrides: Partial<{
  code: string; name: string; brand: string;
  kcalPer100g: number; proteinPer100g: number | null;
  fatPer100g: number | null; carbsPer100g: number | null;
}>): SelectedProduct['product'] {
  return {
    code: overrides.code ?? '123',
    name: overrides.name ?? 'Test Product',
    brand: overrides.brand ?? '',
    kcalPer100g: overrides.kcalPer100g ?? 100,
    proteinPer100g: overrides.proteinPer100g ?? null,
    fatPer100g: overrides.fatPer100g ?? null,
    carbsPer100g: overrides.carbsPer100g ?? null,
    quantity: null,
    servingSize: null,
    servingGrams: null,
    countries: [],
    colesUrl: '',
    woolworthsUrl: '',
    imageUrl: null,
    sourceUrl: '',
  };
}

function sel(product: SelectedProduct['product'], grams = 100): SelectedProduct {
  return { product, grams };
}

// ─── classifyProduct ──────────────────────────────────────────────────────────

describe('classifyProduct', () => {
  it('classifies high-protein low-fat as protein', () => {
    const p = mockProduct({ proteinPer100g: 20, fatPer100g: 5, carbsPer100g: 2 });
    expect(classifyProduct(p)).toBe('protein');
  });

  it('classifies high-fat low-carb as fat-source', () => {
    const p = mockProduct({ proteinPer100g: 1, fatPer100g: 30, carbsPer100g: 5 });
    expect(classifyProduct(p)).toBe('fat-source');
  });

  it('classifies high-carb as grain', () => {
    const p = mockProduct({ name: 'Rolled Oats', proteinPer100g: 5, fatPer100g: 4, carbsPer100g: 65 });
    expect(classifyProduct(p)).toBe('grain');
  });

  it('classifies yogurt by name as dairy', () => {
    const p = mockProduct({ name: 'Greek Yoghurt', proteinPer100g: 9, fatPer100g: 3, carbsPer100g: 4 });
    expect(classifyProduct(p)).toBe('dairy');
  });

  it('classifies chocolate biscuit as sweet', () => {
    const p = mockProduct({ name: 'Chocolate Biscuit', proteinPer100g: 4, fatPer100g: 18, carbsPer100g: 65 });
    expect(classifyProduct(p)).toBe('sweet');
  });

  it('classifies very low kcal as produce-like', () => {
    const p = mockProduct({ kcalPer100g: 17, proteinPer100g: null, fatPer100g: null, carbsPer100g: null });
    expect(classifyProduct(p)).toBe('produce-like');
  });

  it('classifies sauce by name', () => {
    const p = mockProduct({ name: 'Sweet Chilli Sauce', kcalPer100g: 180, proteinPer100g: 1, fatPer100g: 0, carbsPer100g: 42 });
    expect(classifyProduct(p)).toBe('sauce');
  });
});

// ─── generateRecipes ─────────────────────────────────────────────────────────

describe('generateRecipes', () => {
  it('returns empty with no items', () => {
    const result = generateRecipes([], BASE_PREFS);
    expect(result.recipes).toHaveLength(0);
    expect(result.warning).toBeNull();
  });

  it('returns insufficient-data warning when no products have full macros', () => {
    const items = [sel(mockProduct({ kcalPer100g: 200 }))];
    const result = generateRecipes(items, BASE_PREFS);
    expect(result.warning).toBe('insufficient-data');
    expect(result.recipes).toHaveLength(0);
  });

  it('returns recipes when a dairy product with full macros is in basket', () => {
    const yogurt = mockProduct({
      code: 'yogurt',
      name: 'Greek Yoghurt Plain',
      kcalPer100g: 97,
      proteinPer100g: 10,
      fatPer100g: 5,
      carbsPer100g: 4,
    });
    const result = generateRecipes([sel(yogurt, 150)], BASE_PREFS);
    expect(result.warning).toBeNull();
    expect(result.recipes.length).toBeGreaterThan(0);
  });

  it('recipe nutrition stays under maxKcal', () => {
    const yogurt = mockProduct({
      code: 'yogurt',
      name: 'Greek Yoghurt Plain',
      kcalPer100g: 97,
      proteinPer100g: 10,
      fatPer100g: 5,
      carbsPer100g: 4,
    });
    const prefs: RecipePreference = { ...BASE_PREFS, maxKcal: 300 };
    const result = generateRecipes([sel(yogurt, 150)], prefs);
    for (const recipe of result.recipes) {
      expect(recipe.nutrition.kcalPerServing).toBeLessThanOrEqual(300);
    }
  });

  it('returns no-templates-match when budget is impossibly low', () => {
    const oats = mockProduct({
      code: 'oats',
      name: 'Rolled Oats',
      kcalPer100g: 389,
      proteinPer100g: 13,
      fatPer100g: 7,
      carbsPer100g: 66,
    });
    const prefs: RecipePreference = { ...BASE_PREFS, maxKcal: 10 };
    const result = generateRecipes([sel(oats, 100)], prefs);
    expect(result.warning).toBe('no-templates-match');
  });

  it('filters by meal type preference', () => {
    const yogurt = mockProduct({
      code: 'yogurt',
      name: 'Greek Yoghurt',
      kcalPer100g: 97,
      proteinPer100g: 10,
      fatPer100g: 5,
      carbsPer100g: 4,
    });
    const prefs: RecipePreference = { ...BASE_PREFS, mealType: 'lunch-dinner' };
    const result = generateRecipes([sel(yogurt, 150)], prefs);
    for (const recipe of result.recipes) {
      expect(recipe.mealTypes.some(m => m === 'lunch-dinner')).toBe(true);
    }
  });

  it('recipe includes staple ingredients', () => {
    const yogurt = mockProduct({
      code: 'yogurt',
      name: 'Greek Yoghurt',
      kcalPer100g: 97,
      proteinPer100g: 10,
      fatPer100g: 5,
      carbsPer100g: 4,
    });
    const result = generateRecipes([sel(yogurt, 150)], { ...BASE_PREFS, mealType: 'breakfast' });
    const yogurtBowl = result.recipes.find(r => r.templateId === 'yogurt-bowl');
    if (yogurtBowl) {
      expect(yogurtBowl.staples.length).toBeGreaterThan(0);
      expect(yogurtBowl.staples.every(s => s.isStaple)).toBe(true);
    }
  });
});
