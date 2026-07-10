/**
 * Types for the subset of the Grocy v4 REST API used by the pantry feature.
 * Grocy is PHP-backed and returns numeric fields inconsistently as numbers or
 * strings; GrocyClient normalizes them to numbers at the boundary.
 */

export interface GrocyLocation {
  id: number;
  name: string;
}

export interface GrocyQuantityUnit {
  id: number;
  name: string;
  namePlural: string;
}

export interface GrocyProduct {
  id: number;
  name: string;
  locationId: number;
  quIdStock: number;
  quIdPurchase: number;
}

export interface GrocyProductBarcode {
  id: number;
  productId: number;
  barcode: string;
}

/**
 * One row of GET /api/stock: current aggregate stock for a product.
 */
export interface GrocyStockItem {
  productId: number;
  amount: number;
  bestBeforeDate: string | null;
  product: GrocyProduct;
}

export interface GrocyCreateProductInput {
  name: string;
  locationId: number;
  quIdStock: number;
  quIdPurchase: number;
}

export interface GrocyAddStockInput {
  amount: number;
  bestBeforeDate?: string;
}

export interface GrocySetStockAmountInput {
  newAmount: number;
  bestBeforeDate?: string;
}
