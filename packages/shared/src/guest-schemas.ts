import { z } from "zod";
import { GUEST_SIDES, RSVP_STATUSES, DIETARY_TAGS } from "./constants";

const optionalNullableText = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(max).nullable().optional(),
  );

const optionalNullableEmail = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  z.string().email().max(254).nullable().optional(),
);

const optionalTextCell = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
    z.string().max(max).optional(),
  );

const optionalEmailCell = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  },
  z.string().email().max(254).optional(),
);

export const createGuestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: optionalNullableEmail,
  phone: optionalNullableText(50),
  side: z.enum(GUEST_SIDES).default("mutual"),
  groupName: optionalNullableText(100),
  dietaryTags: z
    .array(z.enum(DIETARY_TAGS))
    .max(8)
    .refine((arr) => new Set(arr).size === arr.length, {
      message: "Dietary tags must be unique",
    })
    .default([]),
  dietaryNotes: optionalNullableText(500),
  rsvpStatus: z.enum(RSVP_STATUSES).default("pending"),
  primaryGuestId: z.string().uuid().nullable().optional(),
});

export const updateGuestSchema = createGuestSchema.partial();

export const bulkUpdateRsvpSchema = z
  .array(z.object({ id: z.string().uuid(), rsvpStatus: z.enum(RSVP_STATUSES) }))
  .min(1);

export const csvRowSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: optionalEmailCell,
  phone: optionalTextCell(50),
  side: z.enum(GUEST_SIDES).optional(),
  group_name: optionalTextCell(100),
  dietary_tags: z.string().optional(),
  dietary_notes: optionalTextCell(500),
});

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;
export type BulkUpdateRsvpInput = z.infer<typeof bulkUpdateRsvpSchema>;
export type CsvRowInput = z.infer<typeof csvRowSchema>;
