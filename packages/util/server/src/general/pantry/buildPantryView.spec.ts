import { describe, it, expect } from "vitest";
import { buildPantryView } from "./buildPantryView";
import type { GrocyProduct, GrocyQuantityUnit, GrocyStockItem } from "../grocy";

const units: GrocyQuantityUnit[] = [
  { id: 1, name: "Tin", namePlural: "Tins" },
  { id: 2, name: "Jar", namePlural: "Jars" },
];

const product = (
  id: number,
  name: string,
  quIdStock: number,
): GrocyProduct => ({
  id,
  name,
  locationId: 1,
  quIdStock,
  quIdPurchase: quIdStock,
});

const stockItem = (
  productDef: GrocyProduct,
  amount: number,
  bestBeforeDate: string | null = null,
): GrocyStockItem => ({
  productId: productDef.id,
  amount,
  bestBeforeDate,
  product: productDef,
});

describe("buildPantryView", () => {
  it("returns every stocked item in one list sorted by name", () => {
    const view = buildPantryView(
      [
        stockItem(product(11, "Coconut milk", 1), 2),
        stockItem(product(20, "Oregano", 2), 0.5),
        stockItem(product(10, "Chopped tomatoes", 1), 3, "2027-01-01"),
      ],
      units,
    );

    expect(view.map((item) => item.name)).toEqual([
      "Chopped tomatoes",
      "Coconut milk",
      "Oregano",
    ]);
    expect(view[0].bestBeforeDate).toEqual("2027-01-01");
  });

  it("returns an empty list when nothing is in stock", () => {
    expect(buildPantryView([], units)).toEqual([]);
  });

  it("does not assign fill levels to count-based units", () => {
    const [item] = buildPantryView(
      [stockItem(product(10, "Chopped tomatoes", 1), 3)],
      units,
    );

    expect(item.fillLevel).toBeNull();
    expect(item.amount).toEqual(3);
    expect(item.unitName).toEqual("Tin");
  });

  it("derives fill buckets for container units from the fractional amount", () => {
    const view = buildPantryView(
      [
        stockItem(product(20, "Oregano", 2), 0.5),
        stockItem(product(21, "Basil", 2), 0.1),
        stockItem(product(22, "Thyme", 2), 1),
      ],
      units,
    );

    const byName = Object.fromEntries(view.map((item) => [item.name, item]));
    expect(byName["Oregano"].fillLevel).toEqual("half");
    expect(byName["Basil"].fillLevel).toEqual("low");
    expect(byName["Thyme"].fillLevel).toEqual("full");
  });

  it("uses the open container's fraction when unopened spares exist", () => {
    // 1 spare full jar + one open jar at a quarter
    const [item] = buildPantryView(
      [stockItem(product(20, "Oregano", 2), 1.25)],
      units,
    );

    expect(item.fillLevel).toEqual("quarter");
    expect(item.amount).toEqual(1.25);
  });

  it("snaps near-bucket amounts to the nearest bucket", () => {
    const [item] = buildPantryView(
      [stockItem(product(20, "Oregano", 2), 0.8)],
      units,
    );

    expect(item.fillLevel).toEqual("threeQuarters");
  });

  it("leaves the unit name empty when the quantity unit is unknown", () => {
    const [item] = buildPantryView(
      [stockItem(product(30, "Mystery item", 99), 1)],
      units,
    );

    expect(item.unitName).toEqual("");
    expect(item.fillLevel).toBeNull();
  });
});
