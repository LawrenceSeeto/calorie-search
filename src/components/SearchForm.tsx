import { useRef, useCallback } from 'react';

interface Props {
  onSearch: (q: string) => void;
  disabled: boolean;
}

export default function SearchForm({ onSearch, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fireSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearch(inputRef.current?.value ?? '');
  }, [onSearch]);

  return (
    <div className="search-bar">
      <label htmlFor="q" className="visually-hidden">Search for a food</label>
      <input
        id="q"
        ref={inputRef}
        type="search"
        placeholder="e.g. Tim Tams, Vegemite, Weet-Bix, Milo…"
        autoComplete="off"
        disabled={disabled}
        onKeyDown={e => {
          if (e.key === 'Enter') fireSearch();
        }}
        onInput={() => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          const val = inputRef.current?.value.trim() ?? '';
          if (val.length > 1) {
            debounceRef.current = setTimeout(fireSearch, 400);
          } else if (val.length === 0) {
            onSearch('');
          }
        }}
      />
      <button type="button" onClick={fireSearch} disabled={disabled}>
        Search
      </button>
    </div>
  );
}
