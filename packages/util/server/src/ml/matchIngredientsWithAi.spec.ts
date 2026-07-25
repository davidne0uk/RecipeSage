import { describe, it, expect, vi, beforeEach } from "vitest";

const generateTextMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: (...args: unknown[]) => generateTextMock(...args),
  };
});

vi.mock("./vercel", () => ({
  aiProvider: () => "mock-model",
}));

describe("matchIngredientsToProductsWithAi", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  it("maps batched matches back onto the input ingredient lines", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        matches: [
          {
            ingredient: "2 spring onions, sliced",
            productId: 5,
            confidence: "high",
          },
          { ingredient: "1 capsicum", productId: 7, confidence: "medium" },
        ],
      },
      totalUsage: { totalTokens: 120 },
    });

    const { matchIngredientsToProductsWithAi } =
      await import("./matchIngredientsWithAi");

    const result = await matchIngredientsToProductsWithAi(
      ["2 spring onions, sliced", "1 capsicum"],
      [
        { productId: 5, name: "Scallions" },
        { productId: 7, name: "Bell pepper" },
      ],
    );

    expect(result).toEqual([
      {
        ingredient: "2 spring onions, sliced",
        productId: 5,
        confidence: "high",
      },
      { ingredient: "1 capsicum", productId: 7, confidence: "medium" },
    ]);
  });

  it("returns a null match when no reasonable product exists", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        matches: [
          { ingredient: "1 dragon fruit", productId: null, confidence: "low" },
        ],
      },
      totalUsage: { totalTokens: 80 },
    });

    const { matchIngredientsToProductsWithAi } =
      await import("./matchIngredientsWithAi");

    const result = await matchIngredientsToProductsWithAi(
      ["1 dragon fruit"],
      [{ productId: 5, name: "Scallions" }],
    );

    expect(result).toEqual([
      { ingredient: "1 dragon fruit", productId: null, confidence: null },
    ]);
  });

  it("discards a product id the model invents that isn't in the candidate list", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        matches: [
          { ingredient: "1 onion", productId: 999, confidence: "high" },
        ],
      },
      totalUsage: { totalTokens: 60 },
    });

    const { matchIngredientsToProductsWithAi } =
      await import("./matchIngredientsWithAi");

    const result = await matchIngredientsToProductsWithAi(
      ["1 onion"],
      [{ productId: 5, name: "Scallions" }],
    );

    expect(result).toEqual([
      { ingredient: "1 onion", productId: null, confidence: null },
    ]);
  });

  it("skips the LLM call entirely when there are no ingredients or no products", async () => {
    const { matchIngredientsToProductsWithAi } =
      await import("./matchIngredientsWithAi");

    expect(
      await matchIngredientsToProductsWithAi(
        [],
        [{ productId: 5, name: "Scallions" }],
      ),
    ).toEqual([]);
    expect(await matchIngredientsToProductsWithAi(["1 onion"], [])).toEqual([
      { ingredient: "1 onion", productId: null, confidence: null },
    ]);
    expect(generateTextMock).not.toHaveBeenCalled();
  });
});
