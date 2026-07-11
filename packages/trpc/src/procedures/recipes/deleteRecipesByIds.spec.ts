import { prisma } from "@recipesage/prisma";
import { recipeFactory, config } from "@recipesage/util/server/general";
import { test } from "../../testutils";

describe("deleteRecipesByIds", () => {
  afterEach(() => {
    config.recipes.communalLibrary = false;
  });

  describe("success", () => {
    test("deletes the caller's recipes", async ({ trpc, user }) => {
      const recipe = await prisma.recipe.create({
        data: recipeFactory(user.id),
      });

      await trpc.recipes.deleteRecipesByIds({
        ids: [recipe.id],
      });

      const deletedRecipe = await prisma.recipe.findUnique({
        where: { id: recipe.id },
      });
      expect(deletedRecipe).toEqual(null);
    });
  });

  describe("error", () => {
    test("does not delete another user's recipe", async ({ trpc, user2 }) => {
      const recipe = await prisma.recipe.create({
        data: recipeFactory(user2.id),
      });

      await trpc.recipes.deleteRecipesByIds({
        ids: [recipe.id],
      });

      const survivingRecipe = await prisma.recipe.findUnique({
        where: { id: recipe.id },
      });
      expect(survivingRecipe).not.toEqual(null);
    });
  });

  describe("communal library", () => {
    test("deletes another user's recipe when enabled", async ({
      trpc,
      user,
      user2,
    }) => {
      config.recipes.communalLibrary = true;

      const mine = await prisma.recipe.create({
        data: recipeFactory(user.id),
      });
      const theirs = await prisma.recipe.create({
        data: recipeFactory(user2.id),
      });

      await trpc.recipes.deleteRecipesByIds({
        ids: [mine.id, theirs.id],
      });

      const remaining = await prisma.recipe.findMany({
        where: { id: { in: [mine.id, theirs.id] } },
      });
      expect(remaining).toEqual([]);
    });
  });
});
