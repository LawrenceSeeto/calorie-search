import type {
  SelectedProduct,
  RecipePreference,
  RecipeIngredient,
  NutritionEstimate,
  RecipeRecommendation,
  RecipeWarning,
  MealType,
} from '../types';

// ─── Product role classification ──────────────────────────────────────────────

type ProductRole =
  | 'protein'
  | 'dairy'
  | 'grain'
  | 'fat-source'
  | 'produce-like'
  | 'sweet'
  | 'snack'
  | 'beverage'
  | 'sauce'
  | 'unknown';

const DAIRY_WORDS = /yoghurt|yogurt|milk|cheese|cream|kefir|ricotta|quark|cottage/i;
const SWEET_WORDS = /chocolate|candy|lolly|lollies|biscuit|cookie|cake|muffin|dessert|ice.?cream|gelato|jam|honey|syrup|brownie|tim.?tam|oreo|milo/i;
const SNACK_WORDS = /chip|crisp|cracker|pretzel|popcorn|nut|seed|bar|muesli.?bar|rice.?cake|corn.?thins/i;
const BEVERAGE_WORDS = /drink|juice|smoothie|tea|coffee|water|soda|cola|kombucha|cordial|milk$/i;
const SAUCE_WORDS = /sauce|dressing|dip|spread|paste|mayo|mayonnaise|mustard|ketchup|relish|chutney|hummus|pesto/i;
const GRAIN_WORDS = /bread|wrap|tortilla|pasta|noodle|rice|oats|cereal|grain|quinoa|couscous|barley/i;

export function classifyProduct(p: { name: string; brand: string; kcalPer100g: number; proteinPer100g: number | null; fatPer100g: number | null; carbsPer100g: number | null }): ProductRole {
  const text = `${p.name} ${p.brand}`;
  const protein = p.proteinPer100g ?? 0;
  const fat = p.fatPer100g ?? 0;
  const carbs = p.carbsPer100g ?? 0;
  const kcal = p.kcalPer100g;

  // Name-based sweet/snack checked first — outweighs carb ratio (biscuits, chocolate etc.)
  if (SWEET_WORDS.test(text)) return 'sweet';
  if (SNACK_WORDS.test(text)) return 'snack';
  if (DAIRY_WORDS.test(text)) return 'dairy';
  if (SAUCE_WORDS.test(text)) return 'sauce';
  if (BEVERAGE_WORDS.test(text)) return 'beverage';
  if (GRAIN_WORDS.test(text)) return 'grain';

  // Macro-ratio based (reliable when data present and no name signal)
  if (p.proteinPer100g !== null && protein >= 15 && fat < 15) return 'protein';
  if (p.fatPer100g !== null && fat >= 25 && carbs < 30) return 'fat-source';
  if (p.carbsPer100g !== null && carbs >= 50) return 'grain';

  // Low kcal = vegetable/produce-like
  if (kcal < 50) return 'produce-like';

  // Second pass macro-ratio with lower confidence
  if (protein >= 10 && fat < 20) return 'protein';

  return 'unknown';
}

// ─── Staples table ────────────────────────────────────────────────────────────

interface Staple {
  name: string;
  kcalPer100g: number;
  defaultGrams: number;
}

const STAPLES: Record<string, Staple> = {
  lettuce:        { name: 'Lettuce',          kcalPer100g: 17,  defaultGrams: 30  },
  cucumber:       { name: 'Cucumber',         kcalPer100g: 16,  defaultGrams: 50  },
  tomato:         { name: 'Tomato',           kcalPer100g: 18,  defaultGrams: 100 },
  berries:        { name: 'Mixed berries',    kcalPer100g: 57,  defaultGrams: 50  },
  egg_white:      { name: 'Egg white',        kcalPer100g: 52,  defaultGrams: 33  },
  herbs:          { name: 'Fresh herbs',      kcalPer100g: 40,  defaultGrams: 5   },
  light_dressing: { name: 'Light dressing',   kcalPer100g: 200, defaultGrams: 15  },
  lemon_juice:    { name: 'Lemon juice',      kcalPer100g: 22,  defaultGrams: 15  },
  soy_sauce:      { name: 'Lite soy sauce',   kcalPer100g: 60,  defaultGrams: 10  },
  rice_vinegar:   { name: 'Rice vinegar',     kcalPer100g: 18,  defaultGrams: 10  },
  spinach:        { name: 'Baby spinach',     kcalPer100g: 23,  defaultGrams: 30  },
  lime_juice:     { name: 'Lime juice',       kcalPer100g: 25,  defaultGrams: 15  },
  sesame:         { name: 'Sesame seeds',     kcalPer100g: 573, defaultGrams: 5   },
  chili:          { name: 'Chili flakes',     kcalPer100g: 282, defaultGrams: 2   },
  garlic:         { name: 'Fresh garlic',     kcalPer100g: 149, defaultGrams: 5   },
};

