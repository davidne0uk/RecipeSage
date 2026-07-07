import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { test } from "../../testutils";
import { createGrocyFetchMock } from "./testGrocy";

vi.hoisted(() => {
  process.env.GROCY_URL = "http://grocy.test/";
  process.env.GROCY_API_KEY = "test-key";
});

describe("createProduct", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
    grocy.on("POST", "/api/objects/products", { created_object_id: 31 });
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("creates a bare product", async ({ trpc }) => {
    const result = await trpc.pantry.createProduct({
      name: "Chopped tomatoes",
      locationId: 2,
      quantityUnitId: 1,
    });

    expect(result).toEqual({ productId: 31 });
    expect(grocy.callsTo("POST", "/api/objects/products")[0].body).toEqual({
      name: "Chopped tomatoes",
      location_id: 2,
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

  test("links a barcode and adds initial stock when provided", async ({
    trpc,
  }) => {
    grocy
      .on("POST", "/api/objects/product_barcodes", { created_object_id: 5 })
      .on("POST", "/api/stock/products/31/add", []);

    await trpc.pantry.createProduct({
      name: "Chopped tomatoes",
      locationId: 2,
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
        location_id: 2,
      },
    );
  });
});
