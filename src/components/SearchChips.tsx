interface Props {
  onSearch: (q: string) => void;
}

const CHIPS = ['tim tams', 'vegemite', 'weet-bix', 'milo', 'shapes'] as const;

export default function SearchChips({ onSearch }: Props) {
  return (
    <div className="chips">
      {CHIPS.map(q => (
        <button
          key={q}
          type="button"
          className="chip"
          onClick={() => onSearch(q)}
        >
          {q}
        </button>
      ))}
    </div>
  );
}
