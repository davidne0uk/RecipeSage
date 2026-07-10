import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { grocyTrpc } from "./common";

export const addStock = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/addStock",
      tags: ["pantry"],
      summary: "Add stock of a pantry product",
      protect: true,
    },
  })
  .input(
    z.object({
      productId: z.number().int().positive(),
      amount: z.number().positive(),
      bestBeforeDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  )
  .output(z.void())
  .mutation(async ({ input }) =>
    grocyTrpc(async (grocy) =>
      grocy.addStock(input.productId, {
        amount: input.amount,
        bestBeforeDate: input.bestBeforeDate,
      }),
    ),
  );
