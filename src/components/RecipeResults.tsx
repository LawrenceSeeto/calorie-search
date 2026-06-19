import { useMemo, useEffect, useRef } from 'react';
import type { SelectedProduct, RecipePreference, RecipeRecommendation } from '../types';
import { generateRecipes } from '../lib/recipeEngine';
import RecipeCard from './RecipeCard';

interface Props {
  items: SelectedProduct[];
  preferences: RecipePreference;
  savedIds: Set<string>;
  savedRecipes: RecipeRecommendation[];
  onToggleSave: (recipe: RecipeRecommendation) => void;
}

export default function RecipeResults({ items, preferences, savedIds, savedRecipes, onToggleSave }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stablePrefsRef = useRef(preferences);
  const stableItemsRef = useRef(items);

  // Keep refs in sync for debounced computation
  useEffect(() => { stablePrefsRef.current = preferences; }, [preferences]);
  useEffect(() => { stableItemsRef.current = items; }, [items]);

  // Memoize engine result — recomputes whenever items or preferences change
  const result = useMemo(
    () => generateRecipes(items, preferences),
    [items, preferences],
  );

  // Clear any pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (items.length === 0) {
    return (
      <section className="recipe-results" aria-live="polite" aria-label="Recipe suggestions">
        <div className="recipe-empty">
          Add products to your basket to get recipe suggestions.
        </div>
      </section>
    );
  }

  if (result.warning === 'insufficient-data') {
    return (
      <section className="recipe-results" aria-live="polite" aria-label="Recipe suggestions">
        <div className="recipe-empty recipe-warning">
          <strong>Not enough nutrition data.</strong> Add products that include protein, fat, and carb information to generate recipes.
        </div>
      </section>
    );
  }

  if (result.warning === 'no-templates-match' || result.recipes.length === 0) {
    return (
      <section className="recipe-results" aria-live="polite" aria-label="Recipe suggestions">
        <div className="recipe-empty recipe-warning">
          No recipes found under {preferences.maxKcal} kcal/100g with your current preferences — try raising the calorie limit or changing the meal type.
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="recipe-results" aria-live="polite" aria-label="Recipe suggestions">
        <h2 className="recipe-results-heading">Recipe Suggestions</h2>
        <div className="recipe-grid">
          {result.recipes.map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isSaved={savedIds.has(recipe.id)}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      </section>

      {savedRecipes.length > 0 && (
        <section className="recipe-results recipe-results-saved" aria-label="Saved recipes">
          <h2 className="recipe-results-heading">Saved Recipes</h2>
          <div className="recipe-grid">
            {savedRecipes.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                isSaved={true}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
