import { formatMonthLabel, formatShortMonthName, shiftMonth, todayISOInSingapore } from "@/lib/dates";

export interface MonthParts {
  year: number;
  month: number;
}

/** Parses a "YYYY-MM" key into numeric year/month parts. */
export function parseMonthKey(key: string): MonthParts {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

export function monthKeyFromParts(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Shifts a "YYYY-MM" key by `delta` months. */
export function shiftMonthKey(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const next = shiftMonth(year, month, delta);
  return monthKeyFromParts(next.year, next.month);
}

/** The current month as "YYYY-MM" in the Asia/Singapore timezone. */
export function currentMonthKey(now: Date = new Date()): string {
  return todayISOInSingapore(now).slice(0, 7);
}

export function isCurrentMonthKey(key: string, now: Date = new Date()): boolean {
  return key === currentMonthKey(now);
}

/** "September 2026" for a "YYYY-MM" key. */
export function monthKeyLabel(key: string): string {
  const { year, month } = parseMonthKey(key);
  return formatMonthLabel(year, month);
}

/** "Sep" for a "YYYY-MM" key. */
export function shortMonthKeyLabel(key: string): string {
  const { month } = parseMonthKey(key);
  return formatShortMonthName(month);
}
