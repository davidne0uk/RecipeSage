import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { test } from "../../testutils";
import { createGrocyFetchMock, grocyProduct } from "./testGrocy";

vi.hoisted(() => {
  process.env.GROCY_URL = "http://grocy.test/";
  process.env.GROCY_API_KEY = "test-key";
});

describe("resolveBarcode", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("resolves a barcode Grocy already knows without calling OFF", async ({
    trpc,
  }) => {
    grocy.on("GET", "/api/stock/products/by-barcode/5000237999999", {
      product: grocyProduct(10, "Chopped tomatoes", 2, 1),
    });

    const result = await trpc.pantry.resolveBarcode({
      barcode: "5000237999999",
    });

    expect(result).toEqual({
      type: "product",
      product: {
        id: 10,
        name: "Chopped tomatoes",
        locationId: 2,
        quantityUnitId: 1,
      },
    });
    expect(
      grocy.calls.filter((call) => call.path.includes("openfoodfacts")).length,
    ).toEqual(0);
  });

  test("falls back to Open Food Facts for barcodes unknown to Grocy", async ({
    trpc,
  }) => {
    grocy
      .on(
        "GET",
        "/api/stock/products/by-barcode/5000237999999",
        { error_message: "No product with barcode" },
        400,
      )
      .on("GET", "/api/v2/product/5000237999999.json", {
        status: 1,
        product: { product_name: "Baked Beans", brands: "Heinz, Kraft" },
      });

    const result = await trpc.pantry.resolveBarcode({
      barcode: "5000237999999",
    });

    expect(result).toEqual({
      type: "offProduct",
      name: "Baked Beans",
      brand: "Heinz",
    });
  });

  test("returns unknown when neither Grocy nor OFF know the barcode", async ({
    trpc,
  }) => {
    grocy
      .on(
        "GET",
        "/api/stock/products/by-barcode/0000000000000",
        { error_message: "No product with barcode" },
        400,
      )
      .on(
        "GET",
        "/api/v2/product/0000000000000.json",
        { status: 0, status_verbose: "product not found" },
        404,
      );

    const result = await trpc.pantry.resolveBarcode({
      barcode: "0000000000000",
    });

    expect(result).toEqual({ type: "unknown" });
  });

  test("degrades to unknown when OFF is down", async ({ trpc }) => {
    grocy
      .on(
        "GET",
        "/api/stock/products/by-barcode/5000237999999",
        { error_message: "No product with barcode" },
        400,
      )
      .on("GET", "/api/v2/product/5000237999999.json", "oops", 503);

    const result = await trpc.pantry.resolveBarcode({
      barcode: "5000237999999",
    });

    expect(result).toEqual({ type: "unknown" });
  });
});
