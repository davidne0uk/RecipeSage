import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { test } from "../../testutils";
import {
  createGrocyFetchMock,
  grocyProduct,
  grocyStockItem,
} from "./testGrocy";
import { PANTRY_UNAVAILABLE_MESSAGE } from "./common";

vi.hoisted(() => {
  process.env.GROCY_URL = "http://grocy.test/";
  process.env.GROCY_API_KEY = "test-key";
});

describe("getPantry", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("returns a flat list sorted by name with fill buckets for container units", async ({
    trpc,
  }) => {
    const tin = grocyProduct(10, "Chopped tomatoes", 1, 1);
    const jar = grocyProduct(20, "Oregano", 1, 2);
    grocy
      .on("GET", "/api/objects/quantity_units", [
        { id: 1, name: "Tin", name_plural: "Tins" },
        { id: 2, name: "Jar", name_plural: "Jars" },
      ])
      .on("GET", "/api/stock", [
        grocyStockItem(jar, 0.5),
        grocyStockItem(tin, 3, "2027-01-01"),
      ]);

    const pantry = await trpc.pantry.getPantry();

    expect(pantry.map((item) => item.name)).toEqual([
      "Chopped tomatoes",
      "Oregano",
    ]);
    expect(pantry[0]).toMatchObject({
      name: "Chopped tomatoes",
      amount: 3,
      fillLevel: null,
      bestBeforeDate: "2027-01-01",
    });
    expect(pantry[1]).toMatchObject({ name: "Oregano", fillLevel: "half" });
  });

  test("does not read locations from Grocy", async ({ trpc }) => {
    grocy
      .on("GET", "/api/objects/quantity_units", [])
      .on("GET", "/api/stock", []);

    await trpc.pantry.getPantry();

    expect(grocy.callsTo("GET", "/api/objects/locations").length).toEqual(0);
  });

  test("reports the pantry service as unavailable when Grocy is unreachable", async ({
    trpc,
  }) => {
    grocy.fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(trpc.pantry.getPantry()).rejects.toThrow(
      PANTRY_UNAVAILABLE_MESSAGE,
    );
  });
});
