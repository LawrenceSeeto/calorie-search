import { ShoppingBasket, Trash2 } from 'lucide-react';
import type { SelectedProduct, RecipePreference } from '../types';
import BasketItem from './BasketItem';
import RecipePreferences from './RecipePreferences';

interface Props {
  items: SelectedProduct[];
  preferences: RecipePreference;
  onSetGrams: (code: string, grams: number) => void;
  onRemove: (code: string) => void;
  onClear: () => void;
  onPreferencesChange: (prefs: RecipePreference) => void;
}

function Totals({ items }: { items: SelectedProduct[] }) {
  let kcal = 0, protein = 0, fat = 0, carbs = 0;
  let hasMacros = false;

  for (const { product, grams } of items) {
    kcal += (product.kcalPer100g * grams) / 100;
    if (product.proteinPer100g !== null) { protein += (product.proteinPer100g * grams) / 100; hasMacros = true; }
    if (product.fatPer100g !== null) fat += (product.fatPer100g * grams) / 100;
    if (product.carbsPer100g !== null) carbs += (product.carbsPer100g * grams) / 100;
  }

  return (
    <div className="basket-totals">
      <span className="total-kcal">{Math.round(kcal)} kcal</span>
      {hasMacros && (
        <>
          <span className="total-macro">{Math.round(protein)}g P</span>
          <span className="total-macro">{Math.round(fat)}g F</span>
          <span className="total-macro">{Math.round(carbs)}g C</span>
        </>
      )}
    </div>
  );
}

export default function RecipeBasket({
  items,
  preferences,
  onSetGrams,
  onRemove,
  onClear,
  onPreferencesChange,
}: Props) {
  return (
    <aside className="basket-panel" aria-label="Recipe basket">
      <div className="basket-header">
        <h2 className="basket-title">
          <ShoppingBasket size={18} aria-hidden="true" />
          Recipe Basket
          {items.length > 0 && <span className="basket-count">{items.length}</span>}
        </h2>
        {items.length > 0 && (
          <button type="button" className="basket-clear-btn" onClick={onClear} aria-label="Clear basket">
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="basket-empty-hint">
          Search for products and click <strong>Add</strong> to build your recipe basket.
        </p>
      ) : (
        <>
          <ul className="basket-list" aria-label="Basket items">
            {items.map(item => (
              <BasketItem
                key={item.product.code}
                item={item}
                onSetGrams={onSetGrams}
                onRemove={onRemove}
              />
            ))}
          </ul>
          <Totals items={items} />
        </>
      )}

      <RecipePreferences preferences={preferences} onChange={onPreferencesChange} />
    </aside>
  );
}
