import { Hono } from "hono";
import type { Context } from "hono";
import {
  and,
  eq,
  getTableColumns,
  isNull,
  isNotNull,
  or,
  inArray,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import {
  householdRsvpTokenSchema,
  publicRsvpSubmissionSchema,
  weddingWebsiteDraftSchema,
  weddingWebsitePublicResponseSchema,
  weddingWebsiteSlugSchema,
} from "@kaiplan/shared";
import type {
  HouseholdRsvpGuest,
  HouseholdRsvpResponse,
  ManualRsvpReminderResult,
  RsvpStatus,
  WeddingWebsiteDraft,
  WeddingWebsitePublicResponse,
} from "@kaiplan/shared";
import type { Auth } from "../auth";
import type { Database } from "../db/client";
import type { Env } from "../lib/env";
import {
  householdRsvpToken,
  weddingWebsite,
} from "../db/wedding-website-schema";
import { guest } from "../db/guest-schema";
import { wedding } from "../db/schema";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";
import {
  recordWeddingFeatureUse,
  requireWeddingFeature,
} from "../middleware/feature-gate";
import {
  getPublicFormProtectionConfig,
  validatePublicFormSubmission,
  verifyTurnstileToken,
} from "../middleware/public-form-protection";
import { removeGuestsFromSeatingChart } from "../lib/seating-cleanup";
import { createNoopEmailService, type EmailService } from "../lib/email";
import { sendRsvpReminderSchema } from "@kaiplan/shared";
import { createRateLimitMiddleware } from "../lib/rate-limit";
import { readJsonObjectBody } from "../lib/json-body";

// ---------------------------------------------------------------------------
// RSVP rate limiter — DO-backed (audit finding #22)
//
// Public RSVP submissions are unauthenticated and trigger outbound email +
// DB writes. We rate-limit by client IP: 5 submissions per minute per IP,
// backed by the RATE_LIMITER Durable Object so limits are shared across all
// Worker isolates. When the binding is absent (test / E2E mode) the
// middleware is a no-op.
// ---------------------------------------------------------------------------

const rsvpRateLimit = createRateLimitMiddleware({
  limit: 5,
  window: 60,
  keyFn: (c) => {
    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    return `rsvp:ip:${ip}`;
  },
});

const householdRsvpTokenInputSchema = z.object({
  primaryGuestId: z.string().uuid(),
});

const heroImageUploadIntentSchema = z.object({
  contentType: z.string().trim().min(1).max(200),
  filename: z.string().trim().min(1).max(255).optional(),
});

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

type AppEnv = { Bindings: Env; Variables: Variables };

type WebsiteRow = typeof weddingWebsite.$inferSelect;
type WebsiteRowWithStatus = WebsiteRow & { weddingStatus?: string | null };
type GuestRow = typeof guest.$inferSelect;
type HouseholdTokenRow = typeof householdRsvpToken.$inferSelect;

class HouseholdRsvpConflictError extends Error {
  constructor() {
    super("HOUSEHOLD_RSVP_CONFLICT");
  }
}

function requireWriter(c: Context<AppEnv>) {
  if (c.get("weddingRole") === "viewer") {
    return c.json({ error: "Viewers cannot modify the wedding website." }, 403);
  }
  return null;
}

function isWebsiteSlugConflictError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const constraint =
      "constraint" in error && typeof error.constraint === "string"
        ? error.constraint
        : null;

    if (
      constraint === "wedding_website_slug_unique" ||
      constraint === "wedding_website_published_slug_unique"
    ) {
      return true;
    }
  }

  return (
    error instanceof Error &&
    (error.message.includes("wedding_website_slug_unique") ||
      error.message.includes("wedding_website_published_slug_unique"))
  );
}

function hasConstraintName(error: unknown, constraintName: string) {
  const hasMessageMatch =
    error instanceof Error && error.message.includes(constraintName);

  if (typeof error === "object" && error !== null) {
    const hasConstraintMatch =
      "constraint" in error && error.constraint === constraintName;

    return hasConstraintMatch || hasMessageMatch;
  }

  return hasMessageMatch;
}

