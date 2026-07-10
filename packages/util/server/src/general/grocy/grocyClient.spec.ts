import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GrocyClient,
  GrocyRequestError,
  GrocyUnavailableError,
} from "./grocyClient";

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("GrocyClient", () => {
  let client: GrocyClient;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    client = new GrocyClient("http://grocy:80/", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the API key header and builds URLs without duplicate slashes", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client.getLocations();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://grocy:80/api/objects/locations",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "GROCY-API-KEY": "test-key" }),
      }),
    );
  });

  it("normalizes Grocy's stringly-typed numeric fields", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          product_id: "12",
          amount: "0.5",
          best_before_date: "2026-09-01",
          product: {
            id: "12",
            name: "Oregano",
            location_id: "4",
            qu_id_stock: "2",
            qu_id_purchase: "2",
          },
        },
      ]),
    );

    const stock = await client.getCurrentStock();

    expect(stock).toEqual([
      {
        productId: 12,
        amount: 0.5,
        bestBeforeDate: "2026-09-01",
        product: {
          id: 12,
          name: "Oregano",
          locationId: 4,
          quIdStock: 2,
          quIdPurchase: 2,
        },
      },
    ]);
  });

  it("returns the created id from object creation", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ created_object_id: "7" }));

    const result = await client.createLocation("Pantry");

    expect(result).toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://grocy:80/api/objects/locations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Pantry" }),
      }),
    );
  });

  it("maps snake_case fields when creating a product", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ created_object_id: 31 }));

    await client.createProduct({
      name: "Chopped tomatoes",
      locationId: 5,
      quIdStock: 3,
      quIdPurchase: 3,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://grocy:80/api/objects/products",
      expect.objectContaining({
        body: JSON.stringify({
          name: "Chopped tomatoes",
          location_id: 5,
          qu_id_stock: 3,
          qu_id_purchase: 3,
        }),
      }),
    );
  });

  describe("getProductByBarcode", () => {
    it("resolves a known barcode to its product", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          product: {
            id: 12,
            name: "Oregano",
            location_id: 4,
            qu_id_stock: 2,
            qu_id_purchase: 2,
          },
        }),
      );

      const product = await client.getProductByBarcode("5000237999999");

      expect(product?.name).toEqual("Oregano");
      expect(fetchMock).toHaveBeenCalledWith(
        "http://grocy:80/api/stock/products/by-barcode/5000237999999",
        expect.anything(),
      );
    });

    it("returns null for a barcode Grocy does not know", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error_message: "No product with barcode" }, 400),
      );

      const product = await client.getProductByBarcode("0000000000000");

      expect(product).toBeNull();
    });

    it("rethrows non-lookup errors", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error_message: "boom" }, 500));

      await expect(client.getProductByBarcode("123")).rejects.toBeInstanceOf(
        GrocyRequestError,
      );
    });
  });

  describe("stock mutations", () => {
    it("adds stock as a purchase transaction at the product's home location", async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));

      await client.addStock(12, {
        amount: 3,
        bestBeforeDate: "2027-01-01",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "http://grocy:80/api/stock/products/12/add",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            amount: 3,
            transaction_type: "purchase",
            best_before_date: "2027-01-01",
          }),
        }),
      );
    });

    it("sets absolute amounts via inventory correction", async () => {
      fetchMock.mockResolvedValue(jsonResponse([]));

      await client.setStockAmount(12, { newAmount: 0.25 });

      expect(fetchMock).toHaveBeenCalledWith(
        "http://grocy:80/api/stock/products/12/inventory",
        expect.objectContaining({
          body: JSON.stringify({ new_amount: 0.25 }),
        }),
      );
    });
  });

  describe("errors", () => {
    it("wraps network failures as GrocyUnavailableError", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));

      await expect(client.getLocations()).rejects.toBeInstanceOf(
        GrocyUnavailableError,
      );
    });

    it("wraps non-2xx responses as GrocyRequestError with status", async () => {
      fetchMock.mockResolvedValue(
        new Response("unauthorized", { status: 401 }),
      );

      const error = await client.getLocations().catch((e) => e);

      expect(error).toBeInstanceOf(GrocyRequestError);
      expect(error.status).toEqual(401);
    });
  });
});
