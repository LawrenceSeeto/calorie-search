import { Plus, Check } from 'lucide-react';
import type { Product } from '../types';

interface Props {
  product: Product;
  inBasket: boolean;
  onAdd: (product: Product) => void;
}

function calClass(kcal: number): string {
  if (kcal < 100) return 'cal-low';
  if (kcal < 300) return 'cal-medium';
  return 'cal-high';
}

export default function ProductCard({ product, inBasket, onAdd }: Props) {
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
      <button
        type="button"
        className={`add-btn${inBasket ? ' add-btn-in-basket' : ''}`}
        onClick={() => { if (!inBasket) onAdd(product); }}
        aria-label={inBasket ? `${product.name} is in your basket` : `Add ${product.name} to basket`}
        aria-pressed={inBasket}
      >
        {inBasket ? <Check size={14} /> : <Plus size={14} />}
        {inBasket ? 'In Basket' : 'Add'}
      </button>
    </li>
  );
}
