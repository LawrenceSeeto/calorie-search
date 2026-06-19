import type { SearchState } from '../types';

interface Props {
  state: SearchState;
  onRetry: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'rate-limited': 'The food database is busy right now. Please wait a moment and try again.',
  'provider-unavailable': 'Could not reach the food database. Check your connection and try again.',
  'network': 'Could not reach the food database. Check your connection and try again.',
};

export default function SearchStatus({ state, onRetry }: Props) {
  if (state.phase === 'loading') {
    return <div className="spinner" role="status" aria-label="Searching…" />;
  }

  if (state.phase === 'error') {
    const msg = ERROR_MESSAGES[state.errorType ?? 'network'];
    return (
      <div className="error-block">
        <span className="error-msg">{msg}</span>
        <button type="button" className="retry-btn" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  return null;
}
