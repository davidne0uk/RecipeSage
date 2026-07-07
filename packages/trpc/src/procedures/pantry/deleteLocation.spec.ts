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

describe("deleteLocation", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("deletes an empty location without requiring a destination", async ({
    trpc,
  }) => {
    grocy
      .on("GET", "/api/objects/products", [grocyProduct(10, "Milk", 1)])
      .on("GET", "/api/stock", [])
      .on("DELETE", "/api/objects/locations/2", {});

    await trpc.pantry.deleteLocation({ locationId: 2 });

    expect(grocy.callsTo("DELETE", "/api/objects/locations/2").length).toEqual(
      1,
    );
  });

  test("requires a destination when the location still has items", async ({
    trpc,
  }) => {
    grocy
      .on("GET", "/api/objects/products", [grocyProduct(10, "Milk", 2)])
      .on("GET", "/api/stock", []);

    await expect(trpc.pantry.deleteLocation({ locationId: 2 })).rejects.toThrow(
      "This location still contains items",
    );
  });

  test("moves products and their stock before deleting", async ({ trpc }) => {
    const milk = grocyProduct(10, "Milk", 2);
    grocy
      .on("GET", "/api/objects/products", [milk])
      .on("GET", "/api/stock", [grocyStockItem(milk, 2)])
      .on("PUT", "/api/objects/products/10", {})
      .on("POST", "/api/stock/products/10/transfer", [])
      .on("DELETE", "/api/objects/locations/2", {});

    await trpc.pantry.deleteLocation({
      locationId: 2,
      moveItemsToLocationId: 1,
    });

    expect(grocy.callsTo("PUT", "/api/objects/products/10")[0].body).toEqual({
      location_id: 1,
    });
    expect(
      grocy.callsTo("POST", "/api/stock/products/10/transfer")[0].body,
    ).toEqual({
      amount: 2,
      location_id_from: 2,
      location_id_to: 1,
    });
    expect(grocy.callsTo("DELETE", "/api/objects/locations/2").length).toEqual(
      1,
    );
  });

  test("rejects moving items to the location being deleted", async ({
    trpc,
  }) => {
    await expect(
      trpc.pantry.deleteLocation({
        locationId: 2,
        moveItemsToLocationId: 2,
      }),
    ).rejects.toThrow("Cannot move items to the location being deleted");
  });
});
