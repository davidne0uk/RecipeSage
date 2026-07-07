import { z } from "zod";

/**
 * Coarse fill buckets for container-unit products (jars, bottles). These are
 * the honest resolution of photo-based estimation and map to fractional Grocy
 * stock amounts.
 */
export enum PantryFillLevel {
  Full = "full",
  ThreeQuarters = "threeQuarters",
  Half = "half",
  Quarter = "quarter",
  Low = "low",
}

export const PANTRY_FILL_LEVEL_AMOUNTS: Record<PantryFillLevel, number> = {
  [PantryFillLevel.Full]: 1,
  [PantryFillLevel.ThreeQuarters]: 0.75,
  [PantryFillLevel.Half]: 0.5,
  [PantryFillLevel.Quarter]: 0.25,
  [PantryFillLevel.Low]: 0.1,
};

/**
 * Maps the fractional part of a stock amount to the nearest fill bucket.
 * Amounts at or below zero return null (out of stock, not "low").
 */
export const amountToPantryFillLevel = (
  amount: number,
): PantryFillLevel | null => {
  if (amount <= 0) return null;

  let nearest: PantryFillLevel = PantryFillLevel.Full;
  let nearestDistance = Infinity;
  for (const [level, levelAmount] of Object.entries(
    PANTRY_FILL_LEVEL_AMOUNTS,
  )) {
    const distance = Math.abs(amount - levelAmount);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = level as PantryFillLevel;
    }
  }
  return nearest;
};

/**
 * Quantity units whose stock is displayed as a fill bucket rather than a
 * count. Matched case-insensitively against the Grocy quantity unit name.
 */
export const PANTRY_CONTAINER_UNIT_NAMES = ["jar", "bottle"];

export const isPantryContainerUnit = (unitName: string): boolean =>
  PANTRY_CONTAINER_UNIT_NAMES.includes(unitName.trim().toLowerCase());

export const pantryLocationSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type PantryLocation = z.infer<typeof pantryLocationSchema>;

export const pantryItemSchema = z.object({
  productId: z.number(),
  name: z.string(),
  locationId: z.number(),
  amount: z.number(),
  unitId: z.number(),
  unitName: z.string(),
  /**
   * Set for container-unit products only; derived from the fractional stock
   * amount of the current (open) container.
   */
  fillLevel: z.enum(PantryFillLevel).nullable(),
  bestBeforeDate: z.string().nullable(),
});
export type PantryItem = z.infer<typeof pantryItemSchema>;

export const pantryLocationWithItemsSchema = z.object({
  location: pantryLocationSchema,
  items: z.array(pantryItemSchema),
});
export type PantryLocationWithItems = z.infer<
  typeof pantryLocationWithItemsSchema
>;
