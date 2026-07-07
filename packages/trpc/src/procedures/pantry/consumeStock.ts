import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { grocyTrpc } from "./common";

export const consumeStock = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/consumeStock",
      tags: ["pantry"],
      summary: "Consume stock of a pantry product",
      protect: true,
    },
  })
  .input(
    z.object({
      productId: z.number().int().positive(),
      amount: z.number().positive(),
    }),
  )
  .output(z.void())
  .mutation(async ({ input }) =>
    grocyTrpc(async (grocy) =>
      grocy.consumeStock(input.productId, input.amount),
    ),
  );
