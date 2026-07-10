import { authenticatedProcedure } from "../../trpc";
import { z } from "zod";
import { lookupOpenFoodFactsBarcode } from "@recipesage/util/server/general";
import { grocyTrpc } from "./common";

export const resolveBarcodeOutputSchema = z.discriminatedUnion("type", [
  /**
   * Barcode is already linked to a Grocy product.
   */
  z.object({
    type: z.literal("product"),
    product: z.object({
      id: z.number(),
      name: z.string(),
      quantityUnitId: z.number(),
    }),
  }),
  /**
   * Unknown to Grocy but found on Open Food Facts; the client should offer
   * product creation pre-filled with these details.
   */
  z.object({
    type: z.literal("offProduct"),
    name: z.string(),
    brand: z.string().nullable(),
  }),
  /**
   * Unknown everywhere; the client should offer photo identification or
   * manual entry.
   */
  z.object({
    type: z.literal("unknown"),
  }),
]);

export const resolveBarcode = authenticatedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/pantry/resolveBarcode",
      tags: ["pantry"],
      summary:
        "Resolve a scanned barcode via Grocy, falling back to Open Food Facts",
      protect: true,
    },
  })
  .input(
    z.object({
      barcode: z.string().min(1).max(100),
    }),
  )
  .output(resolveBarcodeOutputSchema)
  .query(async ({ input }) =>
    grocyTrpc(async (grocy) => {
      const product = await grocy.getProductByBarcode(input.barcode);
      if (product) {
        return {
          type: "product" as const,
          product: {
            id: product.id,
            name: product.name,
            quantityUnitId: product.quIdStock,
          },
        };
      }

      const offProduct = await lookupOpenFoodFactsBarcode(input.barcode);
      if (offProduct) {
        return {
          type: "offProduct" as const,
          name: offProduct.name,
          brand: offProduct.brand,
        };
      }

      return { type: "unknown" as const };
    }),
  );