function makeStapleIngredient(key: string): RecipeIngredient {
  const s = STAPLES[key];
  return {
    name: s.name,
    grams: s.defaultGrams,
    kcal: Math.round((s.kcalPer100g * s.defaultGrams) / 100),
    isStaple: true,
  };
}

// ─── Recipe templates ─────────────────────────────────────────────────────────

interface RecipeTemplate {
  id: string;
  title: string;
  // Each inner array is a group that must be satisfied by at least one product
  requiredRoleGroups: ProductRole[][];
  optionalRoles: ProductRole[];
  stapleKeys: string[];
  prepTimeBand: 'no-cook' | 'quick' | 'cooked';
  mealTypes: MealType[];
  makeSteps: (productNames: string[], stapleNames: string[]) => string[];
  whyHint: string;
}

const TEMPLATES: RecipeTemplate[] = [
  {
    id: 'yogurt-bowl',
    title: 'Yogurt Bowl',
    requiredRoleGroups: [['dairy']],
    optionalRoles: ['grain', 'sweet', 'protein'],
    stapleKeys: ['berries', 'herbs'],
    prepTimeBand: 'no-cook',
    mealTypes: ['breakfast', 'snack'],
    makeSteps: (products, staples) => [
      `Spoon ${products[0]} into a bowl.`,
      staples.length > 0 ? `Top with ${staples.join(', ')}.` : 'Add any toppings you like.',
      products.length > 1 ? `Finish with ${products.slice(1).join(' and ')}.` : 'Enjoy as is or add a drizzle of honey.',
    ],
    whyHint: 'High in protein, creamy and satisfying',
  },
  {
    id: 'smoothie',
    title: 'Low-Cal Smoothie',
    requiredRoleGroups: [['dairy', 'beverage']],
    optionalRoles: ['sweet', 'protein', 'grain'],
    stapleKeys: ['berries'],
    prepTimeBand: 'no-cook',
    mealTypes: ['breakfast', 'snack'],
    makeSteps: (products, staples) => [
      `Add ${products[0]} to a blender.`,
      staples.length > 0 ? `Add ${staples.join(' and ')}.` : '',
      products.length > 1 ? `Add ${products.slice(1).join(', ')}.` : '',
      'Blend until smooth and pour into a glass.',
    ].filter(Boolean),
    whyHint: 'Quick to make, easy to customise',
  },
  {
    id: 'salad-bowl',
    title: 'Fresh Salad Bowl',
    requiredRoleGroups: [['produce-like', 'protein']],
    optionalRoles: ['dairy', 'fat-source', 'sauce', 'grain'],
    stapleKeys: ['lettuce', 'cucumber', 'tomato', 'light_dressing'],
    prepTimeBand: 'no-cook',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Build a base of ${staples.includes('Lettuce') ? 'lettuce' : 'greens'}.`,
      `Add ${products.join(', ')}.`,
      staples.filter(s => !['Lettuce'].includes(s)).length > 0
        ? `Top with ${staples.filter(s => s !== 'Lettuce').join(', ')}.`
        : '',
      'Toss and serve.',
    ].filter(Boolean),
    whyHint: 'Volume eating — big bowl, low calories',
  },
  {
    id: 'wrap',
    title: 'Low-Cal Wrap',
    requiredRoleGroups: [['grain'], ['protein']],
    optionalRoles: ['sauce', 'dairy', 'produce-like'],
    stapleKeys: ['lettuce', 'tomato'],
    prepTimeBand: 'quick',
    mealTypes: ['lunch-dinner', 'snack'],
    makeSteps: (products, staples) => [
      `Lay ${products.find((_,i) => i === 0) ?? 'your wrap'} flat on a surface.`,
      `Layer ${products.slice(1).join(', ')} down the centre.`,
      staples.length > 0 ? `Add ${staples.join(' and ')}.` : '',
      'Roll tightly and slice in half.',
    ].filter(Boolean),
    whyHint: 'Portable, filling and protein-rich',
  },
  {
    id: 'stir-fry',
    title: 'Quick Stir-Fry',
    requiredRoleGroups: [['protein']],
    optionalRoles: ['grain', 'sauce', 'produce-like'],
    stapleKeys: ['soy_sauce', 'rice_vinegar'],
    prepTimeBand: 'cooked',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Heat a wok or non-stick pan over high heat.`,
      `Add ${products[0]} and stir-fry for 3–4 minutes.`,
      products.length > 1 ? `Add ${products.slice(1).join(', ')}.` : '',
      staples.length > 0 ? `Splash in ${staples.join(' and ')} and toss.` : 'Season to taste.',
      'Serve immediately.',
    ].filter(Boolean),
    whyHint: 'High-protein, fast cook, filling',
  },
  {
    id: 'snack-plate',
    title: 'Snack Plate',
    requiredRoleGroups: [['snack']],
    optionalRoles: ['dairy', 'protein', 'fat-source', 'produce-like'],
    stapleKeys: [],
    prepTimeBand: 'no-cook',
    mealTypes: ['snack'],
    makeSteps: (products) => [
      `Arrange ${products[0]} on a plate.`,
      products.length > 1 ? `Add ${products.slice(1).join(' and ')} alongside.` : '',
      'Enjoy as a light snack.',
    ].filter(Boolean),
    whyHint: 'Balanced snack, portion-controlled',
  },
  {
    id: 'soup',
    title: 'Light Soup',
    requiredRoleGroups: [['protein', 'produce-like']],
    optionalRoles: ['grain'],
    stapleKeys: ['herbs'],
    prepTimeBand: 'cooked',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Bring 500 ml of water or low-sodium stock to a simmer.`,
      `Add ${products.join(', ')} and cook for 10–15 minutes.`,
      staples.length > 0 ? `Stir in ${staples.join(' and ')} just before serving.` : '',
      'Season with salt and pepper, ladle into bowls.',
    ].filter(Boolean),
    whyHint: 'Very low calorie, high volume, warming',
  },
  {
    id: 'overnight-oats',
    title: 'Overnight Oats',
    requiredRoleGroups: [['grain'], ['dairy']],
    optionalRoles: ['sweet', 'protein'],
    stapleKeys: ['berries'],
    prepTimeBand: 'no-cook',
    mealTypes: ['breakfast'],
    makeSteps: (products, staples) => [
      `Combine ${products.join(' and ')} in a jar or container.`,
      staples.length > 0 ? `Stir in ${staples.join(' and ')}.` : '',
      'Cover and refrigerate overnight.',
      'Give it a stir in the morning before eating.',
    ].filter(Boolean),
    whyHint: 'Meal-prep friendly, keeps you full all morning',
  },
  {
    id: 'lettuce-cups',
    title: 'Lettuce Cups',
    requiredRoleGroups: [['protein']],
    optionalRoles: ['sauce', 'produce-like', 'grain'],
    stapleKeys: ['lettuce', 'soy_sauce', 'lemon_juice'],
    prepTimeBand: 'quick',
    mealTypes: ['lunch-dinner', 'snack'],
    makeSteps: (products, staples) => [
      'Separate large lettuce leaves to form cups.',
      `Spoon ${products.join(', ')} into the cups.`,
      staples.filter(s => s !== 'Lettuce').length > 0
        ? `Drizzle with ${staples.filter(s => s !== 'Lettuce').join(' and ')}.`
        : '',
      'Fold and eat immediately.',
    ].filter(Boolean),
    whyHint: 'Low-carb, fresh and crunchy',
  },
  {
    id: 'light-dessert',
    title: 'Light Dessert',
    requiredRoleGroups: [['sweet']],
    optionalRoles: ['dairy'],
    stapleKeys: [],
    prepTimeBand: 'no-cook',
    mealTypes: ['snack'],
    makeSteps: (products) => [
      `Serve ${products[0]}${products.length > 1 ? ` with ${products.slice(1).join(' and ')}` : ''}.`,
      'Enjoy in a single-serve portion to stay on track.',
    ],
    whyHint: 'Satisfies cravings without blowing your budget',
  },
  {
    id: 'grain-bowl',
    title: 'Grain Bowl',
    requiredRoleGroups: [['grain'], ['protein']],
    optionalRoles: ['sauce', 'dairy', 'produce-like'],
    stapleKeys: ['tomato', 'herbs', 'lemon_juice'],
    prepTimeBand: 'quick',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Cook or warm ${products[0]} and place in a bowl.`,
      `Add ${products.slice(1).join(', ')}.`,
      staples.length > 0 ? `Top with ${staples.join(', ')} and a squeeze of lemon.` : 'Season to taste.',
      'Mix together and enjoy warm.',
    ].filter(Boolean),
    whyHint: 'Balanced macros, satisfying and nutrient-dense',
  },
  {
    id: 'asian-noodle-bowl',
    title: 'Asian Noodle Bowl',
    requiredRoleGroups: [['grain'], ['sauce']],
    optionalRoles: ['protein', 'produce-like'],
    stapleKeys: ['soy_sauce', 'rice_vinegar', 'chili'],
    prepTimeBand: 'quick',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Cook ${products[0]} according to packet instructions, then drain.`,
      `Toss with ${products.slice(1).join(', ')}.`,
      staples.length > 0 ? `Dress with ${staples.filter(s => s !== 'Chili flakes').join(' and ')}${staples.includes('Chili flakes') ? ' and a pinch of chili flakes' : ''}.` : '',
      'Serve warm or at room temperature.',
    ].filter(Boolean),
    whyHint: 'Umami-packed, low-cal, ready in minutes',
  },
  {
    id: 'buddha-bowl',
    title: 'Buddha Bowl',
    requiredRoleGroups: [['grain'], ['protein'], ['produce-like']],
    optionalRoles: ['dairy', 'sauce'],
    stapleKeys: ['spinach', 'cucumber', 'lemon_juice'],
    prepTimeBand: 'no-cook',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Arrange a bed of ${staples.includes('Baby spinach') ? 'baby spinach' : 'greens'} in a wide bowl.`,
      `Portion ${products.join(', ')} into separate sections over the greens.`,
      `Scatter ${staples.filter(s => s !== 'Baby spinach').join(' and ')} on top.`,
      'Drizzle with lemon juice and serve immediately.',
    ].filter(Boolean),
    whyHint: 'Rainbow of nutrients, visually satisfying',
  },
  {
    id: 'protein-pancakes',
    title: 'Protein Pancakes',
    requiredRoleGroups: [['grain'], ['dairy']],
    optionalRoles: ['protein', 'sweet'],
    stapleKeys: ['egg_white', 'berries'],
    prepTimeBand: 'quick',
    mealTypes: ['breakfast'],
    makeSteps: (products, staples) => [
      `Mash or blend ${products.join(' with ')} until smooth.`,
      staples.includes('Egg white') ? 'Fold in egg whites for extra protein.' : '',
      'Pour small rounds into a non-stick pan over medium heat.',
      'Cook 2–3 minutes per side until golden.',
      staples.includes('Mixed berries') ? 'Serve topped with mixed berries.' : 'Serve warm with your favourite topping.',
    ].filter(Boolean),
    whyHint: 'High protein, feels indulgent without the calories',
  },
  {
    id: 'chia-pudding',
    title: 'Chia Pudding',
    requiredRoleGroups: [['dairy']],
    optionalRoles: ['grain', 'sweet'],
    stapleKeys: ['berries'],
    prepTimeBand: 'no-cook',
    mealTypes: ['breakfast', 'snack'],
    makeSteps: (products, staples) => [
      `Mix 3 tbsp chia seeds into ${products[0]} and stir well.`,
      products.length > 1 ? `Stir in ${products.slice(1).join(' and ')}.` : '',
      'Cover and refrigerate for at least 2 hours (or overnight).',
      staples.length > 0 ? `Top with ${staples.join(' and ')} before serving.` : 'Stir before eating and add your favourite toppings.',
    ].filter(Boolean),
    whyHint: 'High fibre, omega-3 rich, prep-ahead friendly',
  },
  {
    id: 'energy-balls',
    title: 'Energy Balls',
    requiredRoleGroups: [['grain'], ['fat-source']],
    optionalRoles: ['sweet', 'protein'],
    stapleKeys: [],
    prepTimeBand: 'no-cook',
    mealTypes: ['snack'],
    makeSteps: (products) => [
      `Combine ${products.join(', ')} in a mixing bowl and stir until it holds together.`,
      'If the mixture is too dry, add a teaspoon of water at a time.',
      'Roll into small balls (about 1 tbsp each) and place on a lined tray.',
      'Refrigerate for 30 minutes to firm up. Store for up to a week.',
    ],
    whyHint: 'Portable, no-bake, keeps energy steady',
  },
  {
    id: 'toast-topping',
    title: 'Loaded Toast',
    requiredRoleGroups: [['grain'], ['protein', 'sauce']],
    optionalRoles: ['dairy', 'produce-like'],
    stapleKeys: ['tomato', 'herbs'],
    prepTimeBand: 'quick',
    mealTypes: ['breakfast'],
    makeSteps: (products, staples) => [
      `Toast ${products[0]} until golden.`,
      `Spread or layer ${products.slice(1).join(', ')} on top.`,
      staples.length > 0 ? `Finish with ${staples.join(', ')}.` : '',
      'Season with salt, pepper and a pinch of chili if you like heat.',
    ].filter(Boolean),
    whyHint: 'Quick, flavourful and endlessly variable',
  },
  {
    id: 'greek-bowl',
    title: 'Greek Bowl',
    requiredRoleGroups: [['dairy'], ['produce-like']],
    optionalRoles: ['protein', 'sauce'],
    stapleKeys: ['cucumber', 'tomato', 'lemon_juice'],
    prepTimeBand: 'no-cook',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Place ${products[0]} as the base in a wide bowl.`,
      `Add ${products.slice(1).join(', ')}.`,
      staples.length > 0 ? `Top with ${staples.join(', ')}.` : '',
      'Finish with a drizzle of lemon juice, dried oregano, and a pinch of salt.',
    ].filter(Boolean),
    whyHint: 'Mediterranean-style, fresh and protein-rich',
  },
  {
    id: 'protein-shake',
    title: 'Protein Shake',
    requiredRoleGroups: [['dairy'], ['protein']],
    optionalRoles: ['sweet', 'grain'],
    stapleKeys: ['berries'],
    prepTimeBand: 'no-cook',
    mealTypes: ['breakfast', 'snack'],
    makeSteps: (products, staples) => [
      `Add ${products.join(', ')} to a blender.`,
      staples.length > 0 ? `Add ${staples.join(' and ')}.` : '',
      'Blend on high for 30 seconds until smooth.',
      'Pour over ice and drink immediately.',
    ].filter(Boolean),
    whyHint: 'Fast protein hit, great post-workout',
  },
  {
    id: 'rice-bowl',
    title: 'Rice Bowl',
    requiredRoleGroups: [['grain'], ['protein']],
    optionalRoles: ['sauce', 'produce-like'],
    stapleKeys: ['soy_sauce', 'garlic', 'sesame'],
    prepTimeBand: 'cooked',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Cook ${products[0]} and place in a bowl while warm.`,
      `Cook or slice ${products.slice(1).join(', ')} and arrange on top.`,
      staples.includes('Fresh garlic') ? 'Sauté the garlic briefly and drizzle the oil over.' : '',
      staples.filter(s => s !== 'Fresh garlic').length > 0
        ? `Finish with ${staples.filter(s => s !== 'Fresh garlic').join(' and ')}.`
        : '',
      'Serve hot.',
    ].filter(Boolean),
    whyHint: 'Hearty, high-protein, very low-cal per serve',
  },
  {
    id: 'dips-crudites',
    title: 'Dips & Crudités',
    requiredRoleGroups: [['sauce']],
    optionalRoles: ['protein', 'produce-like'],
    stapleKeys: ['cucumber', 'tomato'],
    prepTimeBand: 'no-cook',
    mealTypes: ['snack'],
    makeSteps: (products, staples) => [
      `Spoon ${products[0]} into a small bowl.`,
      products.length > 1 ? `Arrange ${products.slice(1).join(', ')} around it.` : '',
      staples.length > 0 ? `Add ${staples.join(' and ')} as dippers.` : 'Slice any vegetables you have as dippers.',
      'Serve chilled.',
    ].filter(Boolean),
    whyHint: 'High-volume, low-calorie snacking at its best',
  },
  {
    id: 'warm-protein-salad',
    title: 'Warm Protein Salad',
    requiredRoleGroups: [['protein'], ['produce-like']],
    optionalRoles: ['sauce', 'grain'],
    stapleKeys: ['spinach', 'tomato', 'lemon_juice'],
    prepTimeBand: 'quick',
    mealTypes: ['lunch-dinner'],
    makeSteps: (products, staples) => [
      `Quickly sear or pan-cook ${products[0]} over high heat.`,
      `Build a salad base of ${staples.includes('Baby spinach') ? 'baby spinach' : 'salad greens'}.`,
      `Slice ${products[0]} and place on top with ${products.slice(1).join(', ')}.`,
      staples.filter(s => s !== 'Baby spinach').length > 0
        ? `Dress with ${staples.filter(s => s !== 'Baby spinach').join(' and ')}.`
        : 'Drizzle with lemon juice and serve.',
    ].filter(Boolean),
    whyHint: 'Warm protein on cool greens — light but filling',
  },
];

