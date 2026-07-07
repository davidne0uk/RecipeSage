import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { PantryFillLevel } from "@recipesage/util/shared";
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

describe("setFillLevel", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;
  const oregano = grocyProduct(20, "Oregano", 3, 2);

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
    grocy.on("POST", "/api/stock/products/20/inventory", []);
  });

  afterEach(() => {
    grocy.uninstall();
  });

  const inventoriedAmount = () =>
    (
      grocy.callsTo("POST", "/api/stock/products/20/inventory")[0].body as {
        new_amount: number;
      }
    ).new_amount;

  test("sets the open container's fraction", async ({ trpc }) => {
    grocy.on("GET", "/api/stock", [grocyStockItem(oregano, 0.5)]);

    await trpc.pantry.setFillLevel({
      productId: 20,
      fillLevel: PantryFillLevel.Quarter,
    });

    expect(inventoriedAmount()).toEqual(0.25);
  });

  test("preserves unopened spares", async ({ trpc }) => {
    grocy.on("GET", "/api/stock", [grocyStockItem(oregano, 1.25)]);

    await trpc.pantry.setFillLevel({
      productId: 20,
      fillLevel: PantryFillLevel.Half,
    });

    expect(inventoriedAmount()).toEqual(1.5);
  });

  test("treats one of the full containers as the open one for whole amounts", async ({
    trpc,
  }) => {
    grocy.on("GET", "/api/stock", [grocyStockItem(oregano, 2)]);

    await trpc.pantry.setFillLevel({
      productId: 20,
      fillLevel: PantryFillLevel.Half,
    });

    expect(inventoriedAmount()).toEqual(1.5);
  });

  test("creates stock at the bucket amount when the product has none", async ({
    trpc,
  }) => {
    grocy.on("GET", "/api/stock", []);

    await trpc.pantry.setFillLevel({
      productId: 20,
      fillLevel: PantryFillLevel.Low,
    });

    expect(inventoriedAmount()).toEqual(0.1);
  });
});
