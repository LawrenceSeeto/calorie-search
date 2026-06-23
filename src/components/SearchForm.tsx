interface Props {
  onSearch: (q: string) => void;
  onQueryChange?: (q: string) => void;
  disabled: boolean;
}

export default function SearchForm({ onSearch, onQueryChange, disabled }: Props) {
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('q') as HTMLInputElement;
    onSearch(input.value.trim());
  }

  return (
    <form className="search-bar" onSubmit={handleSubmit} role="search">
      <label htmlFor="q" className="visually-hidden">Search for a food</label>
      <input
        id="q"
        name="q"
        type="search"
        placeholder="e.g. Tim Tams, Vegemite, Weet-Bix, Milo…"
        autoComplete="off"
        onChange={e => onQueryChange?.(e.currentTarget.value)}
      />
      <button type="submit" disabled={disabled}>
        Search
      </button>
    </form>
  );
}
