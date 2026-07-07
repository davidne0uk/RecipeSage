import * as Sentry from "@sentry/node";

export interface OpenFoodFactsProduct {
  name: string;
  brand: string | null;
}

const OFF_BASE_URL = "https://world.openfoodfacts.org/api/v2/product";

/**
 * Looks a barcode up on Open Food Facts. Returns null when the product is
 * unknown, and also on OFF outages (callers fall through to photo/manual
 * entry either way — pantry capture must not depend on OFF being up).
 */
export const lookupOpenFoodFactsBarcode = async (
  barcode: string,
): Promise<OpenFoodFactsProduct | null> => {
  try {
    const response = await fetch(
      `${OFF_BASE_URL}/${encodeURIComponent(barcode)}.json?fields=product_name,brands`,
      {
        headers: {
          // OFF asks API consumers to identify themselves
          "user-agent": "RecipeSageSmartPantry/1.0 (self-hosted fork)",
        },
      },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Open Food Facts returned status ${response.status}`);
    }

    const json = await response.json();
    const name = json?.product?.product_name;
    if (json?.status !== 1 || !name) return null;

    const brand = json.product.brands?.split(",")[0]?.trim();
    return {
      name,
      brand: brand || null,
    };
  } catch (e) {
    console.error(e);
    Sentry.captureException(e);

    return null;
  }
};
