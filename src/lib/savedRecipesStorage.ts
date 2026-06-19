import type { RecipeRecommendation } from '../types';

const KEY = 'calorie-search-saved-recipes-v1';

export function loadSavedRecipes(): RecipeRecommendation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecipeRecommendation[];
  } catch {
    return [];
  }
}

export function saveSavedRecipes(recipes: RecipeRecommendation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(recipes));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}
