import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { test } from "../../testutils";
import { createGrocyFetchMock } from "./testGrocy";

vi.hoisted(() => {
  process.env.GROCY_URL = "http://grocy.test/";
  process.env.GROCY_API_KEY = "test-key";
});

describe("createLocation", () => {
  let grocy: ReturnType<typeof createGrocyFetchMock>;

  beforeEach(() => {
    grocy = createGrocyFetchMock();
    grocy.install();
  });

  afterEach(() => {
    grocy.uninstall();
  });

  test("creates a location in Grocy and returns its id", async ({ trpc }) => {
    grocy.on("POST", "/api/objects/locations", { created_object_id: "7" });

    const result = await trpc.pantry.createLocation({
      name: "Baking cupboard",
    });

    expect(result).toEqual({ id: 7 });
    expect(grocy.callsTo("POST", "/api/objects/locations")[0].body).toEqual({
      name: "Baking cupboard",
    });
  });
});
