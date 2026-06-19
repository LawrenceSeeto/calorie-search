import { useMemo, useEffect, useRef, useState, useCallback } from 'react';
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

type AiState = 'idle' | 'loading' | 'error' | 'success';

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

  // ── AI generation ─────────────────────────────────────────────────────────────
  const [aiState, setAiState] = useState<AiState>('idle');
  const [aiRecipes, setAiRecipes] = useState<RecipeRecommendation[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);

  // Reset AI results when basket changes
  useEffect(() => {
    setAiState('idle');
    setAiRecipes([]);
    setAiError(null);
  }, [items.length]);

  const generateWithAI = useCallback(async () => {
    setAiState('loading');
    setAiError(null);
    try {
      const res = await fetch('/api/recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basket: items.map(i => ({
            code: i.product.code,
            name: i.product.name,
            brand: i.product.brand,
            grams: i.grams,
            kcalPer100g: i.product.kcalPer100g,
            proteinPer100g: i.product.proteinPer100g,
            fatPer100g: i.product.fatPer100g,
            carbsPer100g: i.product.carbsPer100g,
          })),
          preferences,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json() as { error?: string };
        throw new Error(errBody.error ?? 'AI generation failed');
      }
      const data = await res.json() as { recipes: RecipeRecommendation[] };
      setAiRecipes(data.recipes);
      setAiState('success');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI generation failed');
      setAiState('error');
    }
  }, [items, preferences]);

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

        <div className="ai-generate-row">
          <button
            type="button"
            className="ai-generate-btn"
            onClick={generateWithAI}
            disabled={aiState === 'loading'}
          >
            {aiState === 'loading' ? 'Generating…' : '✨ Generate with AI'}
          </button>
          {aiState === 'error' && (
            <span className="ai-error">{aiError ?? 'Could not generate — check your API key is configured.'}</span>
          )}
        </div>
      </section>

      {aiState === 'success' && aiRecipes.length > 0 && (
        <section className="recipe-results recipe-results-ai" aria-live="polite" aria-label="AI recipe ideas">
          <h2 className="recipe-results-heading">AI Recipe Ideas ✨</h2>
          <div className="recipe-grid">
            {aiRecipes.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                isSaved={savedIds.has(recipe.id)}
                onToggleSave={onToggleSave}
              />
            ))}
          </div>
        </section>
      )}

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
