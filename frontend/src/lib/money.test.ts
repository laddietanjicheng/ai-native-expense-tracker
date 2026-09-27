import { describe, expect, it } from "vitest";
import { centsToDisplay, centsToInputValue, parseAmountToCents, MAX_AMOUNT_CENTS } from "./money";

describe("centsToDisplay", () => {
  it("formats whole dollars with two decimal places", () => {
    expect(centsToDisplay(128460)).toBe("S$1,284.60");
  });

  it("pads single-digit cents", () => {
    expect(centsToDisplay(650)).toBe("S$6.50");
  });

  it("formats zero", () => {
    expect(centsToDisplay(0)).toBe("S$0.00");
  });

  it("adds thousands separators", () => {
    expect(centsToDisplay(100000000)).toBe("S$1,000,000.00");
  });

  it("formats negative cents with a leading minus sign", () => {
    expect(centsToDisplay(-650)).toBe("-S$6.50");
  });
});

describe("parseAmountToCents", () => {
  it("parses a whole number", () => {
    expect(parseAmountToCents("10")).toBe(1000);
  });

  it("parses one decimal place", () => {
    expect(parseAmountToCents("10.5")).toBe(1050);
  });

  it("parses two decimal places", () => {
    expect(parseAmountToCents("12.34")).toBe(1234);
  });

  it("trims surrounding whitespace", () => {
    expect(parseAmountToCents("  12.34  ")).toBe(1234);
  });

  it("rejects more than two decimal places", () => {
    expect(parseAmountToCents("12.345")).toBeNull();
  });

  it("rejects zero", () => {
    expect(parseAmountToCents("0")).toBeNull();
  });

  it("rejects negative numbers", () => {
    expect(parseAmountToCents("-5")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseAmountToCents("abc")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(parseAmountToCents("")).toBeNull();
  });

  it("accepts the maximum allowed amount", () => {
    expect(parseAmountToCents("1000000.00")).toBe(MAX_AMOUNT_CENTS);
  });

  it("strips thousands separators before validating", () => {
    expect(parseAmountToCents("1,500.00")).toBe(150000);
    expect(parseAmountToCents("1,000,000.00")).toBe(MAX_AMOUNT_CENTS);
  });

  it("rejects amounts above the maximum", () => {
    expect(parseAmountToCents("1000000.01")).toBeNull();
  });
});

describe("centsToInputValue", () => {
  it("converts cents to a plain decimal string", () => {
    expect(centsToInputValue(650)).toBe("6.50");
  });

  it("pads cents below ten", () => {
    expect(centsToInputValue(105)).toBe("1.05");
  });

  it("round-trips through parseAmountToCents", () => {
    expect(parseAmountToCents(centsToInputValue(123456))).toBe(123456);
  });
});
