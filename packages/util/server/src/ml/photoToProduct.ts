import { z } from "zod";
import { generateText, Output } from "ai";
import { aiProvider } from "./vercel";
import { config } from "../general/config";
import { metrics } from "../general/metrics";
import { withNoObjectRetry } from "./withNoObjectRetry";

const photoToProductSchema = z.object({
  identified: z
    .boolean()
    .describe("Whether a grocery product could be identified in the photo"),
  name: z
    .string()
    .describe(
      "A short generic product name suitable for a pantry inventory, e.g. 'Chopped tomatoes' or 'Dried oregano'. Empty string if not identified.",
    ),
  brand: z
    .string()
    .describe("The brand name if visible, otherwise empty string"),
  containerType: z
    .enum(["jar", "bottle", "tin", "pack", "other"])
    .describe("The kind of container the product is in"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe(
      "How confident the identification is. Use low when the product kind is a guess.",
    ),
});

export type PhotoProductIdentification = z.infer<typeof photoToProductSchema>;

/**
 * Identifies a grocery product from a photo. Used as the pantry capture
 * fallback when an item has no (readable) barcode. The result is a proposal
 * for the user to confirm; it must never be written to stock directly.
 */
export const photoToProduct = async (
  imageB64: Uint8Array | ArrayBuffer | Buffer,
): Promise<PhotoProductIdentification> => {
  const llmResponse = await withNoObjectRetry(() =>
    generateText({
      system:
        "You are a data processor utility for a household pantry inventory. Identify the single most prominent grocery product in the photo. Do not invent details you cannot see; prefer generic product names over marketing names.",
      model: aiProvider(config.ai.model.vision),
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "I took this photo of a grocery item from my kitchen. Identify the product for my pantry inventory.",
            },
            {
              type: "image",
              image: imageB64,
            },
          ],
        },
      ],
      output: Output.object({
        schema: photoToProductSchema,
      }),
    }),
  );

  if (llmResponse.totalUsage.totalTokens !== undefined) {
    metrics.llmTokensConsumed.observe(
      {
        category: "photoToProduct",
      },
      llmResponse.totalUsage.totalTokens,
    );
  }

  return llmResponse.output;
};
