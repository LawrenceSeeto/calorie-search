import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { RecipeRecommendation, NutritionEstimate, RecipeIngredient, SelectedProduct } from '../src/types';

interface BasketItem {
  code: string;
  name: string;
  brand: string;
  grams: number;
  kcalPer100g: number;
  proteinPer100g: number | null;
  fatPer100g: number | null;
  carbsPer100g: number | null;
}

interface RequestBody {
  basket: BasketItem[];
  preferences: {
    maxKcal: number;
    mealType: string;
    prepStyle: string;
  };
}

interface AiRecipe {
  title: string;
  steps: string[];
  prepTimeBand: 'no-cook' | 'quick' | 'cooked';
  mealTypes: string[];
  stapleNames: string[];
  usedProductCodes: string[];
  whyRecommended: string;
  kcalPer100g: number;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
}

const SYSTEM_PROMPT = `You are a creative low-calorie recipe chef specialising in Australian and New Zealand supermarket products.

Given a basket of products with their nutritional data, generate 3–4 creative, practical recipes that:
- Use the provided products as primary ingredients
- Stay within the user's kcal/100g target where possible
- Are genuinely tasty and realistic to make at home
- Vary in style (e.g. mix of cuisines, textures, temperatures)

Respond with ONLY a valid JSON array — no markdown, no prose, just the array.

Each element must match this exact shape:
{
  "title": string,
  "steps": string[],            // 3–5 practical cooking steps
  "prepTimeBand": "no-cook" | "quick" | "cooked",
  "mealTypes": string[],        // subset of: "breakfast", "lunch-dinner", "snack", "any"
  "stapleNames": string[],      // pantry items needed (e.g. "Olive oil", "Soy sauce")
  "usedProductCodes": string[], // codes from the basket used in this recipe
  "whyRecommended": string,     // 1–2 sentences on why this recipe is great
  "kcalPer100g": number,        // your best estimate of caloric density
  "proteinG": number | null,    // total grams protein for the recipe
  "fatG": number | null,
  "carbsG": number | null
}`;

