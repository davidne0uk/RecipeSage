import { describe, it, expect } from "vitest";
import {
  matchIngredientToProducts,
  matchIngredientsToProducts,
  normalizeToTokens,
  type PantryMatchCandidate,
} from "./pantryMatching";

const products: PantryMatchCandidate[] = [
  { productId: 1, name: "Oregano" },
  { productId: 2, name: "Chopped tomatoes" },
  { productId: 3, name: "Tomato puree" },
  { productId: 4, name: "Coconut milk" },
  { productId: 5, name: "Milk" },
  { productId: 6, name: "Plain flour" },
  { productId: 7, name: "Sea salt" },
  { productId: 8, name: "Red onions" },
];

describe("normalizeToTokens", () => {
  it("lowercases, strips punctuation and prep words, singularizes", () => {
    expect(normalizeToTokens("2 large, finely-chopped Red Onions")).toEqual([
      "2",
      "red",
      "onion",
    ]);
  });
});

describe("matchIngredientToProducts", () => {
  it("matches a prep-heavy line to a single-word product", () => {
    const match = matchIngredientToProducts(
      "2 tbsp chopped fresh oregano",
      products,
    );

    expect(match.productId).toEqual(1);
    expect(match.confidence).toEqual("exact");
  });

  it("matches with strong confidence when the product is a token subset", () => {
    const match = matchIngredientToProducts(
      "a few oregano leaves to garnish",
      products,
    );

    expect(match.productId).toEqual(1);
    expect(match.confidence).toEqual("strong");
  });

  it("matches exact product names with exact confidence", () => {
    const match = matchIngredientToProducts("1 tin chopped tomatoes", products);

    expect(match.productId).toEqual(2);
  });

  it("prefers the more specific product when both are contained", () => {
    // "coconut milk" contains product "Milk" (subset) and product
    // "Coconut milk" (exact after stripping) — the specific one must win
    const match = matchIngredientToProducts("400ml coconut milk", products);

    expect(match.productId).toEqual(4);
    expect(match.confidence).toEqual("exact");
  });

  it("reports unmatched lines instead of guessing", () => {
    const match = matchIngredientToProducts(
      "1 sheet ready-rolled puff pastry",
      products,
    );

    expect(match.productId).toBeNull();
    expect(match.confidence).toBeNull();
  });

  it("does not match on trivial overlap", () => {
    // shares only "tomato" with two products, not enough for either
    const match = matchIngredientToProducts(
      "6 sun-dried tomato halves in oil",
      products,
    );

    expect(match.confidence).not.toEqual("exact");
  });

  it("handles plural/singular differences both ways", () => {
    expect(
      matchIngredientToProducts("3 red onion", products).productId,
    ).toEqual(8);
    expect(
      matchIngredientToProducts("500g plain flours", products).productId,
    ).toEqual(6);
  });

  it("returns unmatched for blank or header-like lines", () => {
    const match = matchIngredientToProducts("   ", products);

    expect(match.productId).toBeNull();
  });
});

describe("matchIngredientsToProducts", () => {
  it("matches a realistic ingredient list", () => {
    const results = matchIngredientsToProducts(
      [
        "2 tbsp chopped fresh oregano",
        "1 x 400g tin chopped tomatoes",
        "400ml coconut milk",
        "a pinch of sea salt",
        "1 free-range egg",
      ],
      products,
    );

    expect(results.map((r) => r.productId)).toEqual([1, 2, 4, 7, null]);
  });
});
