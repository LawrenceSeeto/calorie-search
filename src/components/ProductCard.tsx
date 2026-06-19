import { useState, useMemo } from 'react';
import type { Product } from '../types';

const PLACEHOLDER =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23f3f4f6"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="%23d1d5db" font-size="32">🥫</text></svg>';

interface Props {
  product: Product;
}

function badgeClass(kcal: number): string {
  if (kcal < 100) return 'cal-low';
  if (kcal < 300) return 'cal-medium';
  return 'cal-high';
}

function buildCandidates(product: Product): string[] {
  const urls: string[] = [];
  if (product.imageUrl) urls.push(product.imageUrl);
  if (product.code) {
    urls.push(`https://productimages.coles.com.au/productimages/${product.code}/front/175.jpg`);
  }
  urls.push(PLACEHOLDER);
  return urls;
}

export default function ProductCard({ product }: Props) {
  const candidates = useMemo(
    () => buildCandidates(product),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [product.imageUrl, product.code],
  );
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] ?? PLACEHOLDER;

  return (
    <a
      className="card"
      href={product.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        src={src}
        alt={product.name}
        loading="lazy"
        onError={() => setIdx(i => Math.min(i + 1, candidates.length - 1))}
      />
      <div className="card-body">
        <div className="card-name">{product.name}</div>
        {product.brand && <div className="card-brand">{product.brand}</div>}
        {product.quantity && <div className="card-meta">{product.quantity}</div>}
      </div>
      <span className={`calorie-badge ${badgeClass(product.kcalPer100g)}`}>
        {product.kcalPer100g} kcal / 100g
      </span>
    </a>
  );
}
