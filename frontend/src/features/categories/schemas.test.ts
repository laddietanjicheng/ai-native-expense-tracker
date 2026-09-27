import { describe, expect, it } from "vitest";
import { categoryNameSchema } from "./schemas";

describe("categoryNameSchema", () => {
  it("accepts a normal name", () => {
    expect(categoryNameSchema.safeParse("Food").success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = categoryNameSchema.safeParse("  Food  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Food");
  });

  it("rejects an empty name", () => {
    expect(categoryNameSchema.safeParse("").success).toBe(false);
  });

  it("rejects a name that is only whitespace", () => {
    expect(categoryNameSchema.safeParse("   ").success).toBe(false);
  });

  it("accepts a name of exactly 50 characters", () => {
    expect(categoryNameSchema.safeParse("a".repeat(50)).success).toBe(true);
  });

  it("rejects a name longer than 50 characters", () => {
    expect(categoryNameSchema.safeParse("a".repeat(51)).success).toBe(false);
  });
});
