import type { RecipePreference, MealType, PrepStyle } from '../types';

interface Props {
  preferences: RecipePreference;
  onChange: (prefs: RecipePreference) => void;
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch-dinner', label: 'Lunch/Dinner' },
  { value: 'snack', label: 'Snack' },
];

const PREP_STYLES: { value: PrepStyle; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'no-cook', label: 'No-cook' },
  { value: 'quick', label: 'Quick' },
  { value: 'cooked', label: 'Cooked' },
];

export default function RecipePreferences({ preferences, onChange }: Props) {
  function set<K extends keyof RecipePreference>(key: K, value: RecipePreference[K]) {
    onChange({ ...preferences, [key]: value });
  }

  return (
    <div className="recipe-preferences">
      <h3 className="prefs-heading">Recipe Preferences</h3>

      <div className="pref-row">
        <label className="pref-label" htmlFor="max-kcal">
          Max kcal / 100g
          <strong className="pref-value">{preferences.maxKcal}</strong>
        </label>
        <input
          id="max-kcal"
          type="range"
          min={50}
          max={400}
          step={10}
          value={preferences.maxKcal}
          onChange={e => set('maxKcal', Number(e.target.value))}
          className="kcal-slider"
          aria-label="Maximum calories per 100g"
        />
        <div className="slider-labels">
          <span>50</span>
          <span>400</span>
        </div>
      </div>

      <div className="pref-row">
        <label className="pref-label">
          Servings
          <strong className="pref-value">{preferences.servings}</strong>
        </label>
        <div className="gram-stepper">
          <button
            type="button"
            className="stepper-btn"
            onClick={() => set('servings', Math.max(1, preferences.servings - 1))}
            disabled={preferences.servings <= 1}
            aria-label="Decrease servings"
          >
            −
          </button>
          <span className="servings-display">{preferences.servings}</span>
          <button
            type="button"
            className="stepper-btn"
            onClick={() => set('servings', Math.min(6, preferences.servings + 1))}
            disabled={preferences.servings >= 6}
            aria-label="Increase servings"
          >
            +
          </button>
        </div>
      </div>

      <div className="pref-row">
        <span className="pref-label">Meal type</span>
        <div className="seg-group" role="group" aria-label="Meal type">
          {MEAL_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`seg-btn${preferences.mealType === value ? ' seg-active' : ''}`}
              onClick={() => set('mealType', value)}
              aria-pressed={preferences.mealType === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <span className="pref-label">Prep style</span>
        <div className="seg-group" role="group" aria-label="Prep style">
          {PREP_STYLES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`seg-btn${preferences.prepStyle === value ? ' seg-active' : ''}`}
              onClick={() => set('prepStyle', value)}
              aria-pressed={preferences.prepStyle === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
