import { Minus, Plus, Trash2 } from 'lucide-react';
import type { SelectedProduct } from '../types';

interface Props {
  item: SelectedProduct;
  onSetGrams: (code: string, grams: number) => void;
  onRemove: (code: string) => void;
}

export default function BasketItem({ item, onSetGrams, onRemove }: Props) {
  const { product, grams } = item;
  const kcal = Math.round((product.kcalPer100g * grams) / 100);

  function handleGramsInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= 9999) {
      onSetGrams(product.code, val);
    }
  }

  function step(delta: number) {
    const next = Math.max(1, Math.min(9999, grams + delta));
    onSetGrams(product.code, next);
  }

  return (
    <li className="basket-item">
      <div className="basket-item-info">
        <span className="basket-item-name">{product.name}</span>
        {product.brand && <span className="basket-item-brand">{product.brand}</span>}
      </div>
      <div className="basket-item-controls">
        <div className="gram-stepper">
          <button
            type="button"
            className="stepper-btn"
            onClick={() => step(-10)}
            aria-label="Decrease by 10g"
            disabled={grams <= 1}
          >
            <Minus size={12} />
          </button>
          <input
            type="text"
            inputMode="numeric"
            className="gram-input"
            value={grams}
            onChange={handleGramsInput}
            aria-label={`Grams of ${product.name}`}
          />
          <span className="gram-unit">g</span>
          <button
            type="button"
            className="stepper-btn"
            onClick={() => step(10)}
            aria-label="Increase by 10g"
            disabled={grams >= 9999}
          >
            <Plus size={12} />
          </button>
        </div>
        <span className="basket-item-kcal">{kcal} kcal</span>
        <button
          type="button"
          className="basket-remove-btn"
          onClick={() => onRemove(product.code)}
          aria-label={`Remove ${product.name} from basket`}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}