// ─── Scoring ──────────────────────────────────────────────────────────────────

function calcNutrition(
  usedProducts: SelectedProduct[],
  staples: RecipeIngredient[],
): NutritionEstimate {
  let kcal = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;
  let hasMacros = false;
  let totalGrams = 0;

  for (const { product, grams } of usedProducts) {
    kcal += (product.kcalPer100g * grams) / 100;
    if (product.proteinPer100g !== null) { protein += (product.proteinPer100g * grams) / 100; hasMacros = true; }
    if (product.fatPer100g !== null) fat += (product.fatPer100g * grams) / 100;
    if (product.carbsPer100g !== null) carbs += (product.carbsPer100g * grams) / 100;
    totalGrams += grams;
  }

  for (const s of staples) {
    kcal += s.kcal;
    totalGrams += s.grams;
  }

  const factor = totalGrams > 0 ? 100 / totalGrams : 1;
  return {
    kcalPer100g: Math.round(kcal * factor),
    proteinG: hasMacros ? Math.round(protein) : null,
    fatG: hasMacros ? Math.round(fat) : null,
    carbsG: hasMacros ? Math.round(carbs) : null,
  };
}

function scoreTemplate(
  template: RecipeTemplate,
  classified: Array<{ selected: SelectedProduct; role: ProductRole }>,
  preferences: RecipePreference,
): { score: number; usedProducts: SelectedProduct[] } | null {
  // Check required role groups — each group needs at least one matching product
  for (const group of template.requiredRoleGroups) {
    const satisfied = classified.some(c => group.includes(c.role));
    if (!satisfied) return null;
  }

  // Greedily assign products to roles (required first, then optional)
  const allRoles = [
    ...template.requiredRoleGroups.flat(),
    ...template.optionalRoles,
  ];
  const used = new Set<string>(); // product codes
  const usedProducts: SelectedProduct[] = [];

  for (const role of allRoles) {
    const match = classified.find(c => c.role === role && !used.has(c.selected.product.code));
    if (match) {
      used.add(match.selected.product.code);
      usedProducts.push(match.selected);
    }
  }

  // Include unmatched products if they haven't been used (maximise product coverage)
  for (const c of classified) {
    if (!used.has(c.selected.product.code)) {
      usedProducts.push(c.selected);
    }
  }

  // Calculate nutrition
  const staples = template.stapleKeys.map(makeStapleIngredient);
  const nutrition = calcNutrition(usedProducts, staples);

  // Score components
  const maxKcal = preferences.maxKcal;
  const kcal = nutrition.kcalPer100g;

  // 1. Calorie fit (0-40): full score if within 80% of budget, 0 if over
  let calorieFit: number;
  if (kcal > maxKcal) {
    calorieFit = 0;
  } else {
    const ratio = kcal / maxKcal;
    calorieFit = ratio >= 0.5 ? 40 * ((1 - Math.abs(ratio - 0.8)) / 0.5) : 40 * (ratio / 0.5);
    calorieFit = Math.max(0, Math.min(40, calorieFit));
  }

  // 2. Product coverage (0-30)
  const assignedCount = classified.filter(c => used.has(c.selected.product.code)).length;
  const productCoverage = classified.length > 0
    ? (assignedCount / classified.length) * 30
    : 0;

  // 3. Protein density (0-15): reward high protein per kcal
  let proteinDensity = 0;
  if (nutrition.proteinG !== null && kcal > 0) {
    const ratio = (nutrition.proteinG * 4) / kcal; // protein kcal fraction
    proteinDensity = Math.min(15, ratio * 30);
  }

  // 4. Preference match (0-10)
  let prefMatch = 0;
  if (preferences.mealType === 'any' || template.mealTypes.includes(preferences.mealType)) {
    prefMatch += 5;
  }
  if (preferences.prepStyle === 'any' || template.prepTimeBand === preferences.prepStyle) {
    prefMatch += 5;
  }

  // 5. Missing staples penalty
  const staplePenalty = template.stapleKeys.length > 0 ? -1 * template.stapleKeys.length : 0;

  const score = calorieFit + productCoverage + proteinDensity + prefMatch + staplePenalty;

  return { score, usedProducts };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RecipeEngineResult {
  recipes: RecipeRecommendation[];
  warning: RecipeWarning | null;
}

export function generateRecipes(
  items: SelectedProduct[],
  preferences: RecipePreference,
): RecipeEngineResult {
  if (items.length === 0) {
    return { recipes: [], warning: null };
  }

  // Data quality gate: at least one product must have full macros
  const fullMacroCount = items.filter(
    i => i.product.proteinPer100g !== null && i.product.fatPer100g !== null && i.product.carbsPer100g !== null,
  ).length;
  if (fullMacroCount === 0) {
    return { recipes: [], warning: 'insufficient-data' };
  }

  // Classify all products
  const classified = items.map(selected => ({
    selected,
    role: classifyProduct(selected.product),
  }));

  // Score all templates
  const candidates: Array<{
    template: RecipeTemplate;
    score: number;
    usedProducts: SelectedProduct[];
  }> = [];

  for (const template of TEMPLATES) {
    // Filter by meal type preference
    if (
      preferences.mealType !== 'any' &&
      !template.mealTypes.includes(preferences.mealType)
    ) {
      continue;
    }
    // Filter by prep style preference
    if (
      preferences.prepStyle !== 'any' &&
      template.prepTimeBand !== preferences.prepStyle
    ) {
      continue;
    }

    const result = scoreTemplate(template, classified, preferences);
    if (result !== null && result.score > 0) {
      candidates.push({ template, score: result.score, usedProducts: result.usedProducts });
    }
  }

  if (candidates.length === 0) {
    return { recipes: [], warning: 'no-templates-match' };
  }

  // Sort: score DESC, then productCoverage DESC, then calorieDeviation ASC as tiebreakers
  candidates.sort((a, b) => b.score - a.score);

  // Build top 5 recommendations
  const top = candidates.slice(0, 5);
  const recipes: RecipeRecommendation[] = top.map((c, idx) => {
    const stapleIngredients = c.template.stapleKeys.map(makeStapleIngredient);
    const nutrition = calcNutrition(c.usedProducts, stapleIngredients, preferences.servings);
    const productNames = c.usedProducts.map(sp => sp.product.name);
    const stapleNames = stapleIngredients.map(s => s.name);

    return {
      id: `${c.template.id}-${idx}`,
      title: c.template.title,
      templateId: c.template.id,
      nutrition,
      usedProducts: c.usedProducts,
      staples: stapleIngredients,
      steps: c.template.makeSteps(productNames, stapleNames),
      prepTimeBand: c.template.prepTimeBand,
      mealTypes: c.template.mealTypes,
      whyRecommended: buildWhyText(c.template, nutrition, preferences),
    };
  });

  return { recipes, warning: null };
}

function buildWhyText(
  template: RecipeTemplate,
  nutrition: NutritionEstimate,
  preferences: RecipePreference,
): string {
  const parts: string[] = [template.whyHint];
  if (nutrition.kcalPerServing <= preferences.maxKcal) {
    parts.push(`fits your ${preferences.maxKcal} kcal limit`);
  }
  if (nutrition.proteinG !== null && nutrition.proteinG >= 15) {
    parts.push(`${nutrition.proteinG}g protein`);
  }
  return parts.join(' · ');
}
