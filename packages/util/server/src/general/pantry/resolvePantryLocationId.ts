import type { GrocyClient } from "../grocy";

/**
 * The single storage location every pantry product lives in. Grocy requires a
 * location on every product, but the pantry has no concept of placement: this
 * name is an implementation detail and is never surfaced in the API or UI.
 */
export const PANTRY_LOCATION_NAME = "Pantry";

/**
 * Resolves the canonical pantry location, creating it when absent.
 *
 * Deliberately uncached: this is only called when creating a product, and a
 * cached id goes stale the moment someone deletes the location in Grocy's own
 * UI, breaking every subsequent creation until the backend restarts.
 *
 * Grocy permits duplicate location names, so two concurrent creations on a
 * fresh instance can both create one. Taking the lowest id makes later
 * resolutions converge on a single location; the consolidation script removes
 * the orphan.
 */
export const resolvePantryLocationId = async (
  grocy: GrocyClient,
): Promise<number> => {
  const locations = await grocy.getLocations();

  const matches = locations.filter(
    (location) =>
      location.name.trim().toLowerCase() === PANTRY_LOCATION_NAME.toLowerCase(),
  );
  if (matches.length) {
    return Math.min(...matches.map((location) => location.id));
  }

  const { id } = await grocy.createLocation(PANTRY_LOCATION_NAME);
  return id;
};
