import { z } from "zod";
import { EMAIL_PREFERENCE_TYPES, EMAIL_DELIVERY_STATUSES } from "./constants";

export const emailPreferenceTypeSchema = z.enum(EMAIL_PREFERENCE_TYPES);

export const emailDeliveryStatusSchema = z.enum(EMAIL_DELIVERY_STATUSES);

export const emailPreferencesSchema = z.object({
  appLifecycle: z.boolean().default(true),
  memberInvite: z.boolean(),
  rsvpConfirmation: z.boolean(),
  rsvpReminder: z.boolean(),
});

export const updateEmailPreferencesSchema = z.object({
  preferences: emailPreferencesSchema,
});

export const inviteMemberDeliveryMetadataSchema = z.object({
  emailId: z.string().nullable(),
  provider: z.literal("resend"),
  status: emailDeliveryStatusSchema,
  sentAt: z.string().datetime().nullable(),
  templateKey: z.string(),
  skipped: z.boolean().default(false),
  rateLimited: z.boolean().default(false),
  error: z.string().nullable().default(null),
});

export const sendRsvpReminderSchema = z.object({
  primaryGuestIds: z
    .array(z.string().uuid())
    .min(1)
    .refine((value) => new Set(value).size === value.length, {
      message: "Primary guest ids must be unique.",
    }),
});

export const reminderDeliveryResultSchema = z.object({
  primaryGuestId: z.string().uuid(),
  guestEmail: z.string().email().nullable(),
  status: z.enum([
    "sent",
    "skippedOptedOut",
    "skippedMissingEmail",
    "skippedIneligible",
    "skippedNoWebsite",
    "failed",
  ]),
  emailId: z.string().nullable(),
  error: z.string().nullable().default(null),
});

export const manualRsvpReminderResponseSchema = z.object({
  results: z.array(reminderDeliveryResultSchema),
});

export const emailPreferencesResponseSchema = z.object({
  email: z.string().email(),
  preferences: emailPreferencesSchema,
});

export const publicEmailPreferencesResponseSchema = z.object({
  email: z.string().email(),
  allowedTypes: z.array(emailPreferenceTypeSchema),
  preferences: emailPreferencesSchema,
});
