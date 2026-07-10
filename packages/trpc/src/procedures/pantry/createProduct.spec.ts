import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { test } from "../../testutils";
import { createGrocyFetchMock, grocyLocation } from "./testGrocy";

vi.hoisted(() => {
  process.env.GROCY_URL = "http://grocy.test/";
  process.env.GROCY_API_KEY = "test-key";
});

describe("createProduct", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
    grocy
      .on("GET", "/api/objects/locations", [
        grocyLocation(1, "Fridge"),
        grocyLocation(4, "Pantry"),
      ])
      .on("POST", "/api/objects/products", { created_object_id: 31 });
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("creates a bare product against the resolved Pantry location", async ({
    trpc,
  }) => {
    const result = await trpc.pantry.createProduct({
      name: "Chopped tomatoes",
      quantityUnitId: 1,
    });

    expect(result).toEqual({ productId: 31 });
    expect(grocy.callsTo("POST", "/api/objects/products")[0].body).toEqual({
      name: "Chopped tomatoes",
      location_id: 4,
      qu_id_stock: 1,
      qu_id_purchase: 1,
    });
    expect(
      grocy.callsTo("POST", "/api/objects/product_barcodes").length,
    ).toEqual(0);
    expect(grocy.callsTo("POST", "/api/stock/products/31/add").length).toEqual(
      0,
    );
  });

  test("creates the Pantry location when the instance has none", async ({
    trpc,
  }) => {
    grocy
      .on("GET", "/api/objects/locations", [])
      .on("POST", "/api/objects/locations", { created_object_id: 9 });

    await trpc.pantry.createProduct({
      name: "Chopped tomatoes",
      quantityUnitId: 1,
    });

    expect(grocy.callsTo("POST", "/api/objects/locations")[0].body).toEqual({
      name: "Pantry",
    });
    expect(
      grocy.callsTo("POST", "/api/objects/products")[0].body,
    ).toMatchObject({ location_id: 9 });
  });

  test("links a barcode and adds initial stock when provided", async ({
    trpc,
  }) => {
    grocy
      .on("POST", "/api/objects/product_barcodes", { created_object_id: 5 })
      .on("POST", "/api/stock/products/31/add", []);

    await trpc.pantry.createProduct({
      name: "Chopped tomatoes",
      quantityUnitId: 1,
      barcode: "5000237999999",
      initialAmount: 3,
      bestBeforeDate: "2027-01-01",
    });

    expect(
      grocy.callsTo("POST", "/api/objects/product_barcodes")[0].body,
    ).toEqual({
      product_id: 31,
      barcode: "5000237999999",
    });
    expect(grocy.callsTo("POST", "/api/stock/products/31/add")[0].body).toEqual(
      {
        amount: 3,
        transaction_type: "purchase",
        best_before_date: "2027-01-01",
      },
    );
  });
});
