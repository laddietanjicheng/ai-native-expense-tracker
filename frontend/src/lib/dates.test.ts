import { describe, expect, it } from "vitest";
import {
  daySpan,
  formatDateRangeLabel,
  formatDayGroupLabel,
  formatFullDate,
  formatFullWeekdayDate,
  formatMonthLabel,
  formatShortDayRange,
  formatShortMonthRange,
  formatTypedDate,
  getMonthMatrix,
  parseTypedDate,
  resolveDatePreset,
  shiftMonth,
  todayISOInSingapore,
} from "./dates";

describe("todayISOInSingapore", () => {
  it("returns an ISO date string", () => {
    const result = todayISOInSingapore(new Date("2026-09-26T20:00:00Z"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rolls over to the next Singapore day for a late-UTC timestamp", () => {
    // 2026-09-26T20:00:00Z is 2026-09-27T04:00 in Asia/Singapore (UTC+8)
    expect(todayISOInSingapore(new Date("2026-09-26T20:00:00Z"))).toBe("2026-09-27");
  });
});

describe("resolveDatePreset", () => {
  const now = new Date("2026-09-26T04:00:00Z"); // 2026-09-26 12:00 SGT

  it("resolves this_month to the full current month", () => {
    expect(resolveDatePreset("this_month", now)).toEqual({
      date_from: "2026-09-01",
      date_to: "2026-09-30",
    });
  });

  it("resolves last_month", () => {
    expect(resolveDatePreset("last_month", now)).toEqual({
      date_from: "2026-08-01",
      date_to: "2026-08-31",
    });
  });

  it("resolves last_month across a year boundary", () => {
    const january = new Date("2026-01-15T04:00:00Z");
    expect(resolveDatePreset("last_month", january)).toEqual({
      date_from: "2025-12-01",
      date_to: "2025-12-31",
    });
  });

  it("resolves last_3_months as a rolling window ending this month", () => {
    expect(resolveDatePreset("last_3_months", now)).toEqual({
      date_from: "2026-07-01",
      date_to: "2026-09-30",
    });
  });

  it("resolves this_year", () => {
    expect(resolveDatePreset("this_year", now)).toEqual({
      date_from: "2026-01-01",
      date_to: "2026-12-31",
    });
  });

  it("resolves last_7_days as an inclusive 7-day window ending today", () => {
    expect(resolveDatePreset("last_7_days", now)).toEqual({
      date_from: "2026-09-20",
      date_to: "2026-09-26",
    });
  });

  it("resolves last_7_days across a month boundary", () => {
    const earlyMonth = new Date("2026-09-02T04:00:00Z");
    expect(resolveDatePreset("last_7_days", earlyMonth)).toEqual({
      date_from: "2026-08-27",
      date_to: "2026-09-02",
    });
  });

  it("resolves all_time to an unbounded range", () => {
    expect(resolveDatePreset("all_time", now)).toEqual({ date_from: null, date_to: null });
  });
});

describe("daySpan", () => {
  it("counts a single day as 1", () => {
    expect(daySpan({ date_from: "2026-09-26", date_to: "2026-09-26" })).toBe(1);
  });

  it("counts an inclusive range", () => {
    expect(daySpan({ date_from: "2026-09-01", date_to: "2026-09-30" })).toBe(30);
  });
});

describe("formatDayGroupLabel", () => {
  it("formats a date as weekday, day and short month", () => {
    expect(formatDayGroupLabel("2026-09-26")).toBe("Saturday, 26 Sep");
  });
});

describe("formatFullDate", () => {
  it("formats a date as day, short month, year", () => {
    expect(formatFullDate("2026-09-26")).toBe("26 Sep 2026");
  });
});

describe("formatDateRangeLabel", () => {
  it("collapses the month when both dates share it", () => {
    expect(formatDateRangeLabel({ date_from: "2026-09-01", date_to: "2026-09-30" })).toBe(
      "1 – 30 Sep 2026"
    );
  });

  it("shows both months when they differ within the same year", () => {
    expect(formatDateRangeLabel({ date_from: "2026-08-28", date_to: "2026-09-03" })).toBe(
      "28 Aug – 3 Sep 2026"
    );
  });

  it("shows both years when they differ", () => {
    expect(formatDateRangeLabel({ date_from: "2025-12-15", date_to: "2026-01-05" })).toBe(
      "15 Dec 2025 – 5 Jan 2026"
    );
  });
});

describe("formatFullWeekdayDate", () => {
  it("formats a date with the full weekday and month names", () => {
    expect(formatFullWeekdayDate("2026-09-26")).toBe("Saturday, 26 September 2026");
  });
});

describe("formatShortMonthRange", () => {
  it("returns a single short month when both dates share it", () => {
    expect(formatShortMonthRange({ date_from: "2026-09-01", date_to: "2026-09-30" })).toBe("Sep");
  });

  it("returns a short month range otherwise", () => {
    expect(formatShortMonthRange({ date_from: "2026-07-01", date_to: "2026-09-30" })).toBe("Jul – Sep");
  });
});

describe("formatShortDayRange", () => {
  it("omits the year and repeats the month once when both dates share it", () => {
    expect(formatShortDayRange({ date_from: "2026-09-08", date_to: "2026-09-21" })).toBe("8 – 21 Sep");
  });

  it("shows both months when they differ", () => {
    expect(formatShortDayRange({ date_from: "2026-08-28", date_to: "2026-09-03" })).toBe("28 Aug – 3 Sep");
  });
});

describe("formatMonthLabel", () => {
  it("formats a year and month as a long month name and year", () => {
    expect(formatMonthLabel(2026, 9)).toBe("September 2026");
  });
});

describe("parseTypedDate", () => {
  it("parses a valid DD/MM/YYYY date", () => {
    expect(parseTypedDate("08/09/2026")).toBe("2026-09-08");
  });

  it("rejects an impossible calendar date instead of normalizing it", () => {
    expect(parseTypedDate("31/02/2026")).toBeNull();
  });

  it("accepts 29 February on a leap year", () => {
    expect(parseTypedDate("29/02/2028")).toBe("2028-02-29");
  });

  it("rejects 29 February on a non-leap year", () => {
    expect(parseTypedDate("29/02/2026")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseTypedDate("2026-09-08")).toBeNull();
    expect(parseTypedDate("8/9/2026")).toBeNull();
    expect(parseTypedDate("")).toBeNull();
  });
});

describe("formatTypedDate", () => {
  it("formats an ISO date as DD/MM/YYYY", () => {
    expect(formatTypedDate("2026-09-08")).toBe("08/09/2026");
  });

  it("round-trips through parseTypedDate", () => {
    expect(parseTypedDate(formatTypedDate("2026-01-05"))).toBe("2026-01-05");
  });
});

describe("shiftMonth", () => {
  it("moves forward within the same year", () => {
    expect(shiftMonth(2026, 9, 1)).toEqual({ year: 2026, month: 10 });
  });

  it("wraps to the next year", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });

  it("wraps to the previous year", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("getMonthMatrix", () => {
  it("pads the grid to full weeks and starts the week on Monday", () => {
    // September 2026 starts on a Tuesday, so there's one leading blank.
    const matrix = getMonthMatrix(2026, 9);
    expect(matrix.length % 7).toBe(0);
    expect(matrix[0]).toBeNull();
    expect(matrix[1]).toEqual({ iso: "2026-09-01", day: 1 });
    expect(matrix[matrix.length - 1]).not.toBeUndefined();
  });

  it("includes every day of the month exactly once", () => {
    const matrix = getMonthMatrix(2026, 2); // February 2026, 28 days
    const days = matrix.filter((cell) => cell !== null).map((cell) => cell?.day);
    expect(days).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
  });
});
