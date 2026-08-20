import { z } from "zod";

const centsField = z.number().int().min(0).max(999_999_999);
const nameField = z.string().trim().min(1).max(200);
const notesField = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().max(1000).nullable(),
);

export const createBudgetCategorySchema = z.object({
  name: nameField,
  estimatedCents: centsField.default(0),
});

export const updateBudgetCategorySchema = z.object({
  name: nameField.optional(),
  estimatedCents: centsField.optional(),
  sortOrder: z.number().int().optional(),
});

export const createBudgetItemSchema = z.object({
  name: nameField,
  estimatedCents: centsField.default(0),
  quotedCents: centsField.default(0),
  paidCents: centsField.default(0),
  notes: notesField.default(null),
});

export const updateBudgetItemSchema = z.object({
  name: nameField.optional(),
  estimatedCents: centsField.optional(),
  quotedCents: centsField.optional(),
  paidCents: centsField.optional(),
  notes: notesField.optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateBudgetCategoryInput = z.infer<
  typeof createBudgetCategorySchema
>;
export type UpdateBudgetCategoryInput = z.infer<
  typeof updateBudgetCategorySchema
>;
export type CreateBudgetItemInput = z.infer<typeof createBudgetItemSchema>;
export type UpdateBudgetItemInput = z.infer<typeof updateBudgetItemSchema>;
