import { describe, it, expect } from "vitest";
import { buildPantryView } from "./buildPantryView";
import type {
  GrocyLocation,
  GrocyProduct,
  GrocyQuantityUnit,
  GrocyStockItem,
} from "../grocy";

const locations: GrocyLocation[] = [
  { id: 1, name: "Fridge" },
  { id: 2, name: "Tin drawer" },
  { id: 3, name: "Herb drawer" },
];

const units: GrocyQuantityUnit[] = [
  { id: 1, name: "Tin", namePlural: "Tins" },
  { id: 2, name: "Jar", namePlural: "Jars" },
];

const product = (
  id: number,
  name: string,
  locationId: number,
  quIdStock: number,
): GrocyProduct => ({
  id,
  name,
  locationId,
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
  it("groups items under their product's location and includes empty locations", () => {
    const view = buildPantryView(
      locations,
      [
        stockItem(product(10, "Chopped tomatoes", 2, 1), 3, "2027-01-01"),
        stockItem(product(11, "Coconut milk", 2, 1), 2),
      ],
      units,
    );

    const byName = Object.fromEntries(
      view.map((entry) => [entry.location.name, entry.items]),
    );
    expect(byName["Tin drawer"].map((item) => item.name)).toEqual([
      "Chopped tomatoes",
      "Coconut milk",
    ]);
    expect(byName["Fridge"]).toEqual([]);
    expect(byName["Herb drawer"]).toEqual([]);
  });

  it("does not assign fill levels to count-based units", () => {
    const view = buildPantryView(
      locations,
      [stockItem(product(10, "Chopped tomatoes", 2, 1), 3)],
      units,
    );

    const item = view.find((entry) => entry.location.id === 2)?.items[0];
    expect(item?.fillLevel).toBeNull();
    expect(item?.amount).toEqual(3);
    expect(item?.unitName).toEqual("Tin");
  });

  it("derives fill buckets for container units from the fractional amount", () => {
    const view = buildPantryView(
      locations,
      [
        stockItem(product(20, "Oregano", 3, 2), 0.5),
        stockItem(product(21, "Basil", 3, 2), 0.1),
        stockItem(product(22, "Thyme", 3, 2), 1),
      ],
      units,
    );

    const herbs = view.find((entry) => entry.location.id === 3)?.items;
    expect(herbs?.find((i) => i.name === "Oregano")?.fillLevel).toEqual("half");
    expect(herbs?.find((i) => i.name === "Basil")?.fillLevel).toEqual("low");
    expect(herbs?.find((i) => i.name === "Thyme")?.fillLevel).toEqual("full");
  });

  it("uses the open container's fraction when unopened spares exist", () => {
    // 1 spare full jar + one open jar at a quarter
    const view = buildPantryView(
      locations,
      [stockItem(product(20, "Oregano", 3, 2), 1.25)],
      units,
    );

    const item = view.find((entry) => entry.location.id === 3)?.items[0];
    expect(item?.fillLevel).toEqual("quarter");
    expect(item?.amount).toEqual(1.25);
  });

  it("snaps near-bucket amounts to the nearest bucket", () => {
    const view = buildPantryView(
      locations,
      [stockItem(product(20, "Oregano", 3, 2), 0.8)],
      units,
    );

    const item = view.find((entry) => entry.location.id === 3)?.items[0];
    expect(item?.fillLevel).toEqual("threeQuarters");
  });
});
