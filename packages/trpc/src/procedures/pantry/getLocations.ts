import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { pantryLocationSchema } from "@recipesage/util/shared";
import { grocyTrpc } from "./common";

export const getLocations = authenticatedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/pantry/getLocations",
      tags: ["pantry"],
      summary: "Get all pantry storage locations",
      protect: true,
    },
  })
  .output(z.array(pantryLocationSchema))
  .query(async () => grocyTrpc(async (grocy) => grocy.getLocations()));
