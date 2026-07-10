import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GrocyClient } from "../grocy";
import { resolvePantryLocationId } from "./resolvePantryLocationId";

const fetchMock = vi.fn();

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("resolvePantryLocationId", () => {
  let grocy: GrocyClient;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    grocy = new GrocyClient("http://grocy:80/", "test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses an existing Pantry location without creating one", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 1, name: "Fridge" },
        { id: 2, name: "Pantry" },
      ]),
    );

    expect(await resolvePantryLocationId(grocy)).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("matches the location name case-insensitively and ignores surrounding whitespace", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ id: 7, name: " pantry " }]),
    );

    expect(await resolvePantryLocationId(grocy)).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates the Pantry location when none exists", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([{ id: 1, name: "Fridge" }]))
      .mockResolvedValueOnce(jsonResponse({ created_object_id: 5 }));

    expect(await resolvePantryLocationId(grocy)).toBe(5);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://grocy:80/api/objects/locations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Pantry" }),
      }),
    );
  });

  it("creates the Pantry location on a Grocy instance with no locations at all", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ created_object_id: 1 }));

    expect(await resolvePantryLocationId(grocy)).toBe(1);
  });

  it("resolves duplicate Pantry locations to the lowest id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: 9, name: "Pantry" },
        { id: 3, name: "pantry" },
        { id: 6, name: "Pantry" },
      ]),
    );

    expect(await resolvePantryLocationId(grocy)).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
