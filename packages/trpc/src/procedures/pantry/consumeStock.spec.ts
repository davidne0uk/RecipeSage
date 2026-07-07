import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { test } from "../../testutils";
import { createGrocyFetchMock } from "./testGrocy";

vi.hoisted(() => {
  process.env.GROCY_URL = "http://grocy.test/";
  process.env.GROCY_API_KEY = "test-key";
});

describe("consumeStock", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("consumes the given amount", async ({ trpc }) => {
    grocy.on("POST", "/api/stock/products/10/consume", []);

    await trpc.pantry.consumeStock({ productId: 10, amount: 1 });

    expect(
      grocy.callsTo("POST", "/api/stock/products/10/consume")[0].body,
    ).toEqual({
      amount: 1,
      transaction_type: "consume",
      spoiled: false,
    });
  });
});
