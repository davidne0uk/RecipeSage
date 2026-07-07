import { authenticatedProcedure } from "../../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { grocyTrpc } from "./common";

export const moveItem = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/moveItem",
      tags: ["pantry"],
      summary:
        "Move a pantry item (product and all of its stock) to another location",
      protect: true,
    },
  })
  .input(
    z.object({
      productId: z.number().int().positive(),
      toLocationId: z.number().int().positive(),
    }),
  )
  .output(z.void())
  .mutation(async ({ input }) =>
    grocyTrpc(async (grocy) => {
      const [products, stock] = await Promise.all([
        grocy.getProducts(),
        grocy.getCurrentStock(),
      ]);

      const product = products.find((p) => p.id === input.productId);
      if (!product) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pantry item not found",
        });
      }
      if (product.locationId === input.toLocationId) return;

      await grocy.updateProductLocation(product.id, input.toLocationId);

      const amount =
        stock.find((item) => item.productId === product.id)?.amount || 0;
      if (amount > 0) {
        await grocy.transferStock(product.id, {
          amount,
          fromLocationId: product.locationId,
          toLocationId: input.toLocationId,
        });
      }
    }),
  );
