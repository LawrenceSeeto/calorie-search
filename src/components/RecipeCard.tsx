import { useState } from 'react';
import { Bookmark, ChevronDown, ChevronUp, Clock, UtensilsCrossed } from 'lucide-react';
import type { RecipeRecommendation } from '../types';

interface Props {
  recipe: RecipeRecommendation;
  isSaved: boolean;
  onToggleSave: (recipe: RecipeRecommendation) => void;
}

function calClass(kcal: number): string {
  if (kcal < 100) return 'cal-low';
  if (kcal < 300) return 'cal-medium';
  return 'cal-high';
}

const PREP_LABELS: Record<string, string> = {
  'no-cook': 'No-cook',
  quick: '~15 min',
  cooked: '~25 min',
};

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  'lunch-dinner': 'Lunch / Dinner',
  snack: 'Snack',
};

export default function RecipeCard({ recipe, isSaved, onToggleSave }: Props) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const { nutrition } = recipe;

  return (
    <article className="recipe-card">
      <div className="recipe-card-header">
        <h3 className="recipe-title">{recipe.title}</h3>
        <button
          type="button"
          className={`save-btn${isSaved ? ' save-btn-active' : ''}`}
          onClick={() => onToggleSave(recipe)}
          aria-label={isSaved ? 'Unsave recipe' : 'Save recipe'}
        >
          <Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
        <div className="recipe-chips">
          {recipe.mealTypes.map(m => (
            <span key={m} className="recipe-chip recipe-chip-meal">{MEAL_LABELS[m] ?? m}</span>
          ))}
          <span className="recipe-chip recipe-chip-prep">
            <Clock size={11} aria-hidden="true" />
            {PREP_LABELS[recipe.prepTimeBand] ?? recipe.prepTimeBand}
          </span>
        </div>
      </div>

      <div className="recipe-nutrition">
        <span className={`macro-pill ${calClass(nutrition.kcalPer100g)}`}>
          {nutrition.kcalPer100g} kcal / 100g
        </span>
        {nutrition.proteinG !== null && (
          <span className="macro-pill macro-protein">{nutrition.proteinG}g protein</span>
        )}
        {nutrition.fatG !== null && (
          <span className="macro-pill macro-fat">{nutrition.fatG}g fat</span>
        )}
        {nutrition.carbsG !== null && (
          <span className="macro-pill macro-carbs">{nutrition.carbsG}g carbs</span>
        )}
      </div>

      {recipe.usedProducts.length > 0 && (
        <div className="recipe-section">
          <span className="recipe-section-label">From your basket</span>
          <div className="recipe-product-chips">
            {recipe.usedProducts.map(sp => (
              <span key={sp.product.code} className="recipe-product-chip">
                {sp.product.name} <em>{sp.grams}g</em>
              </span>
            ))}
          </div>
        </div>
      )}

      {recipe.staples.length > 0 && (
        <div className="recipe-section">
          <span className="recipe-section-label">You&apos;ll also need</span>
          <span className="recipe-staples">
            {recipe.staples.map(s => s.name).join(', ')}
          </span>
        </div>
      )}

      <button
        type="button"
        className="steps-toggle"
        onClick={() => setStepsOpen(o => !o)}
        aria-expanded={stepsOpen}
      >
        <UtensilsCrossed size={14} aria-hidden="true" />
        {stepsOpen ? 'Hide' : 'Show'} instructions
        {stepsOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
      </button>

      {stepsOpen && (
        <ol className="recipe-steps">
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      <p className="recipe-why">{recipe.whyRecommended}</p>

      <footer className="recipe-footer">
        <span className="recipe-estimate-label">
          Estimated nutrition · Local recipe
        </span>
        <span className="recipe-disclaimer">
          Figures are approximate and for general meal planning only — not medical advice.
        </span>
      </footer>
    </article>
  );
}
