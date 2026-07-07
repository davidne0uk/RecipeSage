import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import {
  PantryFillLevel,
  PANTRY_FILL_LEVEL_AMOUNTS,
} from "@recipesage/util/shared";
import { grocyTrpc } from "./common";

export const setFillLevel = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/setFillLevel",
      tags: ["pantry"],
      summary:
        "Set the fill level of the open container of a container-unit product",
      protect: true,
    },
  })
  .input(
    z.object({
      productId: z.number().int().positive(),
      fillLevel: z.enum(PantryFillLevel),
    }),
  )
  .output(z.void())
  .mutation(async ({ input }) =>
    grocyTrpc(async (grocy) => {
      const stock = await grocy.getCurrentStock();
      const currentAmount =
        stock.find((item) => item.productId === input.productId)?.amount || 0;

      // The fill level describes the open container. Unopened spares (the
      // whole-number part of the amount) are preserved; when the amount is a
      // whole number, one of those containers is considered the open one.
      const spares =
        currentAmount % 1 > 0
          ? Math.floor(currentAmount)
          : Math.max(currentAmount - 1, 0);
      const newAmount = spares + PANTRY_FILL_LEVEL_AMOUNTS[input.fillLevel];

      await grocy.setStockAmount(input.productId, { newAmount });
    }),
  );
