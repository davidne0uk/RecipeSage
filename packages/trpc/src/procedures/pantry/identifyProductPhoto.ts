import { authenticatedProcedure } from "../../trpc";
import { TRPCError } from "@trpc/server";
import * as Sentry from "@sentry/node";
import { z } from "zod";
import { photoToProduct } from "@recipesage/util/server/ml";

/**
 * Identifies a product from a photo as a *proposal* for the user to confirm.
 * Never writes to Grocy — product creation happens via createProduct after
 * user confirmation.
 */
export const identifyProductPhoto = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/identifyProductPhoto",
      tags: ["pantry"],
      summary: "Identify a pantry product from a base64-encoded photo",
      protect: true,
    },
  })
  .input(
    z.object({
      image: z.string().min(1),
    }),
  )
  .output(
    z.object({
      identified: z.boolean(),
      name: z.string(),
      brand: z.string(),
      containerType: z.enum(["jar", "bottle", "tin", "pack", "other"]),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  )
  .mutation(async ({ input }) => {
    const imageBuffer = Buffer.from(input.image, "base64");

    try {
      return await photoToProduct(imageBuffer);
    } catch (e) {
      Sentry.captureException(e);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Photo identification is currently unavailable",
      });
    }
  });
