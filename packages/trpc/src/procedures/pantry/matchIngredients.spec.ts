import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@recipesage/prisma";
import { clearPantryMatchCache, config } from "@recipesage/util/server/general";
import { stripIngredient } from "@recipesage/util/shared";
import { test } from "../../testutils";
import {
  createGrocyFetchMock,
  grocyProduct,
  grocyStockItem,
} from "./testGrocy";

vi.hoisted(() => {
  process.env.GROCY_URL = "http://grocy.test/";
  process.env.GROCY_API_KEY = "test-key";
});

const matchIngredientsToProductsWithAiMock = vi.fn();

vi.mock("@recipesage/util/server/ml", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@recipesage/util/server/ml")>();
  return {
    ...actual,
    matchIngredientsToProductsWithAi: (...args: unknown[]) =>
      matchIngredientsToProductsWithAiMock(...args),
  };
});

const createRecipe = async (userId: string, ingredients: string) =>
  prisma.recipe.create({
    data: {
      userId,
      title: "Test recipe",
      description: "",
      yield: "",
      folder: "main",
      activeTime: "",
      totalTime: "",
      source: "",
      url: "",
      notes: "",
      ingredients,
      instructions: "",
      rating: null,
    },
  });

describe("matchIngredients", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  const oregano = grocyProduct(1, "Oregano", 3, 2);
  const tomatoes = grocyProduct(2, "Chopped tomatoes", 2, 1);

  beforeEach(() => {
    clearPantryMatchCache();
    matchIngredientsToProductsWithAiMock.mockReset();
    matchIngredientsToProductsWithAiMock.mockResolvedValue([]);
    grocy = createGrocyFetchMock();
    grocy.install();
    grocy
      .on("GET", "/api/objects/products", [oregano, tomatoes])
      .on("GET", "/api/objects/quantity_units", [
        { id: 1, name: "Tin", name_plural: "Tins" },
        { id: 2, name: "Jar", name_plural: "Jars" },
      ])
      .on("GET", "/api/stock", [
        grocyStockItem(oregano, 0.25),
        grocyStockItem(tomatoes, 3),
      ]);
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("reports per-line availability with low-fill warnings", async ({
    trpc,
    user,
  }) => {
    const recipe = await createRecipe(
      user.id,
      "[Sauce]\n1 x 400g tin chopped tomatoes\n2 tbsp fresh oregano\n1 sheet puff pastry",
    );

    const result = await trpc.pantry.matchIngredients({
      recipeId: recipe.id,
    });

    expect(result.length).toEqual(3);
    expect(result[0]).toMatchObject({
      productName: "Chopped tomatoes",
      inStock: true,
      lowFill: false,
    });
    expect(result[1]).toMatchObject({
      productName: "Oregano",
      inStock: true,
      lowFill: true,
    });
    expect(result[2]).toMatchObject({
      productId: null,
      inStock: false,
    });
  });

  test("aliases take precedence over fuzzy matching", async ({
    trpc,
    user,
  }) => {
    const recipe = await createRecipe(user.id, "200ml passata");

    await trpc.pantry.setIngredientAlias({
      ingredientText: "passata",
      grocyProductId: 2,
    });

    const result = await trpc.pantry.matchIngredients({
      recipeId: recipe.id,
    });

    expect(result[0]).toMatchObject({
      productName: "Chopped tomatoes",
      confidence: "alias",
      inStock: true,
    });
  });

  test("removed aliases fall back to fuzzy matching", async ({
    trpc,
    user,
  }) => {
    const recipe = await createRecipe(user.id, "200ml passata");

    await trpc.pantry.setIngredientAlias({
      ingredientText: "passata",
      grocyProductId: 2,
    });
    await trpc.pantry.setIngredientAlias({
      ingredientText: "passata",
      grocyProductId: null,
    });

    const result = await trpc.pantry.matchIngredients({
      recipeId: recipe.id,
    });

    expect(result[0].productId).toBeNull();
  });

  test("throws NOT_FOUND for another user's recipe", async ({
    trpc,
    user2,
  }) => {
    const recipe = await createRecipe(user2.id, "1 egg");

    await expect(
      trpc.pantry.matchIngredients({ recipeId: recipe.id }),
    ).rejects.toThrow("Recipe not found");
  });

  describe("LLM fallback", () => {
    test("resolves an ingredient the heuristic can't match", async ({
      trpc,
      user,
    }) => {
      matchIngredientsToProductsWithAiMock.mockImplementation(
        async (ingredients: string[]) =>
          ingredients.map((ingredient) => ({
            ingredient,
            productId: 2,
            confidence: "medium",
          })),
      );

      const recipe = await createRecipe(user.id, "1 sheet puff pastry");
      const result = await trpc.pantry.matchIngredients({
        recipeId: recipe.id,
      });

      expect(result[0]).toMatchObject({
        productId: 2,
        productName: "Chopped tomatoes",
        confidence: "llm",
      });
      expect(matchIngredientsToProductsWithAiMock).toHaveBeenCalledTimes(1);
    });

    test("persists a high-confidence match as an alias and skips the LLM on a repeat lookup", async ({
      trpc,
      user,
    }) => {
      matchIngredientsToProductsWithAiMock.mockImplementation(
        async (ingredients: string[]) =>
          ingredients.map((ingredient) => ({
            ingredient,
            productId: 2,
            confidence: "high",
          })),
      );

      const recipe = await createRecipe(user.id, "1 tin plum tomatoes");

      const first = await trpc.pantry.matchIngredients({
        recipeId: recipe.id,
      });
      expect(first[0]).toMatchObject({ productId: 2, confidence: "llm" });
      expect(matchIngredientsToProductsWithAiMock).toHaveBeenCalledTimes(1);

      const ingredientText = stripIngredient(first[0].ingredient).toLowerCase();
      const alias = await prisma.pantryProductAlias.findUnique({
        where: {
          userId_ingredientText: { userId: user.id, ingredientText },
        },
      });
      expect(alias?.grocyProductId).toEqual(2);

      const second = await trpc.pantry.matchIngredients({
        recipeId: recipe.id,
      });
      expect(second[0]).toMatchObject({ productId: 2, confidence: "alias" });
      // Still only the one call from the first lookup - the alias short-circuits the second.
      expect(matchIngredientsToProductsWithAiMock).toHaveBeenCalledTimes(1);
    });

    test("shows a low-confidence match without persisting an alias", async ({
      trpc,
      user,
    }) => {
      matchIngredientsToProductsWithAiMock.mockImplementation(
        async (ingredients: string[]) =>
          ingredients.map((ingredient) => ({
            ingredient,
            productId: 2,
            confidence: "low",
          })),
      );

      const recipe = await createRecipe(user.id, "1 tin plum tomatoes");
      const result = await trpc.pantry.matchIngredients({
        recipeId: recipe.id,
      });

      expect(result[0]).toMatchObject({ productId: 2, confidence: "llm" });

      const aliasCount = await prisma.pantryProductAlias.count({
        where: { userId: user.id },
      });
      expect(aliasCount).toEqual(0);
    });

    test("stays unmatched rather than failing the request when the LLM errors", async ({
      trpc,
      user,
    }) => {
      matchIngredientsToProductsWithAiMock.mockRejectedValue(
        new Error("provider down"),
      );

      const recipe = await createRecipe(user.id, "1 sheet puff pastry");
      const result = await trpc.pantry.matchIngredients({
        recipeId: recipe.id,
      });

      expect(result[0]).toMatchObject({
        productId: null,
        confidence: null,
        inStock: false,
      });
    });
  });

  describe("communal library", () => {
    afterEach(() => {
      config.recipes.communalLibrary = false;
    });

    test("matches another user's recipe when enabled", async ({
      trpc,
      user2,
    }) => {
      config.recipes.communalLibrary = true;

      const recipe = await createRecipe(
        user2.id,
        "1 x 400g tin chopped tomatoes",
      );

      const result = await trpc.pantry.matchIngredients({
        recipeId: recipe.id,
      });

      expect(result.length).toEqual(1);
      expect(result[0]).toMatchObject({
        productName: "Chopped tomatoes",
        inStock: true,
      });
    });

    test("applies another user's alias when enabled", async ({
      trpc,
      trpc2,
      user,
    }) => {
      config.recipes.communalLibrary = true;

      // user2 teaches the mapping; user (A) must benefit from it.
      await trpc2.pantry.setIngredientAlias({
        ingredientText: "passata",
        grocyProductId: 2,
      });

      const recipe = await createRecipe(user.id, "200ml passata");

      const result = await trpc.pantry.matchIngredients({
        recipeId: recipe.id,
      });

      expect(result[0]).toMatchObject({
        productId: 2,
        confidence: "alias",
      });
    });

    test("does not apply another user's alias when disabled", async ({
      trpc,
      trpc2,
      user,
    }) => {
      config.recipes.communalLibrary = false;

      await trpc2.pantry.setIngredientAlias({
        ingredientText: "passata",
        grocyProductId: 2,
      });

      const recipe = await createRecipe(user.id, "200ml passata");

      const result = await trpc.pantry.matchIngredients({
        recipeId: recipe.id,
      });

      expect(result[0].confidence).not.toEqual("alias");
    });
  });
});
