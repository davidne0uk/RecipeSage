import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { test } from "../../testutils";
import { createGrocyFetchMock } from "./testGrocy";

vi.hoisted(() => {
  process.env.GROCY_URL = "http://grocy.test/";
  process.env.GROCY_API_KEY = "test-key";
});

describe("addStock", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("adds stock as a purchase with best-before, at the product's home location", async ({
    trpc,
  }) => {
    grocy.on("POST", "/api/stock/products/10/add", []);

    await trpc.pantry.addStock({
      productId: 10,
      amount: 3,
      bestBeforeDate: "2027-01-01",
    });

    expect(grocy.callsTo("POST", "/api/stock/products/10/add")[0].body).toEqual(
      {
        amount: 3,
        transaction_type: "purchase",
        best_before_date: "2027-01-01",
      },
    );
  });

  test("rejects non-positive amounts", async ({ trpc }) => {
    await expect(
      trpc.pantry.addStock({ productId: 10, amount: 0 }),
    ).rejects.toThrow();
  });
});
