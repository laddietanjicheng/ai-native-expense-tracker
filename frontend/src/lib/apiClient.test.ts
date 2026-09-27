import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiError } from "./apiClient";

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })
  );
}

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unwrapped data and meta on success", async () => {
    mockFetchOnce({ success: true, data: { id: "1" }, error: null, meta: { total_count: 1 } });

    const result = await apiRequest<{ id: string }>("/expenses/1");

    expect(result.data).toEqual({ id: "1" });
    expect(result.meta).toEqual({ total_count: 1 });
  });

  it("throws ApiError with the server's code, message and details on failure", async () => {
    mockFetchOnce(
      {
        success: false,
        data: null,
        error: { code: "CATEGORY_IN_USE", message: "In use", details: { active_expense_count: 3 } },
        meta: null,
      },
      { status: 409 }
    );

    await expect(apiRequest("/categories/1", { method: "DELETE" })).rejects.toMatchObject({
      code: "CATEGORY_IN_USE",
      message: "In use",
      status: 409,
      details: { active_expense_count: 3 },
    });
  });

  it("throws an ApiError instance", async () => {
    mockFetchOnce({ success: false, data: null, error: { code: "NOT_FOUND", message: "Missing" }, meta: null }, { status: 404 });

    await expect(apiRequest("/expenses/missing")).rejects.toBeInstanceOf(ApiError);
  });

  it("treats a 204 response as success with no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) })
    );

    const result = await apiRequest("/expenses/1", { method: "DELETE" });

    expect(result.data).toBeNull();
  });

  it("wraps network failures in a NETWORK_ERROR ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    await expect(apiRequest("/expenses")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("falls back to a generic error when the response body isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      })
    );

    await expect(apiRequest("/expenses")).rejects.toMatchObject({ code: "UNKNOWN_ERROR", status: 500 });
  });
});
