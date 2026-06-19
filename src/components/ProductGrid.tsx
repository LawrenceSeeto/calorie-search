import type { Product } from '../types';
import ProductCard from './ProductCard';

interface Props {
  results: Product[];
  total: number;
  query: string;
}

export default function ProductGrid({ results, total, query }: Props) {
  return (
    <>
      <div className="results-label">
        Showing {results.length} of {total} results for &ldquo;{query}&rdquo; — sorted lowest to highest calories
      </div>
      <ul className="product-list">
        {results.map(p => (
          <ProductCard key={p.code || `${p.name}|${p.brand}`} product={p} />
        ))}
      </ul>
    </>
  );
}