async function validateHeroImageDeliveryUrl(
  env: Pick<
    Env,
    | "CLOUDFLARE_IMAGES_ACCOUNT_ID"
    | "CLOUDFLARE_IMAGES_API_TOKEN"
    | "CLOUDFLARE_IMAGES_DELIVERY_BASE_URL"
  >,
  draft: WeddingWebsiteDraft,
): Promise<string | undefined> {
  const heroImage = draft.content.heroImage;
  if (!heroImage) {
    return undefined;
  }

  if (
    heroImage.mimeType &&
    !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(heroImage.mimeType)
  ) {
    return "Unsupported image type";
  }

  const deliveryBaseUrl = env.CLOUDFLARE_IMAGES_DELIVERY_BASE_URL?.replace(
    /\/$/,
    "",
  );
  if (!deliveryBaseUrl) {
    return "Cloudflare Images delivery URL is not configured.";
  }

  if (!heroImage.url.startsWith(`${deliveryBaseUrl}/`)) {
    return "Hero image URL must use the configured Cloudflare Images delivery domain.";
  }

  if (!heroImage.url.startsWith(`${deliveryBaseUrl}/${heroImage.imageId}/`)) {
    return "Hero image URL does not match the uploaded image.";
  }

  if (!env.CLOUDFLARE_IMAGES_ACCOUNT_ID || !env.CLOUDFLARE_IMAGES_API_TOKEN) {
    return "Cloudflare Images is not configured for hero image verification.";
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_IMAGES_ACCOUNT_ID}/images/v1/${encodeURIComponent(heroImage.imageId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_IMAGES_API_TOKEN}`,
      },
    },
  );

  if (!response.ok) {
    return "Hero image could not be verified.";
  }

  const payload = (await response.json()) as {
    success?: boolean;
    result?: {
      meta?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };
  };
  const metadata = payload.result?.metadata ?? payload.result?.meta ?? {};
  if (
    !payload.success ||
    metadata.weddingId !== draft.weddingId ||
    metadata.purpose !== "wedding-website-hero"
  ) {
    return "Hero image does not belong to this wedding.";
  }

  if (
    typeof metadata.contentType === "string" &&
    !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(metadata.contentType)
  ) {
    return "Unsupported image type";
  }

  return undefined;
}

type InvalidHeroImagePublishResult = {
  type: "invalidHeroImage";
  error: string;
};

function isInvalidHeroImagePublishResult(
  value: unknown,
): value is InvalidHeroImagePublishResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "invalidHeroImage"
  );
}

function toDraftResponse(row: WebsiteRow): WeddingWebsiteDraft {
  return {
    weddingId: row.weddingId,
    slug: row.slug,
    template: row.template,
    content: row.draftContent,
    publishedSlug: row.publishedSlug,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toPublicResponse(row: WebsiteRow): WeddingWebsitePublicResponse {
  const publishedContent = row.publishedContent ?? row.draftContent;
  const publishedTemplate = row.publishedTemplate ?? row.template;
  const publishedSlug = row.publishedSlug ?? row.slug;
  const publishedAt =
    row.publishedAt?.toISOString() ?? new Date().toISOString();

  const response = {
    weddingId: row.weddingId,
    slug: publishedSlug,
    template: publishedTemplate,
    publishedAt,
    content: publishedContent,
  };

  return weddingWebsitePublicResponseSchema.parse(response);
}

function buildHouseholdResponse(
  tokenRow: HouseholdTokenRow,
  guests: GuestRow[],
): HouseholdRsvpResponse {
  const primaryGuest = guests.find(
    (row) => row.id === tokenRow.primaryGuestId && row.primaryGuestId === null,
  );

  if (!primaryGuest) {
    throw new Error("RSVP token not found.");
  }

  const householdGuests = [
    primaryGuest,
    ...guests.filter((row) => row.primaryGuestId === tokenRow.primaryGuestId),
  ];

  return {
    token: tokenRow.token,
    primaryGuest: serializePublicGuest(primaryGuest),
    guests: householdGuests.map(serializePublicGuest),
  };
}

function serializePublicGuest(row: GuestRow): HouseholdRsvpGuest {
  return {
    id: row.id,
    firstName: row.firstName,
    rsvpStatus: row.rsvpStatus as RsvpStatus,
    lastName: row.lastName,
  };
}

function serializeHouseholdToken(row: HouseholdTokenRow) {
  return householdRsvpTokenSchema.parse({
    token: row.token,
    weddingId: row.weddingId,
    primaryGuestId: row.primaryGuestId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

async function loadWeddingWebsite(
  db: Pick<Database, "select">,
  weddingId: string,
) {
  return db
    .select()
    .from(weddingWebsite)
    .where(eq(weddingWebsite.weddingId, weddingId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function findSlugConflict(db: Pick<Database, "select">, slug: string) {
  return (await db
    .select({ weddingId: weddingWebsite.weddingId, id: weddingWebsite.id })
    .from(weddingWebsite)
    .where(
      or(eq(weddingWebsite.slug, slug), eq(weddingWebsite.publishedSlug, slug)),
    )) as { weddingId: string; id: string }[];
}

async function loadPublishedWebsiteBySlug(db: Database, slug: string) {
  return db
    .select({
      ...getTableColumns(weddingWebsite),
      weddingStatus: wedding.status,
    })
    .from(weddingWebsite)
    .innerJoin(wedding, eq(weddingWebsite.weddingId, wedding.id))
    .where(
      and(
        eq(weddingWebsite.publishedSlug, slug),
        isNotNull(weddingWebsite.publishedAt),
      ),
    )
    .limit(1)
    .then((rows) => (rows[0] as WebsiteRowWithStatus | undefined) ?? null);
}

async function loadPublishedWebsiteByWeddingId(
  db: Database,
  weddingId: string,
) {
  return db
    .select({
      ...getTableColumns(weddingWebsite),
      weddingStatus: wedding.status,
    })
    .from(weddingWebsite)
    .innerJoin(wedding, eq(weddingWebsite.weddingId, wedding.id))
    .where(
      and(
        eq(weddingWebsite.weddingId, weddingId),
        isNotNull(weddingWebsite.publishedAt),
      ),
    )
    .limit(1)
    .then((rows) => (rows[0] as WebsiteRowWithStatus | undefined) ?? null);
}

function isPublishedRsvpVisible<T extends WebsiteRow>(row: T | null): row is T {
  return row?.publishedContent?.rsvp?.visible === true;
}

async function loadHouseholdToken(db: Database, token: string) {
  return db
    .select()
    .from(householdRsvpToken)
    .where(eq(householdRsvpToken.token, token))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function loadHouseholdTokenByPrimaryGuestId(
  db: Database,
  weddingId: string,
  primaryGuestId: string,
) {
  return db
    .select()
    .from(householdRsvpToken)
    .where(
      and(
        eq(householdRsvpToken.weddingId, weddingId),
        eq(householdRsvpToken.primaryGuestId, primaryGuestId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function loadPrimaryGuest(
  db: Database,
  weddingId: string,
  primaryGuestId: string,
) {
  return db
    .select()
    .from(guest)
    .where(
      and(
        eq(guest.weddingId, weddingId),
        eq(guest.id, primaryGuestId),
        isNull(guest.primaryGuestId),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function loadHouseholdGuests(
  db: Pick<Database, "select">,
  tokenRow: HouseholdTokenRow,
) {
  return db
    .select()
    .from(guest)
    .where(eq(guest.weddingId, tokenRow.weddingId))
    .then((rows) => rows as GuestRow[]);
}

function getHouseholdRsvpAllowedIds(
  tokenRow: HouseholdTokenRow,
  householdGuests: GuestRow[],
) {
  return new Set([
    tokenRow.primaryGuestId,
    ...householdGuests
      .filter((row) => row.primaryGuestId === tokenRow.primaryGuestId)
      .map((row) => row.id),
  ]);
}

async function upsertWebsiteDraft(
  db: Database,
  weddingId: string,
  input: WeddingWebsiteDraft,
) {
  const now = new Date();

  const [row] = await db
    .insert(weddingWebsite)
    .values({
      weddingId,
      slug: input.slug,
      template: input.template,
      draftContent: input.content,
      publishedSlug: null,
      publishedTemplate: null,
      publishedContent: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: weddingWebsite.weddingId,
      set: {
        slug: input.slug,
        template: input.template,
        draftContent: input.content,
        updatedAt: now,
      },
    })
    .returning();

  return row as WebsiteRow | undefined;
}

async function publishWebsiteDraft(
  db: Database,
  weddingId: string,
  env: Pick<
    Env,
    | "CLOUDFLARE_IMAGES_ACCOUNT_ID"
    | "CLOUDFLARE_IMAGES_API_TOKEN"
    | "CLOUDFLARE_IMAGES_DELIVERY_BASE_URL"
  >,
) {
  // Run the slug-conflict check and the status update inside a single
  // transaction so a concurrent publish cannot slip through between the
  // SELECT and the UPDATE.
  return db.transaction(async (tx) => {
    const existing = await loadWeddingWebsite(tx, weddingId);
    if (!existing) {
      return null;
    }

    const conflicts = await findSlugConflict(tx, existing.slug);
    if (conflicts.some((row) => row.weddingId !== weddingId)) {
      return "conflict";
    }

    const draftForValidation = {
      weddingId,
      slug: existing.slug,
      template: existing.template,
      content: existing.draftContent,
    } as WeddingWebsiteDraft;
    const heroImageError = await validateHeroImageDeliveryUrl(
      env,
      draftForValidation,
    );
    if (heroImageError) {
      return { type: "invalidHeroImage" as const, error: heroImageError };
    }

    const now = new Date();
    const [updated] = await tx
      .update(weddingWebsite)
      .set({
        publishedSlug: existing.slug,
        publishedTemplate: existing.template,
        publishedContent: existing.draftContent,
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(weddingWebsite.weddingId, weddingId))
      .returning();

    return updated as WebsiteRow | undefined;
  });
}

async function unpublishWebsite(db: Database, weddingId: string) {
  const existing = await loadWeddingWebsite(db, weddingId);
  if (!existing) {
    return null;
  }

  const now = new Date();
  const [updated] = await db
    .update(weddingWebsite)
    .set({
      publishedSlug: null,
      publishedTemplate: null,
      publishedContent: null,
      publishedAt: null,
      updatedAt: now,
    })
    .where(eq(weddingWebsite.weddingId, weddingId))
    .returning();

  return updated as WebsiteRow | undefined;
}

async function deleteWebsiteDraft(db: Database, weddingId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM wedding_website WHERE wedding_id = ${weddingId} FOR UPDATE`,
    );

    const existing = await loadWeddingWebsite(tx, weddingId);
    if (!existing) {
      return null;
    }

    const { publishedSlug, publishedTemplate, publishedContent } = existing;

    if (!publishedSlug || !publishedTemplate || !publishedContent) {
      const [deletedWebsite] = await tx
        .delete(weddingWebsite)
        .where(
          and(
            eq(weddingWebsite.weddingId, weddingId),
            isNull(weddingWebsite.publishedAt),
          ),
        )
        .returning({ id: weddingWebsite.id });

      return deletedWebsite ?? null;
    }

    const now = new Date();
    const [updated] = await tx
      .update(weddingWebsite)
      .set({
        slug: publishedSlug,
        template: publishedTemplate,
        draftContent: publishedContent,
        updatedAt: now,
      })
      .where(eq(weddingWebsite.weddingId, weddingId))
      .returning({ id: weddingWebsite.id });

    return updated ?? null;
  });
}

