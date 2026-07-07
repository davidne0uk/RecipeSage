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

describe("photoToFillLevel", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
  });

  it("returns the bucket estimate with confidence", async () => {
    generateTextMock.mockResolvedValue({
      output: {
        fillLevel: "half",
        confidence: "high",
      },
      totalUsage: { totalTokens: 60 },
    });

    const { photoToFillLevel } = await import("./photoToFillLevel");

    const image = Buffer.from("fake-jar-photo");
    const result = await photoToFillLevel(image);

    expect(result).toEqual({ fillLevel: "half", confidence: "high" });

    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContainEqual({
      type: "image",
      image,
    });
  });

  it("propagates model errors to the caller", async () => {
    generateTextMock.mockRejectedValue(new Error("provider unavailable"));

    const { photoToFillLevel } = await import("./photoToFillLevel");

    await expect(photoToFillLevel(Buffer.from("x"))).rejects.toThrow(
      "provider unavailable",
    );
  });
});
