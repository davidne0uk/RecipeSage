import { describe, expect, vi } from "vitest";
import { test } from "../../testutils";
import { PANTRY_NOT_CONFIGURED_MESSAGE } from "./common";

// Simulates a deployment without the pantry feature set up
vi.hoisted(() => {
  delete process.env.GROCY_URL;
  delete process.env.GROCY_API_KEY;
});

describe("pantry without Grocy configured", () => {
  test("pantry procedures fail with a typed not-configured error", async ({
    trpc,
  }) => {
    await expect(trpc.pantry.getPantry()).rejects.toThrow(
      PANTRY_NOT_CONFIGURED_MESSAGE,
    );
    await expect(
      trpc.pantry.createLocation({ name: "Fridge" }),
    ).rejects.toThrow(PANTRY_NOT_CONFIGURED_MESSAGE);
  });

  test("the rest of the app is unaffected", async ({ trpc }) => {
    const shoppingLists = await trpc.shoppingLists.getShoppingLists();

    expect(shoppingLists).toEqual([]);
  });
});
