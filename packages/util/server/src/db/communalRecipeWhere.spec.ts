import { describe, it, expect, afterEach } from "vitest";
import { config } from "../general/config";
import { communalRecipeWhere } from "./communalRecipeWhere";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("communalRecipeWhere", () => {
  afterEach(() => {
    config.recipes.communalLibrary = false;
  });

  describe("when the communal library is disabled", () => {
    it("scopes the where clause to the calling user", () => {
      config.recipes.communalLibrary = false;

      expect(communalRecipeWhere(USER_ID, { id: "recipe-id" })).toEqual({
        id: "recipe-id",
        userId: USER_ID,
      });
    });

    it("scopes a multi id where clause to the calling user", () => {
      config.recipes.communalLibrary = false;

      expect(communalRecipeWhere(USER_ID, { id: { in: ["a", "b"] } })).toEqual({
        id: { in: ["a", "b"] },
        userId: USER_ID,
      });
    });
  });

  describe("when the communal library is enabled", () => {
    it("drops the owner predicate so any recipe may be targeted", () => {
      config.recipes.communalLibrary = true;

      expect(communalRecipeWhere(USER_ID, { id: "recipe-id" })).toEqual({
        id: "recipe-id",
      });
    });

    it("does not mutate the passed where clause", () => {
      config.recipes.communalLibrary = true;

      const where = { id: "recipe-id" };
      communalRecipeWhere(USER_ID, where);

      expect(where).toEqual({ id: "recipe-id" });
    });
  });
});
