import { z } from "zod";
import {
  RESERVED_SLUG_WORDS,
  WEDDING_WEBSITE_RESERVED_SLUGS,
  WEDDING_WEBSITE_TEMPLATES,
} from "./constants";
import { httpsUrlField } from "./url";

const websiteTextSchema = z.string().trim().max(4000).default("");
const trimmedHttpsUrlField = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  httpsUrlField,
);
const nullableTrimmedHttpsUrlField = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  },
  httpsUrlField.nullable().optional(),
);

const heroImageMetadataSchema = z.object({
  imageId: z.string().trim().min(1).max(255),
  url: trimmedHttpsUrlField,
  alt: z.string().trim().max(200).default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  mimeType: z.string().trim().max(100).optional(),
});

export const weddingWebsiteTemplateSchema = z.enum(WEDDING_WEBSITE_TEMPLATES);

export const weddingWebsiteSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(63)
  .refine((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), {
    message: "Slug must use lowercase letters, numbers, and hyphens.",
  })
  .refine(
    (value) =>
      !WEDDING_WEBSITE_RESERVED_SLUGS.includes(
        value as (typeof WEDDING_WEBSITE_RESERVED_SLUGS)[number],
      ),
    {
      message: "Slug is reserved.",
    },
  )
  .refine(
    (value) =>
      !RESERVED_SLUG_WORDS.includes(
        value as (typeof RESERVED_SLUG_WORDS)[number],
      ),
    {
      message: "Slug is reserved.",
    },
  );

export const weddingWebsiteDraftContentSchema = z.object({
  hero: z.object({
    title: z.string().trim().min(1, "Hero title is required.").max(200),
    subtitle: websiteTextSchema,
    body: websiteTextSchema,
    ctaLabel: z.string().trim().max(80).default(""),
  }),
  story: z.object({
    title: z.string().trim().min(1, "Story title is required.").max(200),
    body: websiteTextSchema,
  }),
  venue: z.object({
    name: z.string().trim().max(200).default(""),
    address: websiteTextSchema,
    details: websiteTextSchema,
    mapUrl: nullableTrimmedHttpsUrlField,
  }),
  registry: z.object({
    title: z.string().trim().min(1, "Registry title is required.").max(200),
    url: nullableTrimmedHttpsUrlField,
    details: websiteTextSchema,
  }),
  rsvp: z.object({
    visible: z.boolean().default(true),
    headline: z.string().trim().max(200).default(""),
    details: websiteTextSchema,
  }),
  heroImage: heroImageMetadataSchema.nullable().default(null),
});

export const weddingWebsitePublishedContentSchema =
  weddingWebsiteDraftContentSchema;

export const weddingWebsiteDraftSchema = z.object({
  weddingId: z.string().min(1),
  slug: weddingWebsiteSlugSchema,
  template: weddingWebsiteTemplateSchema,
  content: weddingWebsiteDraftContentSchema,
  publishedSlug: weddingWebsiteSlugSchema.nullable().optional(),
  publishedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const weddingWebsitePublishedSnapshotSchema = z.object({
  weddingId: z.string().min(1),
  slug: weddingWebsiteSlugSchema,
  template: weddingWebsiteTemplateSchema,
  content: weddingWebsitePublishedContentSchema,
  publishedAt: z.string().datetime({ offset: true }),
});

export const weddingWebsitePublicResponseSchema = z.object({
  weddingId: z.string().min(1),
  slug: weddingWebsiteSlugSchema,
  template: weddingWebsiteTemplateSchema,
  publishedAt: z.string().datetime({ offset: true }),
  content: weddingWebsitePublishedContentSchema,
});

export const householdRsvpTokenSchema = z.object({
  token: z.string().uuid(),
  weddingId: z.string().min(1),
  primaryGuestId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const PUBLIC_RSVP_STATUSES = ["accepted", "declined"] as const;

export const publicRsvpSubmissionSchema = z.object({
  guests: z
    .array(
      z.object({
        guestId: z.string().uuid(),
        rsvpStatus: z.enum(PUBLIC_RSVP_STATUSES),
      }),
    )
    .min(1)
    .max(50),
  honeypot: z.string().max(200).default(""),
  turnstileToken: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0
        ? undefined
        : value,
    z.string().min(1).nullable().optional(),
  ),
});

export const weddingWebsiteSlugAvailabilitySchema = z.object({
  slug: weddingWebsiteSlugSchema,
  valid: z.boolean(),
  available: z.boolean(),
  conflictWeddingId: z.string().min(1).nullable(),
});

export const weddingWebsiteImageUploadIntentSchema = z.object({
  imageId: z.string().min(1),
  uploadUrl: z.string().url(),
  imageUrl: z.string().url(),
  expiresAt: z.string(),
});

export type WeddingWebsiteDraftInput = z.infer<
  typeof weddingWebsiteDraftSchema
>;
export type WeddingWebsitePublicResponseInput = z.infer<
  typeof weddingWebsitePublicResponseSchema
>;
export type PublicRsvpSubmissionInput = z.infer<
  typeof publicRsvpSubmissionSchema
>;
export type WeddingWebsiteSlugAvailabilityInput = z.infer<
  typeof weddingWebsiteSlugAvailabilitySchema
>;
export type WeddingWebsiteImageUploadIntentInput = z.infer<
  typeof weddingWebsiteImageUploadIntentSchema
>;
