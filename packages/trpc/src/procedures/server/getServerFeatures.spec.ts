import { config } from "@recipesage/util/server/general";
import { test, anonymousTrpc } from "../../testutils";

describe("getServerFeatures", () => {
  afterEach(() => {
    config.recipes.communalLibrary = false;
  });

  test("reports the communal library as enabled when it is on", async ({
    trpc,
  }) => {
    config.recipes.communalLibrary = true;

    const response = await trpc.server.getServerFeatures();

    expect(response.communalRecipeLibrary).toEqual(true);
  });

  test("reports the communal library as disabled when it is off", async ({
    trpc,
  }) => {
    config.recipes.communalLibrary = false;

    const response = await trpc.server.getServerFeatures();

    expect(response.communalRecipeLibrary).toEqual(false);
  });

  test("is readable without a session", async () => {
    config.recipes.communalLibrary = true;

    const response = await anonymousTrpc.server.getServerFeatures();

    expect(response.communalRecipeLibrary).toEqual(true);
  });

  test("exposes feature flags only, and no other server config", async ({
    trpc,
  }) => {
    const response = await trpc.server.getServerFeatures();

    expect(Object.keys(response)).toEqual(["communalRecipeLibrary"]);
  });
});