async function updateHouseholdRsvps(
  db: Database,
  tokenRow: HouseholdTokenRow,
  payload: { guests: { guestId: string; rsvpStatus: string }[] },
  householdGuests?: GuestRow[],
) {
  const resolvedHouseholdGuests =
    householdGuests ?? (await loadHouseholdGuests(db, tokenRow));
  const allowedIds = getHouseholdRsvpAllowedIds(
    tokenRow,
    resolvedHouseholdGuests,
  );

  for (const item of payload.guests) {
    if (!allowedIds.has(item.guestId)) {
      return null;
    }
  }

  const submittedGuestIds = new Set<string>();
  for (const item of payload.guests) {
    if (submittedGuestIds.has(item.guestId)) {
      return "duplicate" as const;
    }
    submittedGuestIds.add(item.guestId);
  }

  // M12: Batch household RSVP updates — group by status and issue one UPDATE
  // per distinct status value instead of one per guest row (N+1 fix).
  const byStatus = new Map<string, string[]>();
  for (const item of payload.guests) {
    const group = byStatus.get(item.rsvpStatus) ?? [];
    group.push(item.guestId);
    byStatus.set(item.rsvpStatus, group);
  }
  const declinedIds = byStatus.get("declined") ?? [];

  try {
    return await db.transaction(async (tx) => {
      const currentAllowedIds = getHouseholdRsvpAllowedIds(
        tokenRow,
        await loadHouseholdGuests(tx, tokenRow),
      );
      for (const item of payload.guests) {
        if (!currentAllowedIds.has(item.guestId)) {
          throw new HouseholdRsvpConflictError();
        }
      }

      let updated = 0;
      for (const [rsvpStatus, statusIds] of byStatus) {
        const rows = (await tx
          .update(guest)
          .set({ rsvpStatus, updatedAt: new Date() })
          .where(
            and(
              eq(guest.weddingId, tokenRow.weddingId),
              inArray(guest.id, statusIds),
              or(
                and(
                  eq(guest.id, tokenRow.primaryGuestId),
                  isNull(guest.primaryGuestId),
                ),
                eq(guest.primaryGuestId, tokenRow.primaryGuestId),
              ),
            ),
          )
          .returning({ id: guest.id })) as Array<{ id: string }>;
        if (rows.length !== statusIds.length) {
          throw new HouseholdRsvpConflictError();
        }
        updated += rows.length;
      }
      await removeGuestsFromSeatingChart(tx, tokenRow.weddingId, declinedIds);
      return updated;
    });
  } catch (error) {
    if (!(error instanceof HouseholdRsvpConflictError)) {
      throw error;
    }
    return "conflict" as const;
  }
}

