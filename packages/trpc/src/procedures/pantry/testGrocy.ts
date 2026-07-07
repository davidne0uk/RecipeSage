import { vi } from "vitest";

/**
 * Test helper: stubs global fetch with a tiny router for Grocy (and Open Food
 * Facts) HTTP calls made by pantry procedures. Register handlers by
 * "METHOD /api/path"; unmatched requests return 501 so tests fail loudly.
 *
 * Pantry procedure specs must set GROCY_URL / GROCY_API_KEY before the config
 * module loads, e.g.:
 *
 *   vi.hoisted(() => {
 *     process.env.GROCY_URL = "http://grocy.test/";
 *     process.env.GROCY_API_KEY = "test-key";
 *   });
 */

export interface GrocyFetchCall {
  method: string;
  path: string;
  body?: unknown;
}

type MockResponse = { status?: number; body?: unknown };
type RouteHandler = (call: GrocyFetchCall) => MockResponse;

export const createGrocyFetchMock = () => {
  const routes = new Map<string, RouteHandler>();
  const calls: GrocyFetchCall[] = [];

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "");
    const call: GrocyFetchCall = {
      method,
      path,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);

    const handler = routes.get(`${method} ${path}`);
    if (!handler) {
      return new Response(
        JSON.stringify({ error_message: `no mock for ${method} ${path}` }),
        { status: 501 },
      );
    }

    const result = handler(call);
    return new Response(JSON.stringify(result.body ?? {}), {
      status: result.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  });

  return {
    fetchMock,
    calls,
    install() {
      vi.stubGlobal("fetch", fetchMock);
    },
    uninstall() {
      vi.unstubAllGlobals();
    },
    on(method: string, path: string, body: unknown, status = 200) {
      routes.set(`${method.toUpperCase()} ${path}`, () => ({ status, body }));
      return this;
    },
    callsTo(method: string, path: string) {
      return calls.filter(
        (call) => call.method === method.toUpperCase() && call.path === path,
      );
    },
  };
};

export const grocyLocation = (id: number, name: string) => ({ id, name });

export const grocyProduct = (
  id: number,
  name: string,
  locationId: number,
  quIdStock = 1,
) => ({
  id,
  name,
  location_id: locationId,
  qu_id_stock: quIdStock,
  qu_id_purchase: quIdStock,
});

export const grocyStockItem = (
  product: ReturnType<typeof grocyProduct>,
  amount: number,
  bestBeforeDate: string | null = null,
) => ({
  product_id: product.id,
  amount,
  best_before_date: bestBeforeDate,
  product,
});
