import { prisma } from "@recipesage/prisma";
import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";

export const deleteRecipesByLabelIds = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/recipes/deleteRecipesByLabelIds",
      tags: ["recipes"],
      summary: "Delete every recipe that has at least one of the given labels",
      protect: true,
    },
  })
  .input(
    z.object({
      labelIds: z.array(z.uuid()).min(1),
    }),
  )
  .output(z.string())
  .mutation(async ({ ctx, input }) => {
    // Intentionally always scoped to the caller, even when the communal library
    // is enabled - see deleteAllRecipes.
    const where = {
      userId: ctx.session.userId,
      recipeLabels: {
        some: {
          label: {
            id: {
              in: input.labelIds,
            },
          },
        },
      },
    };

    await prisma.recipe.deleteMany({
      where,
    });

    return "Ok";
  });
