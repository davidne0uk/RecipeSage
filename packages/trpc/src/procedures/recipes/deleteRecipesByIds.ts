import { prisma } from "@recipesage/prisma";
import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { communalRecipeWhere } from "@recipesage/util/server/db";

export const deleteRecipesByIds = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/recipes/deleteRecipesByIds",
      tags: ["recipes"],
      summary: "Delete multiple recipes by id",
      protect: true,
    },
  })
  .input(
    z.object({
      ids: z.array(z.uuid()).min(1),
    }),
  )
  .output(z.string())
  .mutation(async ({ ctx, input }) => {
    const where = communalRecipeWhere(ctx.session.userId, {
      id: {
        in: input.ids,
      },
    });

    await prisma.recipe.deleteMany({
      where,
    });

    return "Ok";
  });
