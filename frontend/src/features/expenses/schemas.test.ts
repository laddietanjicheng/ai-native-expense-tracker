import { describe, expect, it } from "vitest";
import { expenseFormSchema } from "./schemas";

const validValues = {
  amount: "12.50",
  expense_date: "2026-09-26",
  category_id: "cat-1",
  sub_category_id: "sub-1",
  note: "Lunch",
};

describe("expenseFormSchema", () => {
  it("accepts a fully valid submission", () => {
    expect(expenseFormSchema.safeParse(validValues).success).toBe(true);
  });

  it("accepts an amount with no sub-category or note", () => {
    const result = expenseFormSchema.safeParse({
      amount: "5",
      expense_date: "2026-09-26",
      category_id: "cat-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing amount", () => {
    const result = expenseFormSchema.safeParse({ ...validValues, amount: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an amount with more than two decimal places", () => {
    const result = expenseFormSchema.safeParse({ ...validValues, amount: "12.345" });
    expect(result.success).toBe(false);
  });

  it("rejects zero as an amount", () => {
    const result = expenseFormSchema.safeParse({ ...validValues, amount: "0" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing date", () => {
    const result = expenseFormSchema.safeParse({ ...validValues, expense_date: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing category", () => {
    const result = expenseFormSchema.safeParse({ ...validValues, category_id: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a note longer than 500 characters", () => {
    const result = expenseFormSchema.safeParse({ ...validValues, note: "a".repeat(501) });
    expect(result.success).toBe(false);
  });

  it("accepts a note of exactly 500 characters", () => {
    const result = expenseFormSchema.safeParse({ ...validValues, note: "a".repeat(500) });
    expect(result.success).toBe(true);
  });
});
