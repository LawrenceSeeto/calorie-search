import type { SelectedProduct, RecipePreference } from '../types';

const BASKET_KEY = 'calorie-search-basket-v1';
const SCHEMA_VERSION = 1;

interface StoredBasket {
  version: number;
  items: SelectedProduct[];
  preferences: RecipePreference;
}

export function loadBasket(): { items: SelectedProduct[]; preferences: RecipePreference } | null {
  try {
    const raw = localStorage.getItem(BASKET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBasket;
    if (parsed.version !== SCHEMA_VERSION) return null;
    return { items: parsed.items, preferences: parsed.preferences };
  } catch {
    return null;
  }
}

export function saveBasket(items: SelectedProduct[], preferences: RecipePreference): void {
  try {
    const data: StoredBasket = { version: SCHEMA_VERSION, items, preferences };
    localStorage.setItem(BASKET_KEY, JSON.stringify(data));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}
