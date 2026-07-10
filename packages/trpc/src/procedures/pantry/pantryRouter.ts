import { router } from "../../trpc";
import { getPantry } from "./getPantry";
import { getQuantityUnits } from "./getQuantityUnits";
import { addStock } from "./addStock";
import { consumeStock } from "./consumeStock";
import { setFillLevel } from "./setFillLevel";
import { resolveBarcode } from "./resolveBarcode";
import { createProduct } from "./createProduct";
import { identifyProductPhoto } from "./identifyProductPhoto";
import { estimateFillLevel } from "./estimateFillLevel";
import { matchIngredients } from "./matchIngredients";
import { setIngredientAlias } from "./setIngredientAlias";

export const pantryRouter = router({
  getPantry,
  getQuantityUnits,
  addStock,
  consumeStock,
  setFillLevel,
  resolveBarcode,
  createProduct,
  identifyProductPhoto,
  estimateFillLevel,
  matchIngredients,
  setIngredientAlias,
});
