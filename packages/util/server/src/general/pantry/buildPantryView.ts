import {
  amountToPantryFillLevel,
  isPantryContainerUnit,
  type PantryItem,
} from "@recipesage/util/shared";
import type { GrocyQuantityUnit, GrocyStockItem } from "../grocy";

/**
 * Builds the pantry view model from raw Grocy data: every stocked item in one
 * list sorted by name, with fill buckets derived for container-unit products.
 * Pure so it can be tested without a Grocy connection.
 *
 * All stock lives in a single Grocy location, so the view has no notion of
 * placement.
 */
export const buildPantryView = (
  stock: GrocyStockItem[],
  quantityUnits: GrocyQuantityUnit[],
): PantryItem[] => {
  const unitsById = new Map(quantityUnits.map((unit) => [unit.id, unit]));

  return stock
    .map((stockItem) => {
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

      return {
        productId: stockItem.productId,
        name: stockItem.product.name,
        amount: stockItem.amount,
        unitId: stockItem.product.quIdStock,
        unitName,
        fillLevel,
        bestBeforeDate: stockItem.bestBeforeDate,
      } satisfies PantryItem;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};
