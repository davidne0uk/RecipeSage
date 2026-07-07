import { z } from "zod";
import { generateText, Output } from "ai";
import { PantryFillLevel } from "@recipesage/util/shared";
import { aiProvider } from "./vercel";
import { config } from "../general/config";
import { metrics } from "../general/metrics";
import { withNoObjectRetry } from "./withNoObjectRetry";

const photoToFillLevelSchema = z.object({
  fillLevel: z
    .enum(PantryFillLevel)
    .describe(
      "How full the container is: full (unopened or nearly), threeQuarters, half, quarter, or low (nearly empty)",
    ),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "How confident the estimate is. Use low when the container is opaque or the contents are not visible.",
    ),
});

export type PhotoFillLevelEstimate = z.infer<typeof photoToFillLevelSchema>;

/**
 * Estimates how full a container (jar, bottle) is from a photo, in coarse
 * buckets — the honest resolution for this task. The result is a proposal for
 * the user to confirm; it must never be written to stock directly.
 */
export const photoToFillLevel = async (
  imageB64: Uint8Array | ArrayBuffer | Buffer,
): Promise<PhotoFillLevelEstimate> => {
  const llmResponse = await withNoObjectRetry(() =>
    generateText({
      system:
        "You are a data processor utility for a household pantry inventory. Estimate the remaining contents of the container in the photo. Judge by the visible fill line where the container is transparent; for opaque containers use any visible cues and report low confidence.",
      model: aiProvider(config.ai.model.vision),
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "How full is this container? Estimate the remaining amount as a coarse bucket.",
            },
            {
              type: "image",
              image: imageB64,
            },
          ],
        },
      ],
      output: Output.object({
        schema: photoToFillLevelSchema,
      }),
    }),
  );

  if (llmResponse.totalUsage.totalTokens !== undefined) {
    metrics.llmTokensConsumed.observe(
      {
        category: "photoToFillLevel",
      },
      llmResponse.totalUsage.totalTokens,
    );
  }

  return llmResponse.output;
};
