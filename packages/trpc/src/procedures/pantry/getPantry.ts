import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { pantryItemSchema } from "@recipesage/util/shared";
import { buildPantryView } from "@recipesage/util/server/general";
import { grocyTrpc } from "./common";

export const getPantry = authenticatedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/pantry/getPantry",
      tags: ["pantry"],
      summary: "Get all pantry stock",
      protect: true,
    },
  })
  .output(z.array(pantryItemSchema))
  .query(async () =>
    grocyTrpc(async (grocy) => {
      const [stock, quantityUnits] = await Promise.all([
        grocy.getCurrentStock(),
        grocy.getQuantityUnits(),
      ]);

      return buildPantryView(stock, quantityUnits);
    }),
  );
