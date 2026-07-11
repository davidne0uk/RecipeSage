import { prisma } from "@recipesage/prisma";
import { authenticatedProcedure } from "../../trpc";
import { deleteHangingImagesForUser } from "@recipesage/util/server/storage";
import { z } from "zod";

export const deleteAllRecipes = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/recipes/deleteAllRecipes",
      tags: ["recipes"],
      summary: "Delete all recipes belonging to the caller",
      protect: true,
    },
  })
  .output(z.string())
  .mutation(async ({ ctx }) => {
    await prisma.$transaction(
      async (tx) => {
        // Intentionally always scoped to the caller, even when the communal
        // library is enabled, so that no single call can wipe every user's
        // recipes.
        await tx.recipe.deleteMany({
          where: {
            userId: ctx.session.userId,
          },
        });

        await deleteHangingImagesForUser(ctx.session.userId, tx);
      },
      {
        timeout: 60000,
      },
    );

    return "Ok";
  });
