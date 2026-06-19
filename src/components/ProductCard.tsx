import type { Product } from '../types';

interface Props {
  product: Product;
}

function calClass(kcal: number): string {
  if (kcal < 100) return 'cal-low';
  if (kcal < 300) return 'cal-medium';
  return 'cal-high';
}

export default function ProductCard({ product }: Props) {
  return (
    <li className="product-row">
      <div className="product-info">
        <span className="product-name">{product.name}</span>
        {product.brand && <span className="product-brand">{product.brand}</span>}
      </div>
      <div className="retailer-links">
        <a className="retailer-link" href={product.colesUrl} target="_blank" rel="noopener noreferrer">Coles ↗</a>
        <a className="retailer-link" href={product.woolworthsUrl} target="_blank" rel="noopener noreferrer">Woolworths ↗</a>
      </div>
      <div className="macro-pills">
        <span className={`macro-pill ${calClass(product.kcalPer100g)}`}>
          {product.kcalPer100g} kcal
        </span>
        {product.proteinPer100g !== null && (
          <span className="macro-pill macro-protein">{product.proteinPer100g}g protein</span>
        )}
        {product.fatPer100g !== null && (
          <span className="macro-pill macro-fat">{product.fatPer100g}g fat</span>
        )}
        {product.carbsPer100g !== null && (
          <span className="macro-pill macro-carbs">{product.carbsPer100g}g carbs</span>
        )}
      </div>
    </li>
  );
}
