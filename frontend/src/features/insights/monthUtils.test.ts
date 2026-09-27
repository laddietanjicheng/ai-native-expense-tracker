import { describe, expect, it } from "vitest";
import {
  currentMonthKey,
  isCurrentMonthKey,
  monthKeyLabel,
  parseMonthKey,
  shiftMonthKey,
  shortMonthKeyLabel,
} from "./monthUtils";

describe("monthUtils", () => {
  it("parses a YYYY-MM key into numeric parts", () => {
    expect(parseMonthKey("2026-09")).toEqual({ year: 2026, month: 9 });
  });

  it("shifts a month key forward and backward, wrapping the year", () => {
    expect(shiftMonthKey("2026-09", -1)).toBe("2026-08");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
  });

  it("formats a long and short month label", () => {
    expect(monthKeyLabel("2026-09")).toBe("September 2026");
    expect(shortMonthKeyLabel("2026-09")).toBe("Sep");
  });

  it("derives the current month key from Asia/Singapore local time", () => {
    const now = new Date("2026-09-26T20:00:00Z"); // 04:00 SGT next day
    expect(currentMonthKey(now)).toBe("2026-09");
  });

  it("detects whether a month key is the current month", () => {
    const now = new Date("2026-09-26T04:00:00Z");
    expect(isCurrentMonthKey("2026-09", now)).toBe(true);
    expect(isCurrentMonthKey("2026-08", now)).toBe(false);
  });
});
