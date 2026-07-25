import { authenticatedProcedure } from "../../trpc";
import { TRPCError } from "@trpc/server";
import { prisma } from "@recipesage/prisma";
import { z } from "zod";
import {
  isPantryContainerUnit,
  matchIngredientToProducts,
  parseIngredients,
  stripIngredient,
  type PantryIngredientMatch,
} from "@recipesage/util/shared";
import {
  config,
  getCachedPantryMatch,
  hashPantryProductSet,
  setCachedPantryMatch,
} from "@recipesage/util/server/general";
import { matchIngredientsToProductsWithAi } from "@recipesage/util/server/ml";
import { communalRecipeWhere } from "@recipesage/util/server/db";
import { grocyTrpc } from "./common";

/**
 * Total stock amount at or below which a container-unit product is
 * considered "running low".
 */
const LOW_FILL_THRESHOLD = 0.25;

export const ingredientAvailabilitySchema = z.object({
  ingredient: z.string(),
  strippedName: z.string(),
  productId: z.number().nullable(),
  productName: z.string().nullable(),
  confidence: z.enum(["alias", "exact", "strong", "llm"]).nullable(),
  inStock: z.boolean(),
  lowFill: z.boolean(),
});

export const matchIngredients = authenticatedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/pantry/matchIngredients",
      tags: ["pantry"],
      summary:
        "Match a recipe's ingredients against pantry stock, including low-fill warnings",
      protect: true,
    },
  })
  .input(
    z.object({
      recipeId: z.uuid(),
    }),
  )
  .output(z.array(ingredientAvailabilitySchema))
  .query(async ({ ctx, input }) => {
    const recipe = await prisma.recipe.findFirst({
      where: communalRecipeWhere(ctx.session.userId, {
        id: input.recipeId,
      }),
      select: {
        ingredients: true,
      },
    });
    if (!recipe) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Recipe not found",
      });
    }

    const ingredientLines = parseIngredients(recipe.ingredients, "1")
      .filter((line) => !line.isHeader)
      .map((line) => line.originalContent.trim())
      .filter((line) => line.length > 0);

    // One shared pantry implies one shared matching vocabulary: in a communal
    // library every user's aliases apply, so nobody re-teaches a mapping another
    // user already taught. Ordering oldest-first means that when two users alias
    // the same ingredient text to different products, the most recently taught
    // one wins deterministically (it overwrites the earlier key below).
    const aliases = await prisma.pantryProductAlias.findMany({
      where: config.recipes.communalLibrary
        ? {}
        : {
            userId: ctx.session.userId,
          },
      orderBy: {
        updatedAt: "asc",
      },
    });
    const aliasByIngredientText = new Map(
      aliases.map((alias) => [alias.ingredientText, alias.grocyProductId]),
    );

    return grocyTrpc(async (grocy) => {
      const [products, stock, quantityUnits] = await Promise.all([
        grocy.getProducts(),
        grocy.getCurrentStock(),
        grocy.getQuantityUnits(),
      ]);

      const candidates = products.map((product) => ({
        productId: product.id,
        name: product.name,
      }));
      const productSetHash = hashPantryProductSet(candidates);
      const productById = new Map(
        products.map((product) => [product.id, product]),
      );
      const stockAmountByProductId = new Map(
        stock.map((item) => [item.productId, item.amount]),
      );
      const containerUnitIds = new Set(
        quantityUnits
          .filter((unit) => isPantryContainerUnit(unit.name))
          .map((unit) => unit.id),
      );

      type ResolvedMatch = Omit<PantryIngredientMatch, "confidence"> & {
        confidence: "alias" | "exact" | "strong" | "llm" | null;
      };

      const initialMatches: ResolvedMatch[] = ingredientLines.map(
        (ingredient) => {
          const aliasProductId = aliasByIngredientText.get(
            stripIngredient(ingredient).toLowerCase(),
          );

          if (aliasProductId !== undefined && productById.has(aliasProductId)) {
            return {
              ingredient,
              strippedName: stripIngredient(ingredient),
              productId: aliasProductId,
              confidence: "alias",
            };
          }

          const cached = getCachedPantryMatch(ingredient, productSetHash);
          if (cached) return cached;

          const fuzzyMatch = matchIngredientToProducts(ingredient, candidates);
          setCachedPantryMatch(ingredient, productSetHash, fuzzyMatch);
          return fuzzyMatch;
        },
      );

      // LLM fallback: only for lines the alias/cache/heuristic pass above
      // couldn't resolve, batched into a single call. A provider error must
      // never fail the whole request - affected lines just stay unmatched.
      const stillUnmatchedIngredients = [
        ...new Set(
          initialMatches
            .filter((match) => match.productId === null)
            .map((match) => match.ingredient),
        ),
      ];

      const aiResultByIngredient = new Map<
        string,
        {
          productId: number | null;
          confidence: "high" | "medium" | "low" | null;
        }
      >();
      if (stillUnmatchedIngredients.length > 0) {
        try {
          const aiResults = await matchIngredientsToProductsWithAi(
            stillUnmatchedIngredients,
            candidates,
          );
          for (const result of aiResults) {
            aiResultByIngredient.set(result.ingredient, result);
          }
        } catch (err) {
          console.error("LLM pantry match fallback failed", err);
        }
      }

      const aliasWrites: { ingredientText: string; grocyProductId: number }[] =
        [];

      const finalMatches: ResolvedMatch[] = initialMatches.map((match) => {
        if (match.productId !== null) return match;

        const aiResult = aiResultByIngredient.get(match.ingredient);
        if (!aiResult || aiResult.productId === null) return match;

        if (aiResult.confidence === "high") {
          aliasWrites.push({
            ingredientText: stripIngredient(match.ingredient).toLowerCase(),
            grocyProductId: aiResult.productId,
          });
        }

        return {
          ingredient: match.ingredient,
          strippedName: match.strippedName,
          productId: aiResult.productId,
          confidence: "llm",
        };
      });

      if (aliasWrites.length > 0) {
        await Promise.all(
          aliasWrites.map((write) =>
            prisma.pantryProductAlias.upsert({
              where: {
                userId_ingredientText: {
                  userId: ctx.session.userId,
                  ingredientText: write.ingredientText,
                },
              },
              create: {
                userId: ctx.session.userId,
                ingredientText: write.ingredientText,
                grocyProductId: write.grocyProductId,
              },
              update: {
                grocyProductId: write.grocyProductId,
              },
            }),
          ),
        );
      }

      return finalMatches.map((match) => {
        const product =
          match.productId !== null
            ? productById.get(match.productId)
            : undefined;
        const amount = product
          ? stockAmountByProductId.get(product.id) || 0
          : 0;
        const inStock = amount > 0;
        const lowFill =
          inStock &&
          !!product &&
          containerUnitIds.has(product.quIdStock) &&
          amount <= LOW_FILL_THRESHOLD;

        return {
          ingredient: match.ingredient,
          strippedName: match.strippedName,
          productId: product ? product.id : null,
          productName: product ? product.name : null,
          confidence: product ? match.confidence : null,
          inStock,
          lowFill,
        };
      });
    });
  });
