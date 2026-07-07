import { stripIngredient } from "./parsers";

/**
 * Matching between free-text recipe ingredient lines and pantry products.
 * Pure logic; alias lookups (user overrides) are applied by the caller before
 * falling back to this matcher.
 */

export interface PantryMatchCandidate {
  productId: number;
  name: string;
}

export type PantryMatchConfidence = "exact" | "strong";

export interface PantryIngredientMatch {
  /** The original ingredient line as written in the recipe */
  ingredient: string;
  /** The parsed ingredient name with quantities/units/prep words removed */
  strippedName: string;
  productId: number | null;
  confidence: PantryMatchConfidence | null;
}

/**
 * Words that describe preparation or state rather than the ingredient
 * itself, ignored during matching.
 */
const PREP_WORDS = new Set([
  "fresh",
  "freshly",
  "dried",
  "chopped",
  "diced",
  "sliced",
  "minced",
  "grated",
  "ground",
  "crushed",
  "shredded",
  "melted",
  "softened",
  "beaten",
  "peeled",
  "trimmed",
  "finely",
  "coarsely",
  "roughly",
  "thinly",
  "large",
  "medium",
  "small",
  "ripe",
  "raw",
  "cooked",
  "frozen",
  "tinned",
  "canned",
  "whole",
  "halved",
  "quartered",
  "extra",
  "plus",
  "more",
  "optional",
]);

/**
 * Minimum token overlap (Jaccard index) for a fuzzy match. Below this, an
 * ingredient is reported as unmatched rather than guessed.
 */
const STRONG_MATCH_THRESHOLD = 0.6;

const singularizeToken = (token: string): string => {
  if (token.length > 3 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 2 && token.endsWith("s")) return token.slice(0, -1);
  return token;
};

/**
 * Normalizes a name into comparable tokens: lowercase, punctuation stripped,
 * prep words removed, crude singularization.
 */
export const normalizeToTokens = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !PREP_WORDS.has(token))
    .map(singularizeToken);

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
};

const isSubset = (subset: Set<string>, superset: Set<string>): boolean => {
  for (const token of subset) {
    if (!superset.has(token)) return false;
  }
  return true;
};

/**
 * Matches a single ingredient line against the product set.
 */
export const matchIngredientToProducts = (
  ingredient: string,
  products: PantryMatchCandidate[],
): PantryIngredientMatch => {
  const strippedName = stripIngredient(ingredient);
  const ingredientTokens = new Set(normalizeToTokens(strippedName));

  const unmatched: PantryIngredientMatch = {
    ingredient,
    strippedName,
    productId: null,
    confidence: null,
  };
  if (ingredientTokens.size === 0) return unmatched;

  let best: {
    productId: number;
    confidence: PantryMatchConfidence;
    score: number;
    tokenCount: number;
  } | null = null;

  for (const product of products) {
    const productTokens = new Set(normalizeToTokens(product.name));
    if (productTokens.size === 0) continue;

    const overlap = jaccard(ingredientTokens, productTokens);

    let confidence: PantryMatchConfidence | null = null;
    let score = overlap;
    if (overlap === 1) {
      confidence = "exact";
    } else if (
      isSubset(productTokens, ingredientTokens) ||
      overlap >= STRONG_MATCH_THRESHOLD
    ) {
      // Product name fully contained in the ingredient line (e.g. product
      // "Oregano" in "2 tbsp chopped fresh oregano") or high token overlap
      confidence = "strong";
      if (isSubset(productTokens, ingredientTokens)) {
        score = Math.max(score, productTokens.size / ingredientTokens.size);
      }
    }
    if (!confidence) continue;

    if (
      !best ||
      confidence === "exact" ||
      score > best.score ||
      (score === best.score && productTokens.size > best.tokenCount)
    ) {
      best = {
        productId: product.productId,
        confidence,
        score,
        tokenCount: productTokens.size,
      };
      if (confidence === "exact") break;
    }
  }

  if (!best) return unmatched;
  return {
    ingredient,
    strippedName,
    productId: best.productId,
    confidence: best.confidence,
  };
};

/**
 * Matches many ingredient lines. Lines that are section headers (e.g.
 * "[For the sauce]") are skipped by callers before invoking this.
 */
export const matchIngredientsToProducts = (
  ingredients: string[],
  products: PantryMatchCandidate[],
): PantryIngredientMatch[] =>
  ingredients.map((ingredient) =>
    matchIngredientToProducts(ingredient, products),
  );
