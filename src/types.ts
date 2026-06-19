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
  countries: string[];
  colesUrl: string;
  woolworthsUrl: string;
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
