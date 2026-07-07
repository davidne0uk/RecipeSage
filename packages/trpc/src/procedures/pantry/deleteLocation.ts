import { authenticatedProcedure } from "../../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { grocyTrpc } from "./common";

export const deleteLocation = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/deleteLocation",
      tags: ["pantry"],
      summary:
        "Delete a pantry storage location, moving its items to another location",
      protect: true,
    },
  })
  .input(
    z.object({
      locationId: z.number().int().positive(),
      /**
       * Required when the location still has products assigned to it.
       */
      moveItemsToLocationId: z.number().int().positive().optional(),
    }),
  )
  .output(z.void())
  .mutation(async ({ input }) =>
    grocyTrpc(async (grocy) => {
      if (input.moveItemsToLocationId === input.locationId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot move items to the location being deleted",
        });
      }

      const [products, stock] = await Promise.all([
        grocy.getProducts(),
        grocy.getCurrentStock(),
      ]);

      const productsAtLocation = products.filter(
        (product) => product.locationId === input.locationId,
      );

      if (productsAtLocation.length) {
        const destinationId = input.moveItemsToLocationId;
        if (!destinationId) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This location still contains items. Specify a location to move them to.",
          });
        }

        const stockAmountByProductId = new Map(
          stock.map((item) => [item.productId, item.amount]),
        );

        for (const product of productsAtLocation) {
          await grocy.updateProductLocation(product.id, destinationId);

          const amount = stockAmountByProductId.get(product.id) || 0;
          if (amount > 0) {
            await grocy.transferStock(product.id, {
              amount,
              fromLocationId: input.locationId,
              toLocationId: destinationId,
            });
          }
        }
      }

      await grocy.deleteLocation(input.locationId);
    }),
  );