async function upsertHouseholdRsvpToken(
  db: Database,
  weddingId: string,
  primaryGuestId: string,
) {
  const existing = await loadHouseholdTokenByPrimaryGuestId(
    db,
    weddingId,
    primaryGuestId,
  );

  if (existing) {
    return { tokenRow: existing as HouseholdTokenRow, created: false };
  }

  try {
    const [created] = await db
      .insert(householdRsvpToken)
      .values({
        weddingId,
        primaryGuestId,
      })
      .returning();

    return {
      tokenRow: created as HouseholdTokenRow | undefined,
      created: true,
    };
  } catch (error) {
    if (hasConstraintName(error, "household_rsvp_token_primary_guest_unique")) {
      const latest = await loadHouseholdTokenByPrimaryGuestId(
        db,
        weddingId,
        primaryGuestId,
      );

      return {
        tokenRow: latest as HouseholdTokenRow | null,
        created: false,
      };
    }

    throw error;
  }
}

/**
 * Thrown when the Cloudflare Images integration is not configured.
 * Callers surface this as a 503 feature-unavailable response, distinct from
 * network/API failures, so a deliberately-disabled integration does not look
 * like an internal error.
 */
export class HeroImageUploadNotConfiguredError extends Error {
  constructor() {
    super("Cloudflare Images is not configured for this environment.");
    this.name = "HeroImageUploadNotConfiguredError";
  }
}

