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
  getCachedPantryMatch,
  hashPantryProductSet,
  setCachedPantryMatch,
} from "@recipesage/util/server/general";
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
  confidence: z.enum(["alias", "exact", "strong"]).nullable(),
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
      where: {
        id: input.recipeId,
        userId: ctx.session.userId,
      },
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

    const aliases = await prisma.pantryProductAlias.findMany({
      where: {
        userId: ctx.session.userId,
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

      return ingredientLines.map((ingredient) => {
        const aliasProductId = aliasByIngredientText.get(
          stripIngredient(ingredient).toLowerCase(),
        );

        let match: Omit<PantryIngredientMatch, "confidence"> & {
          confidence: "alias" | "exact" | "strong" | null;
        };
        if (aliasProductId !== undefined && productById.has(aliasProductId)) {
          match = {
            ingredient,
            strippedName: stripIngredient(ingredient),
            productId: aliasProductId,
            confidence: "alias",
          };
        } else {
          const cached = getCachedPantryMatch(ingredient, productSetHash);
          if (cached) {
            match = cached;
          } else {
            const fuzzyMatch = matchIngredientToProducts(
              ingredient,
              candidates,
            );
            setCachedPantryMatch(ingredient, productSetHash, fuzzyMatch);
            match = fuzzyMatch;
          }
        }

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
