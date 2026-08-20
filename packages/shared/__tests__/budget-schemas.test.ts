import { describe, it, expect } from "vitest";
import {
  createBudgetCategorySchema,
  updateBudgetCategorySchema,
  createBudgetItemSchema,
  updateBudgetItemSchema,
} from "../src/budget-schemas";

describe("createBudgetCategorySchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 500000,
    });
    expect(result.success).toBe(true);
  });

  it("defaults estimatedCents to 0", () => {
    const result = createBudgetCategorySchema.safeParse({ name: "Catering" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCents).toBe(0);
    }
  });

  it("rejects empty name", () => {
    const result = createBudgetCategorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = createBudgetCategorySchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("accepts name at exactly 200 characters", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "a".repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative estimatedCents", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer estimatedCents", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 100.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects estimatedCents above 999999999", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 1_000_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts estimatedCents at max bound (999999999)", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 999_999_999,
    });
    expect(result.success).toBe(true);
  });

  it("accepts estimatedCents of zero", () => {
    const result = createBudgetCategorySchema.safeParse({
      name: "Venue",
      estimatedCents: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("updateBudgetCategorySchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateBudgetCategorySchema.safeParse({ name: "Flowers" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with estimatedCents only", () => {
    const result = updateBudgetCategorySchema.safeParse({
      estimatedCents: 25000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with sortOrder only", () => {
    const result = updateBudgetCategorySchema.safeParse({ sortOrder: 3 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateBudgetCategorySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid estimatedCents (negative)", () => {
    const result = updateBudgetCategorySchema.safeParse({
      estimatedCents: -500,
    });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = updateBudgetCategorySchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });
});

describe("createBudgetItemSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "DJ Services",
      estimatedCents: 150000,
      quotedCents: 140000,
      paidCents: 70000,
      notes: "Includes 6 hours",
    });
    expect(result.success).toBe(true);
  });

  it("defaults cents fields to 0 and notes to null when only name provided", () => {
    const result = createBudgetItemSchema.safeParse({ name: "Photographer" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.estimatedCents).toBe(0);
      expect(result.data.quotedCents).toBe(0);
      expect(result.data.paidCents).toBe(0);
      expect(result.data.notes).toBeNull();
    }
  });

  it("rejects empty name", () => {
    const result = createBudgetItemSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = createBudgetItemSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "a".repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quotedCents", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Band",
      quotedCents: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer paidCents", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Band",
      paidCents: 99.99,
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes exceeding 1000 characters", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Band",
      notes: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts notes at exactly 1000 characters", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Band",
      notes: "a".repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it("accepts null notes explicitly", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Band",
      notes: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("normalizes blank notes to null", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Band",
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("trims notes", () => {
    const result = createBudgetItemSchema.safeParse({
      name: "Band",
      notes: "  Includes 6 hours  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("Includes 6 hours");
    }
  });
});

describe("updateBudgetItemSchema", () => {
  it("accepts partial update with name only", () => {
    const result = updateBudgetItemSchema.safeParse({ name: "Updated Band" });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with quotedCents only", () => {
    const result = updateBudgetItemSchema.safeParse({ quotedCents: 200000 });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with sortOrder only", () => {
    const result = updateBudgetItemSchema.safeParse({ sortOrder: 5 });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with notes only", () => {
    const result = updateBudgetItemSchema.safeParse({
      notes: "Updated notes",
    });
    expect(result.success).toBe(true);
  });

  it("normalizes blank notes to null", () => {
    const result = updateBudgetItemSchema.safeParse({
      notes: "   ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBeNull();
    }
  });

  it("accepts empty object", () => {
    const result = updateBudgetItemSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid paidCents (non-integer)", () => {
    const result = updateBudgetItemSchema.safeParse({ paidCents: 50.5 });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only name", () => {
    const result = updateBudgetItemSchema.safeParse({ name: "   " });
    expect(result.success).toBe(false);
  });
});
