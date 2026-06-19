import { useState, useReducer, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import SearchForm from './components/SearchForm';
import SearchChips from './components/SearchChips';
import SearchStatus from './components/SearchStatus';
import ProductGrid from './components/ProductGrid';
import EmptyState from './components/EmptyState';
import RecipeBasket from './components/RecipeBasket';
import RecipeResults from './components/RecipeResults';
import type {
  SearchState,
  SearchResponse,
  ErrorType,
  Product,
  SelectedProduct,
  RecipePreference,
  RecipeRecommendation,
} from './types';
import { loadBasket, saveBasket } from './lib/basketStorage';
import { loadSavedRecipes, saveSavedRecipes } from './lib/savedRecipesStorage';

// ─── Basket reducer ───────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: RecipePreference = {
  maxKcal: 200,
  servings: 1,
  mealType: 'any',
  prepStyle: 'any',
};

interface BasketState {
  items: SelectedProduct[];
  preferences: RecipePreference;
}

type BasketAction =
  | { type: 'ADD'; product: Product }
  | { type: 'REMOVE'; code: string }
  | { type: 'SET_GRAMS'; code: string; grams: number }
  | { type: 'CLEAR' }
  | { type: 'SET_PREFERENCES'; prefs: RecipePreference };

function basketReducer(state: BasketState, action: BasketAction): BasketState {
  switch (action.type) {
    case 'ADD': {
      if (state.items.some(i => i.product.code === action.product.code)) return state;
      return { ...state, items: [...state.items, { product: action.product, grams: 100 }] };
    }
    case 'REMOVE':
      return { ...state, items: state.items.filter(i => i.product.code !== action.code) };
    case 'SET_GRAMS':
      return {
        ...state,
        items: state.items.map(i =>
          i.product.code === action.code ? { ...i, grams: action.grams } : i,
        ),
      };
    case 'CLEAR':
      return { ...state, items: [] };
    case 'SET_PREFERENCES':
      return { ...state, preferences: action.prefs };
    default:
      return state;
  }
}

// ─── Error type derivation ────────────────────────────────────────────────────

function getErrorType(error: Error | null): ErrorType | null {
  if (!error) return null;
  const e = error as Error & { status?: number };
  if (e.status === 429) return 'rate-limited';
  if (e.status && e.status >= 400) return 'provider-unavailable';
  if (error.message === 'rate-limited') return 'rate-limited';
  if (error.message === 'provider-unavailable') return 'provider-unavailable';
  return 'network';
}

// ─── App ──────────────────────────────────────────────────────────────────────

const stored = loadBasket();

export default function App() {
  const [submittedQuery, setSubmittedQuery] = useState('');

  const [basket, dispatch] = useReducer(basketReducer, {
    items: stored?.items ?? [],
    preferences: stored?.preferences ?? DEFAULT_PREFERENCES,
  });

  // Persist basket to localStorage on every change
  useEffect(() => {
    saveBasket(basket.items, basket.preferences);
  }, [basket.items, basket.preferences]);

  // ── Saved recipes ─────────────────────────────────────────────────────────────
  const [savedRecipes, setSavedRecipes] = useState<RecipeRecommendation[]>(
    () => loadSavedRecipes(),
  );

  useEffect(() => {
    saveSavedRecipes(savedRecipes);
  }, [savedRecipes]);

  const savedIds = useMemo(() => new Set(savedRecipes.map(r => r.id)), [savedRecipes]);

  const handleToggleSave = useCallback((recipe: RecipeRecommendation) => {
    setSavedRecipes(prev =>
      prev.some(r => r.id === recipe.id)
        ? prev.filter(r => r.id !== recipe.id)
        : [...prev, recipe],
    );
  }, []);

  // ── Search query ─────────────────────────────────────────────────────────────
  const { data, isLoading, isError, error, refetch } = useQuery<SearchResponse, Error>({
    queryKey: ['search', submittedQuery],
    queryFn: async ({ signal }) => {
      const url = new URL('/api/search', window.location.origin);
      url.searchParams.set('q', submittedQuery);
      const res = await fetch(url, { signal });
      if (res.status === 429) {
        const err = new Error('rate-limited') as Error & { status: number };
        err.status = 429;
        throw err;
      }
      if (!res.ok) {
        const err = new Error('provider-unavailable') as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return res.json() as Promise<SearchResponse>;
    },
    enabled: submittedQuery.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const searchState: SearchState = {
    phase: !submittedQuery
      ? 'idle'
      : isLoading
        ? 'loading'
        : isError
          ? 'error'
          : !data?.results?.length
            ? 'empty'
            : 'success',
    results: data?.results ?? [],
    total: data?.total ?? 0,
    query: submittedQuery,
    errorType: isError ? getErrorType(error) : null,
  };

  const retry = useCallback(() => void refetch(), [refetch]);

  // ── Basket callbacks ──────────────────────────────────────────────────────────
  const handleAddToBasket = useCallback((product: Product) => {
    dispatch({ type: 'ADD', product });
  }, []);

  const handleSetGrams = useCallback((code: string, grams: number) => {
    dispatch({ type: 'SET_GRAMS', code, grams });
  }, []);

  const handleRemove = useCallback((code: string) => {
    dispatch({ type: 'REMOVE', code });
  }, []);

  const handleClear = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const handlePreferencesChange = useCallback((prefs: RecipePreference) => {
    dispatch({ type: 'SET_PREFERENCES', prefs });
  }, []);

  const basketCodes = new Set(basket.items.map(i => i.product.code));

  return (
    <>
      <header>
        <h1>Calorie Search</h1>
        <p>Find the lowest-calorie products for any food — sorted by kcal per 100g · Australia &amp; New Zealand</p>
        <p className="free-note">Free to use — no account needed.</p>
        <SearchForm onSearch={setSubmittedQuery} disabled={isLoading} />
        {searchState.phase === 'idle' && <SearchChips onSearch={setSubmittedQuery} />}
      </header>

      <div className="app-layout">
        {/* Left: search results */}
        <main>
          <div className="status" aria-live="polite" aria-atomic="true">
            <SearchStatus state={searchState} onRetry={retry} />
          </div>
          {searchState.phase === 'success' && (
            <ProductGrid
              results={searchState.results}
              total={searchState.total}
              query={searchState.query}
              basketCodes={basketCodes}
              onAddToBasket={handleAddToBasket}
            />
          )}
          {(searchState.phase === 'idle' || searchState.phase === 'empty') && (
            <EmptyState phase={searchState.phase} query={searchState.query} />
          )}
        </main>

        {/* Right: basket + recipe suggestions */}
        <div className="basket-column">
          <RecipeBasket
            items={basket.items}
            preferences={basket.preferences}
            onSetGrams={handleSetGrams}
            onRemove={handleRemove}
            onClear={handleClear}
            onPreferencesChange={handlePreferencesChange}
          />
          <RecipeResults
            items={basket.items}
            preferences={basket.preferences}
            savedIds={savedIds}
            savedRecipes={savedRecipes}
            onToggleSave={handleToggleSave}
          />
        </div>
      </div>
    </>
  );
}
