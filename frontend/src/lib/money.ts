const CURRENCY_PREFIX = "S$";
export const MAX_AMOUNT_CENTS = 100_000_000;

/** Formats integer cents as "S$1,284.60". Never uses floating-point math. */
export function centsToDisplay(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const sign = safeCents < 0 ? "-" : "";
  const abs = Math.abs(safeCents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const dollarsFormatted = dollars.toLocaleString("en-SG");
  return `${sign}${CURRENCY_PREFIX}${dollarsFormatted}.${String(remainder).padStart(2, "0")}`;
}

/**
 * Parses a user-entered amount string (e.g. "12.5") into integer cents.
 * Returns null when the input isn't a positive number with at most 2 decimal
 * places, or when it exceeds MAX_AMOUNT_CENTS. Uses only integer arithmetic.
 */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;

  const [wholePart, fractionPart = ""] = trimmed.split(".");
  const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents)) return null;
  if (cents <= 0 || cents > MAX_AMOUNT_CENTS) return null;
  return cents;
}

/** Converts integer cents into a plain "12.50" string for form inputs. */
export function centsToInputValue(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${String(remainder).padStart(2, "0")}`;
}
