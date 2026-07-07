import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "@recipesage/prisma";
import { clearPantryMatchCache } from "@recipesage/util/server/general";
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
});
