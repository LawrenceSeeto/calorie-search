import type { Product } from '../types';
import ProductCard from './ProductCard';

interface Props {
  results: Product[];
  total: number;
  query: string;
  basketCodes: Set<string>;
  onAddToBasket: (product: Product) => void;
}

export default function ProductGrid({ results, total, query, basketCodes, onAddToBasket }: Props) {
  return (
    <>
      <div className="results-label">
        Showing {results.length} of {total} results for &ldquo;{query}&rdquo; — sorted lowest to highest calories
      </div>
      <ul className="product-list">
        {results.map(p => (
          <ProductCard
            key={p.code || `${p.name}|${p.brand}`}
            product={p}
            inBasket={basketCodes.has(p.code)}
            onAdd={onAddToBasket}
          />
        ))}
      </ul>
    </>
  );
}