async function createHeroImageUploadIntent(
  env: Pick<
    Env,
    | "CLOUDFLARE_IMAGES_ACCOUNT_ID"
    | "CLOUDFLARE_IMAGES_API_TOKEN"
    | "CLOUDFLARE_IMAGES_DELIVERY_BASE_URL"
    | "CLOUDFLARE_IMAGES_DIRECT_UPLOAD_TTL_SECONDS"
  >,
  input: { weddingId: string; contentType: string; filename?: string },
) {
  if (!env.CLOUDFLARE_IMAGES_ACCOUNT_ID || !env.CLOUDFLARE_IMAGES_API_TOKEN) {
    throw new HeroImageUploadNotConfiguredError();
  }

  const deliveryBaseUrl = env.CLOUDFLARE_IMAGES_DELIVERY_BASE_URL?.replace(
    /\/$/,
    "",
  );
  if (!deliveryBaseUrl) {
    throw new HeroImageUploadNotConfiguredError();
  }

  const parsedTtl = Number(env.CLOUDFLARE_IMAGES_DIRECT_UPLOAD_TTL_SECONDS);
  const ttlSeconds =
    Number.isFinite(parsedTtl) && parsedTtl > 0 ? parsedTtl : 15 * 60;

  // Throws on network error — propagate to global error handler
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_IMAGES_ACCOUNT_ID}/images/v2/direct_upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_IMAGES_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expiry: ttlSeconds,
        metadata: {
          weddingId: input.weddingId,
          purpose: "wedding-website-hero",
          contentType: input.contentType,
          ...(input.filename ? { filename: input.filename } : {}),
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Cloudflare Images API returned ${response.status}: ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    success?: boolean;
    result?: { id?: string; uploadURL?: string };
  };

  if (!payload.success || !payload.result?.id || !payload.result.uploadURL) {
    throw new Error("Cloudflare Images API returned an unexpected response.");
  }

  return {
    imageId: payload.result.id,
    uploadUrl: payload.result.uploadURL,
    imageUrl: `${deliveryBaseUrl}/${payload.result.id}/public`,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

export function weddingWebsiteRoutes(
  db: Database,
  auth: Auth,
  emailService: EmailService = createNoopEmailService(),
) {
  const app = new Hono<AppEnv>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  app.get(
    "/:weddingId/website",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const row = await loadWeddingWebsite(db, weddingId);

      if (!row) {
        return c.json(null);
      }

      return c.json(toDraftResponse(row));
    },
  );

  app.post(
    "/:weddingId/website",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = weddingWebsiteDraftSchema.safeParse({
        ...body,
        weddingId,
      });

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const heroImageError = await validateHeroImageDeliveryUrl(
        c.env,
        parsed.data,
      );
      if (heroImageError) {
        return c.json({ error: heroImageError }, 400);
      }

      const conflicts = await findSlugConflict(db, parsed.data.slug);
      if (conflicts.some((row) => row.weddingId !== weddingId)) {
        return c.json({ error: "Slug already in use." }, 409);
      }

      let saved: WebsiteRow | undefined;
      try {
        saved = await upsertWebsiteDraft(db, weddingId, parsed.data);
      } catch (error) {
        if (isWebsiteSlugConflictError(error)) {
          return c.json({ error: "Slug already in use." }, 409);
        }
        if (hasConstraintName(error, "wedding_website_wedding_id_unique")) {
          const latest = await loadWeddingWebsite(db, weddingId);
          if (latest && latest.slug === parsed.data.slug) {
            await recordWeddingFeatureUse(db, c, "weddingWebsite");
            return c.json(toDraftResponse(latest), 200);
          }

          return c.json(
            { error: "Website draft already exists for this wedding." },
            409,
          );
        }
        throw error;
      }
      if (!saved) {
        return c.json({ error: "Website draft not found." }, 404);
      }

      // Upsert semantics: always 200. Previously returned 201 for first-write
      // vs 200 for overwrite, which required an extra pre-upsert read.
      await recordWeddingFeatureUse(db, c, "weddingWebsite");
      return c.json(toDraftResponse(saved), 200);
    },
  );

  app.patch(
    "/:weddingId/website",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = weddingWebsiteDraftSchema.safeParse({
        ...body,
        weddingId,
      });

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const heroImageError = await validateHeroImageDeliveryUrl(
        c.env,
        parsed.data,
      );
      if (heroImageError) {
        return c.json({ error: heroImageError }, 400);
      }

      const conflicts = await findSlugConflict(db, parsed.data.slug);
      if (conflicts.some((row) => row.weddingId !== weddingId)) {
        return c.json({ error: "Slug already in use." }, 409);
      }

      let saved: WebsiteRow | undefined;
      try {
        saved = await upsertWebsiteDraft(db, weddingId, parsed.data);
      } catch (error) {
        if (isWebsiteSlugConflictError(error)) {
          return c.json({ error: "Slug already in use." }, 409);
        }
        throw error;
      }
      if (!saved) {
        return c.json({ error: "Website draft not found." }, 404);
      }

      await recordWeddingFeatureUse(db, c, "weddingWebsite");
      return c.json(toDraftResponse(saved));
    },
  );

  app.delete(
    "/:weddingId/website",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const deletedWebsite = await deleteWebsiteDraft(db, weddingId);

      if (!deletedWebsite) {
        return c.json({ error: "Website draft not found." }, 404);
      }

      await recordWeddingFeatureUse(db, c, "weddingWebsite");

      return c.body(null, 204);
    },
  );

  app.post(
    "/:weddingId/website/publish",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      let updated: Awaited<ReturnType<typeof publishWebsiteDraft>>;
      try {
        updated = await publishWebsiteDraft(db, weddingId, c.env);
      } catch (error) {
        if (isWebsiteSlugConflictError(error)) {
          return c.json({ error: "Slug already in use." }, 409);
        }
        throw error;
      }

      if (updated === "conflict") {
        return c.json({ error: "Slug already in use." }, 409);
      }

      if (isInvalidHeroImagePublishResult(updated)) {
        return c.json({ error: updated.error }, 400);
      }

      if (!updated) {
        return c.json({ error: "Website draft not found." }, 404);
      }

      await recordWeddingFeatureUse(db, c, "weddingWebsite");

      return c.json(toDraftResponse(updated));
    },
  );

  app.delete(
    "/:weddingId/website/publish",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const updated = await unpublishWebsite(db, weddingId);

      if (!updated) {
        return c.json({ error: "Website draft not found." }, 404);
      }

      await recordWeddingFeatureUse(db, c, "weddingWebsite");

      return c.json(toDraftResponse(updated));
    },
  );

  app.get(
    "/:weddingId/website/slug-availability",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const rawSlug = c.req.query("slug");
      const parsedSlug = weddingWebsiteSlugSchema.safeParse(rawSlug);

      if (!parsedSlug.success) {
        return c.json({ error: "Invalid slug." }, 400);
      }

      const weddingId = c.req.param("weddingId");
      const conflicts = await findSlugConflict(db, parsedSlug.data);
      const available = !conflicts.some((row) => row.weddingId !== weddingId);

      return c.json({ available });
    },
  );

  app.get(
    "/:weddingId/website/household-rsvp-token/:primaryGuestId",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const primaryGuestId = c.req.param("primaryGuestId");
      const parsedPrimaryGuestId =
        householdRsvpTokenInputSchema.shape.primaryGuestId.safeParse(
          primaryGuestId,
        );

      if (!parsedPrimaryGuestId.success) {
        return c.json({ error: "Invalid primary guest ID." }, 400);
      }

      const guestRow = await loadPrimaryGuest(db, weddingId, primaryGuestId);

      if (!guestRow) {
        return c.json({ error: "Primary guest not found." }, 404);
      }

      const tokenRow = await loadHouseholdTokenByPrimaryGuestId(
        db,
        weddingId,
        primaryGuestId,
      );

      if (!tokenRow) {
        return c.json({ error: "Household RSVP token not found." }, 404);
      }

      return c.json(serializeHouseholdToken(tokenRow));
    },
  );

  app.post(
    "/:weddingId/website/household-rsvp-token",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = householdRsvpTokenInputSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const guestRow = await loadPrimaryGuest(
        db,
        weddingId,
        parsed.data.primaryGuestId,
      );

      if (!guestRow) {
        return c.json({ error: "Primary guest not found." }, 404);
      }

      const tokenResult = await upsertHouseholdRsvpToken(
        db,
        weddingId,
        parsed.data.primaryGuestId,
      );

      if (!tokenResult.tokenRow) {
        return c.json(
          { error: "Household RSVP token could not be created." },
          500,
        );
      }

      await recordWeddingFeatureUse(db, c, "weddingWebsite");

      return c.json(
        serializeHouseholdToken(tokenResult.tokenRow),
        tokenResult.created ? 201 : 200,
      );
    },
  );

  app.post(
    "/:weddingId/website/rsvp-reminders",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = sendRsvpReminderSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const websiteRow = await loadPublishedWebsiteByWeddingId(db, weddingId);
      if (!isPublishedRsvpVisible(websiteRow)) {
        return c.json({
          results: parsed.data.primaryGuestIds.map((primaryGuestId) => ({
            primaryGuestId,
            guestEmail: null,
            status: "skippedNoWebsite" as const,
            emailId: null,
            error: null,
          })),
        });
      }

      const results: ManualRsvpReminderResult[] = [];
      for (const primaryGuestId of parsed.data.primaryGuestIds) {
        const guestRow = await loadPrimaryGuest(db, weddingId, primaryGuestId);
        if (!guestRow || guestRow.primaryGuestId !== null) {
          results.push({
            primaryGuestId,
            guestEmail: null,
            status: "skippedIneligible" as const,
            emailId: null,
            error: null,
          });
          continue;
        }

        if (
          guestRow.rsvpStatus !== "pending" &&
          guestRow.rsvpStatus !== "invited"
        ) {
          results.push({
            primaryGuestId,
            guestEmail: guestRow.email,
            status: "skippedIneligible" as const,
            emailId: null,
            error: null,
          });
          continue;
        }

        const tokenResult = await upsertHouseholdRsvpToken(
          db,
          weddingId,
          primaryGuestId,
        );

        if (!tokenResult.tokenRow) {
          results.push({
            primaryGuestId,
            guestEmail: guestRow.email,
            status: "failed" as const,
            emailId: null,
            error: "Household RSVP token could not be created.",
          });
          continue;
        }

        results.push(
          await emailService.sendRsvpReminder({
            weddingId,
            primaryGuestId,
            guestEmail: guestRow.email,
            token: tokenResult.tokenRow.token,
          }),
        );
      }

      if (results.some((result) => result.status === "sent")) {
        await recordWeddingFeatureUse(db, c, "weddingWebsite");
      }

      return c.json({ results });
    },
  );

  app.post(
    "/:weddingId/website/hero-image-upload-intent",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const denied = requireWriter(c);
      if (denied) return denied;

      const featureError = await requireWeddingFeature(
        db,
        c,
        "weddingWebsite",
        { recordUse: false },
      );
      if (featureError) return featureError;

      const weddingId = c.req.param("weddingId");
      const { body, response } = await readJsonObjectBody(c);
      if (response) return response;

      const parsed = heroImageUploadIntentSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      if (
        !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(
          parsed.data.contentType,
        )
      ) {
        return c.json({ error: "Unsupported image type" }, 400);
      }

      let intent;
      try {
        // Throws on misconfiguration or upstream error.
        intent = await createHeroImageUploadIntent(c.env, {
          weddingId,
          contentType: parsed.data.contentType,
          filename: parsed.data.filename,
        });
      } catch (error) {
        if (error instanceof HeroImageUploadNotConfiguredError) {
          return c.json(
            { error: "Wedding website hero image upload is not available." },
            503,
          );
        }
        // Genuine upstream/network failures propagate to the global handler.
        throw error;
      }

      await recordWeddingFeatureUse(db, c, "weddingWebsite");

      return c.json(intent);
    },
  );

  return app;
}

