import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsWideViewport, WIDE_VIEWPORT_QUERY } from "./useIsWideViewport";

function mockMatchMedia(initialMatches: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const mql = {
    matches: initialMatches,
    media: WIDE_VIEWPORT_QUERY,
    addEventListener: vi.fn((_event: string, cb: (event: MediaQueryListEvent) => void) => {
      listener = cb;
    }),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql);
  return {
    fire: (matches: boolean) => {
      mql.matches = matches;
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}

describe("useIsWideViewport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reflects a narrow viewport from matchMedia", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsWideViewport());
    expect(result.current).toBe(false);
  });

  it("reflects a wide viewport from matchMedia", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsWideViewport());
    expect(result.current).toBe(true);
  });

  it("updates when the media query change event fires", () => {
    const { fire } = mockMatchMedia(true);
    const { result } = renderHook(() => useIsWideViewport());
    expect(result.current).toBe(true);

    act(() => fire(false));
    expect(result.current).toBe(false);
  });

  it("defaults to wide when matchMedia is unavailable", () => {
    const original = window.matchMedia;
    // @ts-expect-error simulating an environment without matchMedia
    delete window.matchMedia;
    const { result } = renderHook(() => useIsWideViewport());
    expect(result.current).toBe(true);
    window.matchMedia = original;
  });
});
