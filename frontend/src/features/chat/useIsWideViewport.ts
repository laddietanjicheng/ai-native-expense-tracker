import { useSyncExternalStore } from "react";

/** Matches Tailwind's `xl` breakpoint — the layout switches from an overlay drawer to reserved space here. */
export const WIDE_VIEWPORT_QUERY = "(min-width: 1280px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mediaQueryList = window.matchMedia(WIDE_VIEWPORT_QUERY);
  mediaQueryList.addEventListener("change", onChange);
  return () => mediaQueryList.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(WIDE_VIEWPORT_QUERY).matches;
}

/** Same "docked-until-hydrated" reasoning as the chat mode store: assume wide on the server. */
function getServerSnapshot(): boolean {
  return true;
}

/** True at or above 1280px wide, where the chat panel reserves layout space instead of overlaying. */
export function useIsWideViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