function buildUserPrompt(basket: BasketItem[], preferences: RequestBody['preferences']): string {
  const items = basket.map(
    b => `- ${b.name}${b.brand ? ` (${b.brand})` : ''}: ${b.grams}g used, ${b.kcalPer100g} kcal/100g` +
      (b.proteinPer100g !== null ? `, ${b.proteinPer100g}g protein/100g` : '') +
      (b.fatPer100g !== null ? `, ${b.fatPer100g}g fat/100g` : '') +
      (b.carbsPer100g !== null ? `, ${b.carbsPer100g}g carbs/100g` : '') +
      ` [code: ${b.code}]`,
  ).join('\n');

  const mealNote = preferences.mealType !== 'any' ? ` Meal type preference: ${preferences.mealType}.` : '';
  const prepNote = preferences.prepStyle !== 'any' ? ` Prep style preference: ${preferences.prepStyle}.` : '';

  return `Basket:\n${items}\n\nTarget: under ${preferences.maxKcal} kcal/100g.${mealNote}${prepNote}\n\nGenerate 3–4 creative recipes.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) return res.status(502).json({ error: 'AI recipe generation is not configured' });

  const body = req.body as RequestBody;
  if (!body?.basket?.length) return res.status(400).json({ error: 'basket is required' });

  try {
    const geminiRes = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          contents: [
            { role: 'user', parts: [{ text: buildUserPrompt(body.basket, body.preferences) }] },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.8,
            maxOutputTokens: 8192,
          },
        }),
      },
    );

    if (!geminiRes.ok) {
      const errJson = await geminiRes.json().catch(() => null) as { error?: { message?: string } } | null;
      const geminiMsg = errJson?.error?.message ?? `HTTP ${geminiRes.status}`;
      console.error('[recipe] Gemini error:', geminiMsg);
      return res.status(502).json({ error: geminiMsg });
    }

    const geminiData = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

    function extractJSONArray(s: string): string {
      const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenceMatch) return fenceMatch[1].trim();
      const start = s.indexOf('[');
      const end = s.lastIndexOf(']');
      if (start !== -1 && end > start) return s.slice(start, end + 1);
      return s.trim();
    }
    const cleaned = extractJSONArray(raw);

    let aiRecipes: AiRecipe[];
    try {
      aiRecipes = JSON.parse(cleaned) as AiRecipe[];
      if (!Array.isArray(aiRecipes)) throw new Error('not an array');
    } catch {
      console.error('[recipe] Failed to parse Gemini output:', cleaned);
      return res.status(502).json({ error: 'AI returned invalid format' });
    }

    // Build a lookup map from the basket
    const basketByCode = new Map(body.basket.map(b => [b.code, b]));

    const recipes: RecipeRecommendation[] = aiRecipes
      .filter(r => r.title && Array.isArray(r.steps) && r.steps.length > 0)
      .map((r): RecipeRecommendation => {
        const usedProducts: SelectedProduct[] = (r.usedProductCodes ?? [])
          .map((code): SelectedProduct | null => {
            const b = basketByCode.get(code);
            if (!b) return null;
            return {
              product: {
                code: b.code,
                name: b.name,
                brand: b.brand,
                kcalPer100g: b.kcalPer100g,
                proteinPer100g: b.proteinPer100g,
                fatPer100g: b.fatPer100g,
                carbsPer100g: b.carbsPer100g,
                quantity: null,
                servingSize: null,
                servingGrams: null,
                countries: [],
                colesUrl: '',
                woolworthsUrl: '',
                aldiUrl: null,
                igaUrl: null,
                costcoUrl: null,
                sourceUrl: b.code ? `https://world.openfoodfacts.org/product/${b.code}` : '',
              },
              grams: b.grams,
            } satisfies SelectedProduct;
          })
          .filter((sp): sp is SelectedProduct => sp !== null);

        // Fall back to all basket items if no codes matched
        const finalProducts: SelectedProduct[] = usedProducts.length > 0 ? usedProducts : body.basket.map((b): SelectedProduct => ({
          product: {
            code: b.code, name: b.name, brand: b.brand,
            kcalPer100g: b.kcalPer100g, proteinPer100g: b.proteinPer100g,
            fatPer100g: b.fatPer100g, carbsPer100g: b.carbsPer100g,
            quantity: null, servingSize: null, servingGrams: null,
            countries: [], colesUrl: '', woolworthsUrl: '',
            aldiUrl: null, igaUrl: null, costcoUrl: null,
            sourceUrl: '',
          },
          grams: b.grams,
        } satisfies SelectedProduct));

        const staples: RecipeIngredient[] = (r.stapleNames ?? []).map(name => ({
          name,
          grams: 20,
          kcal: 25,
          isStaple: true,
        }));

        const nutrition: NutritionEstimate = {
          kcalPer100g: Math.round(r.kcalPer100g ?? 100),
          proteinG: r.proteinG != null ? Math.round(r.proteinG) : null,
          fatG: r.fatG != null ? Math.round(r.fatG) : null,
          carbsG: r.carbsG != null ? Math.round(r.carbsG) : null,
        };

        return {
          id: crypto.randomUUID(),
          title: r.title,
          templateId: 'ai-generated',
          nutrition,
          usedProducts: finalProducts,
          staples,
          steps: r.steps,
          prepTimeBand: r.prepTimeBand ?? 'quick',
          mealTypes: (r.mealTypes ?? ['any']) as RecipeRecommendation['mealTypes'],
          whyRecommended: r.whyRecommended ?? '',
        };
      });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ recipes });
  } catch (err) {
    console.error('[recipe]', err);
    return res.status(502).json({ error: 'AI generation failed' });
  }
}
