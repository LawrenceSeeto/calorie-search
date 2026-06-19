import { useRef, useState, useCallback } from 'react';
import SearchForm from './components/SearchForm';
import SearchChips from './components/SearchChips';
import SearchStatus from './components/SearchStatus';
import ProductGrid from './components/ProductGrid';
import EmptyState from './components/EmptyState';
import type { SearchState, SearchResponse } from './types';

const INITIAL: SearchState = {
  phase: 'idle',
  results: [],
  total: 0,
  query: '',
  errorType: null,
};

export default function App() {
  const [state, setState] = useState<SearchState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const currentQueryRef = useRef('');
  const lastQueryRef = useRef('');

  const search = useCallback(async (q: string) => {
    q = q.trim();
    if (!q) {
      setState(INITIAL);
      return;
    }

    currentQueryRef.current = q;
    lastQueryRef.current = q;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setState(s => ({ ...s, phase: 'loading', query: q, results: [], errorType: null }));

    try {
      const url = new URL('/api/search', window.location.origin);
      url.searchParams.set('q', q);
      const res = await fetch(url, { signal });

      if (signal.aborted || q !== currentQueryRef.current) return;

      if (res.status === 429) {
        setState(s => ({ ...s, phase: 'error', errorType: 'rate-limited' }));
        return;
      }
      if (!res.ok) {
        setState(s => ({ ...s, phase: 'error', errorType: 'provider-unavailable' }));
        return;
      }

      const data: SearchResponse = await res.json() as SearchResponse;
      if (signal.aborted || q !== currentQueryRef.current) return;

      setState({
        phase: data.results.length === 0 ? 'empty' : 'success',
        results: data.results,
        total: data.total,
        query: q,
        errorType: null,
      });
    } catch {
      if (signal.aborted || q !== currentQueryRef.current) return;
      setState(s => ({ ...s, phase: 'error', errorType: 'network' }));
    }
  }, []);

  const retry = useCallback(() => {
    if (lastQueryRef.current) void search(lastQueryRef.current);
  }, [search]);

  return (
    <>
      <header>
        <h1>Calorie Search</h1>
        <p>Find the lowest-calorie products for any food — sorted by kcal per 100g · Australia &amp; New Zealand</p>
        <p className="free-note">Free to use — no account needed.</p>
        <SearchForm onSearch={search} disabled={state.phase === 'loading'} />
        {state.phase === 'idle' && <SearchChips onSearch={search} />}
      </header>
      <main>
        <div
          className="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <SearchStatus state={state} onRetry={retry} />
        </div>
        {state.phase === 'success' && (
          <ProductGrid results={state.results} total={state.total} query={state.query} />
        )}
        {(state.phase === 'idle' || state.phase === 'empty') && (
          <EmptyState phase={state.phase} query={state.query} />
        )}
      </main>
    </>
  );
}
