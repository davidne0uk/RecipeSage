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

describe("photoToProduct", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  it("passes the image to the vision model and returns the identification", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        identified: true,
        name: "Chopped tomatoes",
        brand: "Napolina",
        containerType: "tin",
        confidence: "high",
      },
      totalUsage: { totalTokens: 100 },
    });

    const { photoToProduct } = await import("./photoToProduct");

    const image = Buffer.from("fake-image");
    const result = await photoToProduct(image);

    expect(result).toEqual({
      identified: true,
      name: "Chopped tomatoes",
      brand: "Napolina",
      containerType: "tin",
      confidence: "high",
    });

    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContainEqual({
      type: "image",
      image,
    });
    expect(callArgs.temperature).toEqual(0);
  });

  it("returns unidentified results as-is for the caller to handle", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        identified: false,
        name: "",
        brand: "",
        containerType: "other",
        confidence: "low",
      },
      totalUsage: { totalTokens: 50 },
    });

    const { photoToProduct } = await import("./photoToProduct");

    const result = await photoToProduct(Buffer.from("fake-image"));

    expect(result.identified).toEqual(false);
    expect(result.confidence).toEqual("low");
  });
});
