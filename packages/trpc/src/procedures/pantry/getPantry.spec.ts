import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { test } from "../../testutils";
import {
  createGrocyFetchMock,
  grocyLocation,
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

  test("groups stock by location with fill buckets for container units", async ({
    trpc,
  }) => {
    const tin = grocyProduct(10, "Chopped tomatoes", 2, 1);
    const jar = grocyProduct(20, "Oregano", 3, 2);
    grocy
      .on("GET", "/api/objects/locations", [
        grocyLocation(1, "Fridge"),
        grocyLocation(2, "Tin drawer"),
        grocyLocation(3, "Herb drawer"),
      ])
      .on("GET", "/api/objects/quantity_units", [
        { id: 1, name: "Tin", name_plural: "Tins" },
        { id: 2, name: "Jar", name_plural: "Jars" },
      ])
      .on("GET", "/api/stock", [
        grocyStockItem(tin, 3, "2027-01-01"),
        grocyStockItem(jar, 0.5),
      ]);

    const pantry = await trpc.pantry.getPantry();

    const byName = Object.fromEntries(
      pantry.map((entry) => [entry.location.name, entry.items]),
    );
    expect(byName["Fridge"]).toEqual([]);
    expect(byName["Tin drawer"][0]).toMatchObject({
      name: "Chopped tomatoes",
      amount: 3,
      fillLevel: null,
      bestBeforeDate: "2027-01-01",
    });
    expect(byName["Herb drawer"][0]).toMatchObject({
      name: "Oregano",
      fillLevel: "half",
    });
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