export function publicWeddingWebsiteRoutes(
  db: Database,
  emailService: EmailService = createNoopEmailService(),
) {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/websites/:slug", async (c) => {
    const slug = c.req.param("slug");
    const parsedSlug = weddingWebsiteSlugSchema.safeParse(slug);
    if (!parsedSlug.success) {
      return c.json({ error: "Invalid slug." }, 400);
    }

    const row = await loadPublishedWebsiteBySlug(db, parsedSlug.data);
    if (!row || !row.publishedAt || !row.publishedContent) {
      return c.json({ error: "Website not found." }, 404);
    }
    if (row.weddingStatus === "archived") {
      return c.json({ error: "Wedding is archived and read-only" }, 423);
    }

    return c.json(toPublicResponse(row));
  });

  app.get("/rsvp/:token", async (c) => {
    const token = c.req.param("token");
    const parsedToken = householdRsvpTokenSchema.shape.token.safeParse(token);
    if (!parsedToken.success) {
      return c.json({ error: "Invalid RSVP token." }, 400);
    }

    const tokenRow = await loadHouseholdToken(db, parsedToken.data);
    if (!tokenRow) {
      return c.json({ error: "RSVP token not found." }, 404);
    }

    const websiteRow = await loadPublishedWebsiteByWeddingId(
      db,
      tokenRow.weddingId,
    );
    if (!isPublishedRsvpVisible(websiteRow)) {
      return c.json({ error: "RSVP token not found." }, 404);
    }
    if (websiteRow.weddingStatus === "archived") {
      return c.json({ error: "Wedding is archived and read-only" }, 423);
    }

    const guests = await loadHouseholdGuests(db, tokenRow);
    try {
      const household = buildHouseholdResponse(tokenRow, guests);
      return c.json(household);
    } catch (error) {
      if (error instanceof Error && error.message === "RSVP token not found.") {
        return c.json({ error: "RSVP token not found." }, 404);
      }

      throw error;
    }
  });

  app.post("/rsvp/:token", rsvpRateLimit, async (c) => {
    const token = c.req.param("token");
    const parsedToken = householdRsvpTokenSchema.shape.token.safeParse(token);
    if (!parsedToken.success) {
      return c.json({ error: "Invalid RSVP token." }, 400);
    }

    const { body, response } = await readJsonObjectBody(c);
    if (response) return response;

    const rsvpBody = body;
    const protectionConfig = getPublicFormProtectionConfig(c.env);
    const protection = validatePublicFormSubmission(rsvpBody, protectionConfig);

    if (!protection.ok) {
      return c.json({ error: protection.error }, 400);
    }

    const parsed = publicRsvpSubmissionSchema.safeParse({
      ...rsvpBody,
      honeypot: rsvpBody[protectionConfig.honeypotField],
      turnstileToken: rsvpBody[protectionConfig.turnstileField],
    });
    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    if (protectionConfig.requireTurnstile) {
      const verification = await verifyTurnstileToken(
        parsed.data.turnstileToken ?? "",
        c.env,
      );

      if (!verification.ok) {
        return c.json({ error: verification.error }, verification.status);
      }
    }

    const tokenRow = await loadHouseholdToken(db, parsedToken.data);
    if (!tokenRow) {
      return c.json({ error: "RSVP token not found." }, 404);
    }

    const websiteRow = await loadPublishedWebsiteByWeddingId(
      db,
      tokenRow.weddingId,
    );
    if (!isPublishedRsvpVisible(websiteRow)) {
      return c.json({ error: "RSVP token not found." }, 404);
    }
    if (websiteRow.weddingStatus === "archived") {
      return c.json({ error: "Wedding is archived and read-only" }, 423);
    }

    const householdGuests = await loadHouseholdGuests(db, tokenRow);

    try {
      buildHouseholdResponse(tokenRow, householdGuests);
    } catch (error) {
      if (error instanceof Error && error.message === "RSVP token not found.") {
        return c.json({ error: "RSVP token not found." }, 404);
      }

      throw error;
    }

    const updated = await updateHouseholdRsvps(
      db,
      tokenRow,
      parsed.data,
      householdGuests,
    );
    if (updated === null) {
      return c.json({ error: "One or more guest IDs are invalid." }, 400);
    }
    if (updated === "duplicate") {
      return c.json({ error: "Duplicate guest IDs are not allowed." }, 400);
    }
    if (updated === "conflict") {
      return c.json(
        { error: "One or more guest RSVPs could not be updated." },
        409,
      );
    }

    if (updated > 0) {
      const householdGuests = await loadHouseholdGuests(db, tokenRow);
      const primaryGuest = householdGuests.find(
        (row) => row.id === tokenRow.primaryGuestId,
      );

      if (primaryGuest?.email) {
        try {
          await emailService.sendRsvpConfirmation({
            weddingId: tokenRow.weddingId,
            primaryGuestId: tokenRow.primaryGuestId,
            guestEmail: primaryGuest.email,
            token: tokenRow.token,
          });
        } catch (err) {
          console.error("[RSVP] confirmation email failed", err);
        }
      }
    }

    return c.json({ updated });
  });

  return app;
}
