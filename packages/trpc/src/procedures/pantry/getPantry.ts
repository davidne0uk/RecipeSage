import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { pantryLocationWithItemsSchema } from "@recipesage/util/shared";
import { buildPantryView } from "@recipesage/util/server/general";
import { grocyTrpc } from "./common";

export const getPantry = authenticatedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/pantry/getPantry",
      tags: ["pantry"],
      summary: "Get all pantry stock grouped by location",
      protect: true,
    },
  })
  .output(z.array(pantryLocationWithItemsSchema))
  .query(async () =>
    grocyTrpc(async (grocy) => {
      const [locations, stock, quantityUnits] = await Promise.all([
        grocy.getLocations(),
        grocy.getCurrentStock(),
        grocy.getQuantityUnits(),
      ]);

      return buildPantryView(locations, stock, quantityUnits);
    }),
  );
