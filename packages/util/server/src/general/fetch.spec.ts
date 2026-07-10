import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchURL } from "./fetch";

describe("fetchURL", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "selfhost");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses non-http protocols", async () => {
    await expect(fetchURL("file:///etc/passwd")).rejects.toThrow(
      /unsupported protocol/i,
    );
  });

  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/admin",
    "http://192.168.1.1/",
    "http://[::1]/",
  ])("refuses to fetch the private address %s", async (url) => {
    await expect(fetchURL(url)).rejects.toThrow(/private address/i);
  });

  it("refuses a hostname that resolves to loopback", async () => {
    await expect(fetchURL("http://localhost:9283/")).rejects.toThrow(
      /private address/i,
    );
  });
});
