import type { BudgetStatus } from "./types";

export interface StatusStyle {
  chipBg: string;
  chipFg: string;
  barBg: string;
}

/** Colours match docs/design/Insights.dc.html: status is always shown as text, colour is a hint only. */
export const STATUS_STYLES: Record<BudgetStatus, StatusStyle> = {
  Over: { chipBg: "bg-orange-100", chipFg: "text-orange-800", barBg: "bg-orange-600" },
  "At risk": { chipBg: "bg-amber-100", chipFg: "text-amber-900", barBg: "bg-amber-600" },
  "On track": { chipBg: "bg-blue-100", chipFg: "text-blue-800", barBg: "bg-blue-600" },
};
