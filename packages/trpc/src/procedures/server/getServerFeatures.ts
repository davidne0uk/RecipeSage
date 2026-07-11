import { publicProcedure } from "../../trpc";
import { config } from "@recipesage/util/server/general";
import { z } from "zod";

/**
 * Feature flags the client needs in order to offer only what the API will
 * authorize. This must remain an explicit allowlist of booleans - never widen
 * it to return arbitrary server config, which would leak secrets.
 */
export const getServerFeatures = publicProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/server/getServerFeatures",
      tags: ["server"],
      summary: "Get the server's enabled feature flags",
    },
  })
  .output(
    z.object({
      communalRecipeLibrary: z.boolean(),
    }),
  )
  .query(async () => {
    return {
      communalRecipeLibrary: config.recipes.communalLibrary,
    };
  });
