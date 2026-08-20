import { z } from "zod";

export const MILESTONE_BUCKETS = [
  "12mo_plus",
  "9_to_12mo",
  "6_to_9mo",
  "3_to_6mo",
  "1_to_3mo",
  "under_1mo",
  "week_of",
  "day_of",
] as const;

export type MilestoneBucket = (typeof MILESTONE_BUCKETS)[number];

const checklistTitleSchema = z.string().trim().min(1).max(500);
const checklistNotesSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().max(1000).nullable(),
);

export const BUCKET_LABELS: Record<MilestoneBucket, string> = {
  "12mo_plus": "12+ Months Out",
  "9_to_12mo": "9–12 Months Out",
  "6_to_9mo": "6–9 Months Out",
  "3_to_6mo": "3–6 Months Out",
  "1_to_3mo": "1–3 Months Out",
  under_1mo: "Under 1 Month Out",
  week_of: "Week Of",
  day_of: "Day Of",
};

export const checklistTaskSchema = z.object({
  id: z.string().uuid(),
  weddingId: z.string().uuid(),
  bucket: z.enum(MILESTONE_BUCKETS),
  title: checklistTitleSchema,
  notes: checklistNotesSchema.optional(),
  dueOffsetDays: z.number().int().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int(),
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createChecklistTaskSchema = z.object({
  title: checklistTitleSchema,
  bucket: z.enum(MILESTONE_BUCKETS),
  notes: checklistNotesSchema.optional(),
  dueOffsetDays: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateChecklistTaskSchema = z
  .object({
    title: checklistTitleSchema.optional(),
    bucket: z.enum(MILESTONE_BUCKETS).optional(),
    notes: checklistNotesSchema.nullable().optional(),
    dueOffsetDays: z.number().int().nullable().optional(),
    completedAt: z.string().datetime().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one field must be provided",
  });

export const checklistResponseSchema = z.object({
  tasks: z.array(checklistTaskSchema),
  totalCount: z.number().int(),
  completedCount: z.number().int(),
});

export type ChecklistTask = z.infer<typeof checklistTaskSchema>;
export type CreateChecklistTaskInput = z.infer<
  typeof createChecklistTaskSchema
>;
export type UpdateChecklistTaskInput = z.infer<
  typeof updateChecklistTaskSchema
>;
export type ChecklistResponse = z.infer<typeof checklistResponseSchema>;
