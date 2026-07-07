import { describe, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("moveItem", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("moves the product and transfers its stock", async ({ trpc }) => {
    const leftovers = grocyProduct(10, "Leftover chili", 1);
    grocy
      .on("GET", "/api/objects/products", [leftovers])
      .on("GET", "/api/stock", [grocyStockItem(leftovers, 2)])
      .on("PUT", "/api/objects/products/10", {})
      .on("POST", "/api/stock/products/10/transfer", []);

    await trpc.pantry.moveItem({ productId: 10, toLocationId: 3 });

    expect(grocy.callsTo("PUT", "/api/objects/products/10")[0].body).toEqual({
      location_id: 3,
    });
    expect(
      grocy.callsTo("POST", "/api/stock/products/10/transfer")[0].body,
    ).toEqual({
      amount: 2,
      location_id_from: 1,
      location_id_to: 3,
    });
  });

  test("skips the transfer when there is no stock", async ({ trpc }) => {
    grocy
      .on("GET", "/api/objects/products", [grocyProduct(10, "Milk", 1)])
      .on("GET", "/api/stock", [])
      .on("PUT", "/api/objects/products/10", {});

    await trpc.pantry.moveItem({ productId: 10, toLocationId: 3 });

    expect(
      grocy.callsTo("POST", "/api/stock/products/10/transfer").length,
    ).toEqual(0);
  });

  test("throws NOT_FOUND for an unknown product", async ({ trpc }) => {
    grocy.on("GET", "/api/objects/products", []).on("GET", "/api/stock", []);

    await expect(
      trpc.pantry.moveItem({ productId: 99, toLocationId: 3 }),
    ).rejects.toThrow("Pantry item not found");
  });
});
