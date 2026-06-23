import type { Product } from '../types';
import ProductCard from './ProductCard';

interface Props {
  results: Product[];
  total: number;
  query: string;
  isLoading?: boolean;
  basketCodes: Set<string>;
  onAddToBasket: (product: Product) => void;
}

const SKELETON_COUNT = 6;

function ProductSkeleton({ index }: { index: number }) {
  return (
    <li
      className="product-row product-card product-skeleton"
      style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
      aria-hidden="true"
    >
      <div className="product-image-slot skeleton" />
      <div className="product-info skeleton-info">
        <span className="skeleton skeleton-line skeleton-line-name" />
        <span className="skeleton skeleton-line skeleton-line-brand" />
      </div>
      <div className="macro-pills skeleton-pills">
        <span className="skeleton skeleton-pill" />
        <span className="skeleton skeleton-pill" />
        <span className="skeleton skeleton-pill" />
      </div>
      <span className="skeleton skeleton-button" />
    </li>
  );
}

export default function ProductGrid({
  results,
  total,
  query,
  isLoading = false,
  basketCodes,
  onAddToBasket,
}: Props) {
  if (isLoading) {
    return (
      <>
        <div className="results-label">Searching for &ldquo;{query}&rdquo;</div>
        <ul className="product-list" aria-busy="true" aria-label={`Loading results for ${query}`}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <ProductSkeleton key={index} index={index} />
          ))}
        </ul>
      </>
    );
  }

  return (
    <>
      <div className="results-label">
        Showing {results.length} of {total} results for &ldquo;{query}&rdquo; — sorted by relevance, then calories
      </div>
      <ul className="product-list">
        {results.map((p, index) => (
          <ProductCard
            key={p.code || `${p.name}|${p.brand}`}
            product={p}
            index={index}
            inBasket={basketCodes.has(p.code)}
            onAdd={onAddToBasket}
          />
        ))}
      </ul>
    </>
  );
}
