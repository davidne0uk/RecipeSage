import { z } from "zod";
import { generateText, Output } from "ai";
import { aiProvider } from "./vercel";
import { config } from "../general/config";
import { metrics } from "../general/metrics";
import { withNoObjectRetry } from "./withNoObjectRetry";

export interface AiPantryMatchCandidate {
  productId: number;
  name: string;
}

export type AiPantryMatchConfidence = "high" | "medium" | "low";

export interface AiPantryMatchResult {
  ingredient: string;
  productId: number | null;
  confidence: AiPantryMatchConfidence | null;
}

const aiPantryMatchSchema = z.object({
  matches: z.array(
    z.object({
      ingredient: z
        .string()
        .describe(
          "The ingredient line copied verbatim from the input list, unchanged",
        ),
      productId: z
        .number()
        .nullable()
        .describe(
          "The id of the pantry product that best corresponds to this ingredient, or null if none of the listed products plausibly matches",
        ),
      confidence: z
        .enum(["high", "medium", "low"])
        .describe(
          "Confidence in the match. Use low when the product kind is a guess. Ignored when productId is null.",
        ),
    }),
  ),
});

/**
 * Fallback tier for ingredient-to-product matching, used only for ingredient
 * lines the cheap token-overlap heuristic in `pantryMatching.ts` couldn't
 * resolve. Batches every still-unmatched line from a single recipe against
 * the full candidate product set in one call. A `productId` in the result is
 * only ever one of the ids passed in `products`; any id the model invents is
 * dropped by the caller-facing filter below.
 */
export const matchIngredientsToProductsWithAi = async (
  ingredients: string[],
  products: AiPantryMatchCandidate[],
): Promise<AiPantryMatchResult[]> => {
  const unmatched: AiPantryMatchResult[] = ingredients.map((ingredient) => ({
    ingredient,
    productId: null,
    confidence: null,
  }));
  if (ingredients.length === 0 || products.length === 0) return unmatched;

  const validProductIds = new Set(products.map((product) => product.productId));

  const llmResponse = await withNoObjectRetry(() =>
    generateText({
      system:
        "You are a pantry inventory matching utility. Given a list of recipe ingredient lines and a list of grocery products currently in stock, decide which stocked product (if any) is the same food as each ingredient. Match on the underlying food, not brand or packaging - treat synonyms and regional variants as equivalent (e.g. 'scallion' and 'spring onion' and 'green onion' are the same product; 'capsicum' and 'bell pepper' are the same product). Prefer a generic product over a more specific one only when no specific match exists. Do not guess a product id that is not in the provided list. If no listed product is a reasonable match for an ingredient, return null for that ingredient's productId.",
      model: aiProvider(config.ai.model.text),
      temperature: 0,
      prompt:
        "Pantry products (id: name):\n" +
        products
          .map((product) => `${product.productId}: ${product.name}`)
          .join("\n") +
        "\n\nIngredient lines to match:\n" +
        ingredients.map((ingredient) => `- ${ingredient}`).join("\n"),
      output: Output.object({
        schema: aiPantryMatchSchema,
      }),
    }),
  );

  if (llmResponse.totalUsage.totalTokens !== undefined) {
    metrics.llmTokensConsumed.observe(
      {
        category: "matchIngredientsToProductsWithAi",
      },
      llmResponse.totalUsage.totalTokens,
    );
  }

  const resultByIngredient = new Map(
    llmResponse.output.matches.map((match) => [match.ingredient, match]),
  );

  return ingredients.map((ingredient) => {
    const match = resultByIngredient.get(ingredient);
    if (
      !match ||
      match.productId === null ||
      !validProductIds.has(match.productId)
    ) {
      return { ingredient, productId: null, confidence: null };
    }
    return {
      ingredient,
      productId: match.productId,
      confidence: match.confidence,
    };
  });
};
