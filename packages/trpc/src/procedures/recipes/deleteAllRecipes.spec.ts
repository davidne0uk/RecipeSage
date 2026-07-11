import { prisma } from "@recipesage/prisma";
import { recipeFactory, config } from "@recipesage/util/server/general";
import { test } from "../../testutils";

describe("deleteAllRecipes", () => {
  afterEach(() => {
    config.recipes.communalLibrary = false;
  });

  describe("success", () => {
    test("deletes the caller's recipes", async ({ trpc, user }) => {
      const recipe = await prisma.recipe.create({
        data: recipeFactory(user.id),
      });

      await trpc.recipes.deleteAllRecipes();

      const deletedRecipe = await prisma.recipe.findUnique({
        where: { id: recipe.id },
      });
      expect(deletedRecipe).toEqual(null);
    });
  });

  describe("communal library", () => {
    test("still only deletes the caller's recipes when enabled", async ({
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

      await trpc.recipes.deleteAllRecipes();

      const deletedRecipe = await prisma.recipe.findUnique({
        where: { id: mine.id },
      });
      expect(deletedRecipe).toEqual(null);

      const survivingRecipe = await prisma.recipe.findUnique({
        where: { id: theirs.id },
      });
      expect(survivingRecipe).not.toEqual(null);
    });
  });
});
