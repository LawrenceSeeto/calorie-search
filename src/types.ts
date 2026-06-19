export interface Product {
  code: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  kcalPer100g: number;
  quantity: string | null;
  servingSize: string | null;
  countries: string[];
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
