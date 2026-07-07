import { router } from "../../trpc";
import { getPantry } from "./getPantry";
import { getLocations } from "./getLocations";
import { getQuantityUnits } from "./getQuantityUnits";
import { createLocation } from "./createLocation";
import { renameLocation } from "./renameLocation";
import { deleteLocation } from "./deleteLocation";
import { addStock } from "./addStock";
import { consumeStock } from "./consumeStock";
import { moveItem } from "./moveItem";
import { setFillLevel } from "./setFillLevel";
import { resolveBarcode } from "./resolveBarcode";
import { createProduct } from "./createProduct";
import { identifyProductPhoto } from "./identifyProductPhoto";
import { estimateFillLevel } from "./estimateFillLevel";
import { matchIngredients } from "./matchIngredients";
import { setIngredientAlias } from "./setIngredientAlias";

export const pantryRouter = router({
  getPantry,
  getLocations,
  getQuantityUnits,
  createLocation,
  renameLocation,
  deleteLocation,
  addStock,
  consumeStock,
  moveItem,
  setFillLevel,
  resolveBarcode,
  createProduct,
  identifyProductPhoto,
  estimateFillLevel,
  matchIngredients,
  setIngredientAlias,
});
