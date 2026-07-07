import { authenticatedProcedure } from "../../trpc";
import { TRPCError } from "@trpc/server";
import * as Sentry from "@sentry/node";
import { z } from "zod";
import { PantryFillLevel } from "@recipesage/util/shared";
import { photoToFillLevel } from "@recipesage/util/server/ml";

/**
 * Estimates a container's fill level from a photo as a *proposal* for the
 * user to confirm or adjust. Never writes to Grocy — the confirmed bucket is
 * applied via setFillLevel.
 */
export const estimateFillLevel = authenticatedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/pantry/estimateFillLevel",
      tags: ["pantry"],
      summary: "Estimate a container's fill level from a base64-encoded photo",
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
      fillLevel: z.enum(PantryFillLevel),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  )
  .mutation(async ({ input }) => {
    const imageBuffer = Buffer.from(input.image, "base64");

    try {
      return await photoToFillLevel(imageBuffer);
    } catch (e) {
      Sentry.captureException(e);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Fill level estimation is currently unavailable",
      });
    }
  });
