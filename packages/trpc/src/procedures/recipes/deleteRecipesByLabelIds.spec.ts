import { prisma } from "@recipesage/prisma";
import { recipeFactory, config } from "@recipesage/util/server/general";
import { test } from "../../testutils";

describe("deleteRecipesByLabelIds", () => {
  afterEach(() => {
    config.recipes.communalLibrary = false;
  });

  describe("success", () => {
    test("deletes the caller's recipes carrying the label", async ({
      trpc,
      user,
    }) => {
      const label = await prisma.label.create({
        data: {
          title: "salads",
          userId: user.id,
          labelGroupId: null,
        },
      });
      const labelled = await prisma.recipe.create({
        data: {
          ...recipeFactory(user.id),
          recipeLabels: { create: [{ labelId: label.id }] },
        },
      });
      const unlabelled = await prisma.recipe.create({
        data: recipeFactory(user.id),
      });

      await trpc.recipes.deleteRecipesByLabelIds({
        labelIds: [label.id],
      });

      expect(
        await prisma.recipe.findUnique({ where: { id: labelled.id } }),
      ).toEqual(null);
      expect(
        await prisma.recipe.findUnique({ where: { id: unlabelled.id } }),
      ).not.toEqual(null);
    });
  });

  describe("communal library", () => {
    test("still only deletes the caller's recipes when enabled", async ({
      trpc,
      user,
      user2,
    }) => {
      config.recipes.communalLibrary = true;

      const label = await prisma.label.create({
        data: {
          title: "salads",
          userId: user.id,
          labelGroupId: null,
        },
      });
      const mine = await prisma.recipe.create({
        data: {
          ...recipeFactory(user.id),
          recipeLabels: { create: [{ labelId: label.id }] },
        },
      });
      // Another user's recipe carrying the same label must survive - bulk
      // deletes stay scoped to the caller even in a communal library.
      const theirs = await prisma.recipe.create({
        data: {
          ...recipeFactory(user2.id),
          recipeLabels: { create: [{ labelId: label.id }] },
        },
      });

      await trpc.recipes.deleteRecipesByLabelIds({
        labelIds: [label.id],
      });

      expect(
        await prisma.recipe.findUnique({ where: { id: mine.id } }),
      ).toEqual(null);
      expect(
        await prisma.recipe.findUnique({ where: { id: theirs.id } }),
      ).not.toEqual(null);
    });
  });
});
