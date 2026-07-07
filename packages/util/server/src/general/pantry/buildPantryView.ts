import {
  amountToPantryFillLevel,
  isPantryContainerUnit,
  type PantryItem,
  type PantryLocationWithItems,
} from "@recipesage/util/shared";
import type {
  GrocyLocation,
  GrocyQuantityUnit,
  GrocyStockItem,
} from "../grocy";

/**
 * Builds the pantry view model from raw Grocy data: stock grouped by the
 * owning product's location, with fill buckets derived for container-unit
 * products. Pure so it can be tested without a Grocy connection.
 *
 * Every location is present in the result (even when empty) so the UI can
 * offer empty locations as add/move targets.
 */
export const buildPantryView = (
  locations: GrocyLocation[],
  stock: GrocyStockItem[],
  quantityUnits: GrocyQuantityUnit[],
): PantryLocationWithItems[] => {
  const unitsById = new Map(quantityUnits.map((unit) => [unit.id, unit]));

  const itemsByLocationId = new Map<number, PantryItem[]>();
  for (const stockItem of stock) {
    const unit = unitsById.get(stockItem.product.quIdStock);
    const unitName = unit?.name || "";
    const isContainer = isPantryContainerUnit(unitName);

    // For container units the fractional part describes the open container;
    // a whole-number amount means only unopened (full) containers remain.
    const fractionalPart = stockItem.amount % 1;
    const fillLevel = isContainer
      ? amountToPantryFillLevel(
          fractionalPart > 0 ? fractionalPart : Math.min(stockItem.amount, 1),
        )
      : null;

    const item: PantryItem = {
      productId: stockItem.productId,
      name: stockItem.product.name,
      locationId: stockItem.product.locationId,
      amount: stockItem.amount,
      unitId: stockItem.product.quIdStock,
      unitName,
      fillLevel,
      bestBeforeDate: stockItem.bestBeforeDate,
    };

    const items = itemsByLocationId.get(item.locationId) || [];
    items.push(item);
    itemsByLocationId.set(item.locationId, items);
  }

  return locations
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((location) => ({
      location,
      items: (itemsByLocationId.get(location.id) || []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
};
