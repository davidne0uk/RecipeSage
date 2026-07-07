import { authenticatedProcedure } from "../../trpc";
import { prisma } from "@recipesage/prisma";
import { z } from "zod";
import { stripIngredient } from "@recipesage/util/shared";

/**
 * Persists a manual ingredient→product link. Aliases take precedence over
 * fuzzy matching, so user corrections accumulate regardless of matcher
 * quality. Pass a null productId to remove an alias.
 */
export const setIngredientAlias = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/setIngredientAlias",
      tags: ["pantry"],
      summary: "Link an ingredient to a pantry product, overriding matching",
      protect: true,
    },
  })
  .input(
    z.object({
      ingredientText: z.string().min(1).max(500),
      grocyProductId: z.number().int().positive().nullable(),
    }),
  )
  .output(z.void())
  .mutation(async ({ ctx, input }) => {
    const ingredientText = stripIngredient(input.ingredientText).toLowerCase();

    if (input.grocyProductId === null) {
      await prisma.pantryProductAlias.deleteMany({
        where: {
          userId: ctx.session.userId,
          ingredientText,
        },
      });
      return;
    }

    await prisma.pantryProductAlias.upsert({
      where: {
        userId_ingredientText: {
          userId: ctx.session.userId,
          ingredientText,
        },
      },
      create: {
        userId: ctx.session.userId,
        ingredientText,
        grocyProductId: input.grocyProductId,
      },
      update: {
        grocyProductId: input.grocyProductId,
      },
    });
  });
