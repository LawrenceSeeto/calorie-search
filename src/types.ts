export interface Product {
  code: string;
  name: string;
  brand: string;
  kcalPer100g: number;
  proteinPer100g: number | null;
  fatPer100g: number | null;
  carbsPer100g: number | null;
  quantity: string | null;
  servingSize: string | null;
  servingGrams: number | null;
  countries: string[];
  colesUrl: string | null;
  woolworthsUrl: string | null;
  aldiUrl: string | null;
  igaUrl: string | null;
  costcoUrl: string | null;
  sourceUrl: string;
}

export interface SearchResponse {
  results: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export type ErrorType = 'rate-limited' | 'provider-unavailable' | 'network';

export interface SearchState {
  phase: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  results: Product[];
  total: number;
  query: string;
  errorType: ErrorType | null;
}

export interface SelectedProduct {
  product: Product;
  grams: number;
}

export type MealType = 'any' | 'breakfast' | 'lunch-dinner' | 'snack';
export type PrepStyle = 'any' | 'no-cook' | 'quick' | 'cooked';

export interface RecipePreference {
  maxKcal: number;
  servings: number;
  mealType: MealType;
  prepStyle: PrepStyle;
}

export interface RecipeIngredient {
  name: string;
  grams: number;
  kcal: number;
  isStaple: boolean;
}

export interface NutritionEstimate {
  kcalPer100g: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
}

export interface RecipeRecommendation {
  id: string;
  title: string;
  templateId: string;
  nutrition: NutritionEstimate;
  usedProducts: SelectedProduct[];
  staples: RecipeIngredient[];
  steps: string[];
  prepTimeBand: 'no-cook' | 'quick' | 'cooked';
  mealTypes: MealType[];
  whyRecommended: string;
}

export type RecipeWarning = 'insufficient-data' | 'no-templates-match';
