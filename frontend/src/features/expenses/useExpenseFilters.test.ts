import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useExpenseFilters } from "./useExpenseFilters";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/",
  useSearchParams: () => mockSearchParams,
}));

let mockSearchParams = new URLSearchParams();

describe("useExpenseFilters", () => {
  beforeEach(() => {
    push.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  it("defaults to this_month with no filters when the URL is empty", () => {
    const { result } = renderHook(() => useExpenseFilters());
    expect(result.current.filters.preset).toBe("this_month");
    expect(result.current.filters.categoryIds).toEqual([]);
    expect(result.current.filters.page).toBe(1);
  });

  it("reads a repeated category_id param into an array", () => {
    mockSearchParams = new URLSearchParams("category_id=a&category_id=b&preset=this_month");
    const { result } = renderHook(() => useExpenseFilters());
    expect(result.current.filters.categoryIds).toEqual(["a", "b"]);
  });

  it("only exposes sub_category_id when exactly one category is selected", () => {
    mockSearchParams = new URLSearchParams(
      "category_id=a&category_id=b&sub_category_id=sub-1&preset=this_month"
    );
    const { result } = renderHook(() => useExpenseFilters());
    expect(result.current.filters.subCategoryId).toBeNull();
  });

  it("falls back to defaults for invalid sort/order/page values", () => {
    mockSearchParams = new URLSearchParams("sort=bogus&order=bogus&page=-3");
    const { result } = renderHook(() => useExpenseFilters());
    expect(result.current.filters.sort).toBe("date");
    expect(result.current.filters.order).toBe("desc");
    expect(result.current.filters.page).toBe(1);
  });

  it("resolves a custom range from date_from/date_to when preset is custom", () => {
    mockSearchParams = new URLSearchParams("preset=custom&date_from=2026-01-01&date_to=2026-01-15");
    const { result } = renderHook(() => useExpenseFilters());
    expect(result.current.dateRange).toEqual({ date_from: "2026-01-01", date_to: "2026-01-15" });
  });

  it("falls back to the this_month preset when the custom range is inverted", () => {
    mockSearchParams = new URLSearchParams("preset=custom&date_from=2026-01-15&date_to=2026-01-01");
    const { result } = renderHook(() => useExpenseFilters());
    expect(result.current.dateRange).not.toEqual({ date_from: "2026-01-15", date_to: "2026-01-01" });
  });

  it("falls back to the this_month preset when only one custom date is set", () => {
    mockSearchParams = new URLSearchParams("preset=custom&date_from=2026-01-01");
    const { result } = renderHook(() => useExpenseFilters());
    expect(result.current.dateRange.date_from).not.toBe("2026-01-01");
  });

  it("accepts last_7_days and all_time as valid presets", () => {
    mockSearchParams = new URLSearchParams("preset=last_7_days");
    expect(renderHook(() => useExpenseFilters()).result.current.filters.preset).toBe("last_7_days");

    mockSearchParams = new URLSearchParams("preset=all_time");
    expect(renderHook(() => useExpenseFilters()).result.current.filters.preset).toBe("all_time");
  });

  it("resolves all_time to an unbounded (null) date range", () => {
    mockSearchParams = new URLSearchParams("preset=all_time");
    const { result } = renderHook(() => useExpenseFilters());
    expect(result.current.dateRange).toEqual({ date_from: null, date_to: null });
  });

  it("resets the page to 1 by default when update() is called", () => {
    mockSearchParams = new URLSearchParams("page=3");
    const { result } = renderHook(() => useExpenseFilters());

    result.current.update({ categoryIds: ["a"] });

    expect(push).toHaveBeenCalledWith(expect.stringContaining("page=1"), { scroll: false });
  });

  it("keeps the given page when resetPage is false", () => {
    const { result } = renderHook(() => useExpenseFilters());

    result.current.update({ page: 2 }, { resetPage: false });

    expect(push).toHaveBeenCalledWith(expect.stringContaining("page=2"), { scroll: false });
  });

  it("clearFilters resets date and categories but keeps the sort", () => {
    mockSearchParams = new URLSearchParams(
      "preset=last_month&category_id=a&sub_category_id=s&sort=amount&order=asc&page=3"
    );
    const { result } = renderHook(() => useExpenseFilters());
    result.current.clearFilters();

    const url = new URLSearchParams(push.mock.calls[0][0].split("?")[1]);
    expect(url.get("preset")).toBe("this_month");
    expect(url.getAll("category_id")).toEqual([]);
    expect(url.get("sub_category_id")).toBeNull();
    expect(url.get("page")).toBe("1");
    expect([url.get("sort"), url.get("order")]).toEqual(["amount", "asc"]);
  });
});
