export const TIME_ZONE = "Asia/Singapore";

export type DatePresetOption =
  | "last_7_days"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "all_time"
  | "custom";

/** date_from/date_to are both null for "all time" (no date bounds sent to the API). */
export interface DateRange {
  date_from: string | null;
  date_to: string | null;
}

/** A date range known to have concrete bounds (never "all time"). */
export interface ConcreteDateRange {
  date_from: string;
  date_to: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const LONG_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Monday-first weekday header labels for the calendar grid. */
export const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function getSingaporeParts(date: Date): DateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(lookup.year), month: Number(lookup.month), day: Number(lookup.day) };
}

export function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Shifts a (year, month) pair by `delta` months, wrapping the year. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return { year: newYear, month: newMonth };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Returns today's date as "YYYY-MM-DD" in the Asia/Singapore timezone. */
export function todayISOInSingapore(now: Date = new Date()): string {
  const { year, month, day } = getSingaporeParts(now);
  return isoFromParts(year, month, day);
}

/** Resolves a named date preset to a { date_from, date_to } range ("all_time" is unbounded). */
export function resolveDatePreset(preset: Exclude<DatePresetOption, "custom">, now: Date = new Date()): DateRange {
  const { year, month, day } = getSingaporeParts(now);
  switch (preset) {
    case "last_7_days": {
      const todayUtc = Date.UTC(year, month - 1, day);
      const start = new Date(todayUtc - 6 * 86_400_000);
      return {
        date_from: isoFromParts(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
        date_to: isoFromParts(year, month, day),
      };
    }
    case "this_month":
      return {
        date_from: isoFromParts(year, month, 1),
        date_to: isoFromParts(year, month, daysInMonth(year, month)),
      };
    case "last_month": {
      const prev = shiftMonth(year, month, -1);
      return {
        date_from: isoFromParts(prev.year, prev.month, 1),
        date_to: isoFromParts(prev.year, prev.month, daysInMonth(prev.year, prev.month)),
      };
    }
    case "last_3_months": {
      const start = shiftMonth(year, month, -2);
      return {
        date_from: isoFromParts(start.year, start.month, 1),
        date_to: isoFromParts(year, month, daysInMonth(year, month)),
      };
    }
    case "this_year":
      return { date_from: `${year}-01-01`, date_to: `${year}-12-31` };
    case "all_time":
      return { date_from: null, date_to: null };
  }
}

/** Number of calendar days spanned by an inclusive date range (minimum 1). */
export function daySpan(range: ConcreteDateRange): number {
  const [fy, fm, fd] = range.date_from.split("-").map(Number);
  const [ty, tm, td] = range.date_to.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

/** Formats "2026-09-26" as "Saturday, 26 Sep" for day-group headers. */
export function formatDayGroupLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return `${DAY_NAMES[utc.getUTCDay()]}, ${d} ${MONTH_NAMES[m - 1]}`;
}

/** Formats "2026-09-26" as "Saturday, 26 September 2026" (calendar day aria-labels). */
export function formatFullWeekdayDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return `${DAY_NAMES[utc.getUTCDay()]}, ${d} ${LONG_MONTH_NAMES[m - 1]} ${y}`;
}

/** Formats "2026-09-26" as "26 Sep 2026". */
export function formatFullDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** Formats a date range as "1 – 30 Sep 2026" or "28 Aug – 3 Sep 2026". */
export function formatDateRangeLabel(range: ConcreteDateRange): string {
  const [fy, fm, fd] = range.date_from.split("-").map(Number);
  const [ty, tm, td] = range.date_to.split("-").map(Number);
  if (fy === ty && fm === tm) {
    return `${fd} – ${td} ${MONTH_NAMES[tm - 1]} ${ty}`;
  }
  if (fy === ty) {
    return `${fd} ${MONTH_NAMES[fm - 1]} – ${td} ${MONTH_NAMES[tm - 1]} ${ty}`;
  }
  return `${fd} ${MONTH_NAMES[fm - 1]} ${fy} – ${td} ${MONTH_NAMES[tm - 1]} ${ty}`;
}

/** Short subtitle for a filter button, e.g. "Sep" or "Jul – Sep" (no day, no year). */
export function formatShortMonthRange(range: ConcreteDateRange): string {
  const [, fm] = range.date_from.split("-").map(Number);
  const [, tm] = range.date_to.split("-").map(Number);
  return fm === tm ? MONTH_NAMES[fm - 1] : `${MONTH_NAMES[fm - 1]} – ${MONTH_NAMES[tm - 1]}`;
}

/** Short subtitle for a custom range, e.g. "8 – 21 Sep" (no year). */
export function formatShortDayRange(range: ConcreteDateRange): string {
  const [, fm, fd] = range.date_from.split("-").map(Number);
  const [, tm, td] = range.date_to.split("-").map(Number);
  if (fm === tm) return `${fd} – ${td} ${MONTH_NAMES[tm - 1]}`;
  return `${fd} ${MONTH_NAMES[fm - 1]} – ${td} ${MONTH_NAMES[tm - 1]}`;
}

/** "September 2026" for the calendar header. */
export function formatMonthLabel(year: number, month: number): string {
  return `${LONG_MONTH_NAMES[month - 1]} ${year}`;
}

/** "Sep" — short month name, used in insights captions and table headers. */
export function formatShortMonthName(month: number): string {
  return MONTH_NAMES[month - 1];
}

/**
 * Parses a "DD/MM/YYYY" string into an ISO date, rejecting impossible
 * calendar dates (e.g. 31/02/2026) instead of silently normalizing them.
 */
export function parseTypedDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return isoFromParts(year, month, day);
}

/** Formats an ISO date as "DD/MM/YYYY" for the typed date inputs. */
export function formatTypedDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export interface CalendarCell {
  iso: string;
  day: number;
}

/**
 * Builds a Monday-first month grid: `null` for the leading/trailing blanks
 * needed to keep full weeks, a cell for each day in the month otherwise.
 */
export function getMonthMatrix(year: number, month: number): (CalendarCell | null)[] {
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const totalDays = daysInMonth(year, month);
  const cells: (CalendarCell | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= totalDays; day++) cells.push({ iso: isoFromParts(year, month, day), day });
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
