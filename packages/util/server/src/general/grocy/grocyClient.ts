import { config } from "../config";
import type {
  GrocyAddStockInput,
  GrocyCreateProductInput,
  GrocyLocation,
  GrocyProduct,
  GrocyProductBarcode,
  GrocyQuantityUnit,
  GrocySetStockAmountInput,
  GrocyStockItem,
  GrocyTransferStockInput,
} from "./types";

/**
 * Grocy is not configured for this deployment (GROCY_URL / GROCY_API_KEY
 * unset). Pantry features should be reported as disabled, not broken.
 */
export class GrocyNotConfiguredError extends Error {
  constructor() {
    super("Grocy is not configured (GROCY_URL / GROCY_API_KEY)");
    this.name = "GrocyNotConfiguredError";
  }
}

/**
 * Grocy is configured but could not be reached.
 */
export class GrocyUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Grocy is unreachable");
    this.name = "GrocyUnavailableError";
    this.cause = cause;
  }
}

/**
 * Grocy responded with a non-2xx status.
 */
export class GrocyRequestError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(`Grocy request failed with status ${status}: ${body}`);
    this.name = "GrocyRequestError";
    this.status = status;
  }
}

const toNumber = (value: unknown): number => Number(value);

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapLocation = (raw: any): GrocyLocation => ({
  id: toNumber(raw.id),
  name: raw.name,
});

const mapQuantityUnit = (raw: any): GrocyQuantityUnit => ({
  id: toNumber(raw.id),
  name: raw.name,
  namePlural: raw.name_plural || raw.name,
});

const mapProduct = (raw: any): GrocyProduct => ({
  id: toNumber(raw.id),
  name: raw.name,
  locationId: toNumber(raw.location_id),
  quIdStock: toNumber(raw.qu_id_stock),
  quIdPurchase: toNumber(raw.qu_id_purchase),
});

const mapProductBarcode = (raw: any): GrocyProductBarcode => ({
  id: toNumber(raw.id),
  productId: toNumber(raw.product_id),
  barcode: raw.barcode,
});

const mapStockItem = (raw: any): GrocyStockItem => ({
  productId: toNumber(raw.product_id),
  amount: toNumber(raw.amount),
  bestBeforeDate: raw.best_before_date || null,
  product: mapProduct(raw.product),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export class GrocyClient {
  constructor(
    private grocyUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.grocyUrl.replace(/\/+$/, "")}/api/${path}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          "GROCY-API-KEY": this.apiKey,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new GrocyUnavailableError(e);
    }

    if (!response.ok) {
      throw new GrocyRequestError(response.status, await response.text());
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async createObject(
    entity: string,
    body: unknown,
  ): Promise<{ id: number }> {
    const result = await this.request<{ created_object_id: unknown }>(
      "POST",
      `objects/${entity}`,
      body,
    );
    return { id: toNumber(result.created_object_id) };
  }

  async getLocations(): Promise<GrocyLocation[]> {
    const raw = await this.request<unknown[]>("GET", "objects/locations");
    return raw.map(mapLocation);
  }

  async createLocation(name: string): Promise<{ id: number }> {
    return this.createObject("locations", { name });
  }

  async updateLocation(id: number, name: string): Promise<void> {
    await this.request("PUT", `objects/locations/${id}`, { name });
  }

  async deleteLocation(id: number): Promise<void> {
    await this.request("DELETE", `objects/locations/${id}`);
  }

  async getQuantityUnits(): Promise<GrocyQuantityUnit[]> {
    const raw = await this.request<unknown[]>("GET", "objects/quantity_units");
    return raw.map(mapQuantityUnit);
  }

  async getProducts(): Promise<GrocyProduct[]> {
    const raw = await this.request<unknown[]>("GET", "objects/products");
    return raw.map(mapProduct);
  }

  async createProduct(input: GrocyCreateProductInput): Promise<{ id: number }> {
    return this.createObject("products", {
      name: input.name,
      location_id: input.locationId,
      qu_id_stock: input.quIdStock,
      qu_id_purchase: input.quIdPurchase,
    });
  }

  async updateProductLocation(id: number, locationId: number): Promise<void> {
    await this.request("PUT", `objects/products/${id}`, {
      location_id: locationId,
    });
  }

  async getProductBarcodes(): Promise<GrocyProductBarcode[]> {
    const raw = await this.request<unknown[]>(
      "GET",
      "objects/product_barcodes",
    );
    return raw.map(mapProductBarcode);
  }

  async addProductBarcode(
    productId: number,
    barcode: string,
  ): Promise<{ id: number }> {
    return this.createObject("product_barcodes", {
      product_id: productId,
      barcode,
    });
  }

  /**
   * Current aggregate stock across all products that have stock.
   */
  async getCurrentStock(): Promise<GrocyStockItem[]> {
    const raw = await this.request<unknown[]>("GET", "stock");
    return raw.map(mapStockItem);
  }

  /**
   * Resolves a barcode to the product it is linked to, or null when Grocy
   * does not know the barcode.
   */
  async getProductByBarcode(barcode: string): Promise<GrocyProduct | null> {
    try {
      const raw = await this.request<{ product: unknown }>(
        "GET",
        `stock/products/by-barcode/${encodeURIComponent(barcode)}`,
      );
      return mapProduct(raw.product);
    } catch (e) {
      if (
        e instanceof GrocyRequestError &&
        (e.status === 400 || e.status === 404)
      ) {
        return null;
      }
      throw e;
    }
  }

  async addStock(productId: number, input: GrocyAddStockInput): Promise<void> {
    await this.request("POST", `stock/products/${productId}/add`, {
      amount: input.amount,
      transaction_type: "purchase",
      best_before_date: input.bestBeforeDate,
      location_id: input.locationId,
    });
  }

  async consumeStock(productId: number, amount: number): Promise<void> {
    await this.request("POST", `stock/products/${productId}/consume`, {
      amount,
      transaction_type: "consume",
      spoiled: false,
    });
  }

  async transferStock(
    productId: number,
    input: GrocyTransferStockInput,
  ): Promise<void> {
    await this.request("POST", `stock/products/${productId}/transfer`, {
      amount: input.amount,
      location_id_from: input.fromLocationId,
      location_id_to: input.toLocationId,
    });
  }

  /**
   * Sets the absolute stock amount for a product (Grocy "inventory"
   * correction). Used for fill-level updates on container-unit products.
   */
  async setStockAmount(
    productId: number,
    input: GrocySetStockAmountInput,
  ): Promise<void> {
    await this.request("POST", `stock/products/${productId}/inventory`, {
      new_amount: input.newAmount,
      best_before_date: input.bestBeforeDate,
      location_id: input.locationId,
    });
  }
}

/**
 * Returns a client for the deployment's configured Grocy, or throws
 * GrocyNotConfiguredError when pantry features are not set up.
 */
export const getGrocyClient = (): GrocyClient => {
  if (!config.grocy.url || !config.grocy.apiKey) {
    throw new GrocyNotConfiguredError();
  }
  return new GrocyClient(config.grocy.url, config.grocy.apiKey);
};

export const isGrocyConfigured = (): boolean =>
  Boolean(config.grocy.url && config.grocy.apiKey);
