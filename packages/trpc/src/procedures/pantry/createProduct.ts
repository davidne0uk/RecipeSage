import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { resolvePantryLocationId } from "@recipesage/util/server/general";
import { grocyTrpc } from "./common";

/**
 * Creates a pantry product, optionally linking a scanned barcode and adding
 * initial stock in one step. Serves both manual product entry and the
 * barcode/photo capture flows.
 *
 * Grocy requires a location on every product; all pantry stock lives in one,
 * resolved here rather than chosen by the caller.
 */
export const createProduct = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/createProduct",
      tags: ["pantry"],
      summary: "Create a pantry product, optionally with barcode and stock",
      protect: true,
    },
  })
  .input(
    z.object({
      name: z.string().min(1).max(250),
      quantityUnitId: z.number().int().positive(),
      barcode: z.string().min(1).max(100).optional(),
      initialAmount: z.number().positive().optional(),
      bestBeforeDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
  )
  .output(
    z.object({
      productId: z.number(),
    }),
  )
  .mutation(async ({ input }) =>
    grocyTrpc(async (grocy) => {
      const locationId = await resolvePantryLocationId(grocy);

      const { id: productId } = await grocy.createProduct({
        name: input.name,
        locationId,
        quIdStock: input.quantityUnitId,
        quIdPurchase: input.quantityUnitId,
      });

      if (input.barcode) {
        await grocy.addProductBarcode(productId, input.barcode);
      }

      if (input.initialAmount) {
        await grocy.addStock(productId, {
          amount: input.initialAmount,
          bestBeforeDate: input.bestBeforeDate,
        });
      }

      return { productId };
    }),
  );
