interface Props {
  phase: 'idle' | 'empty';
  query: string;
}

export default function EmptyState({ phase, query }: Props) {
  if (phase === 'idle') {
    return (
      <div className="empty-state">
        Type a food name above to find the lowest-calorie options.
      </div>
    );
  }

  return (
    <div className="empty-state no-results">
      No products with calorie data found for &ldquo;{query}&rdquo;. Try a different search term.
    </div>
  );
}
