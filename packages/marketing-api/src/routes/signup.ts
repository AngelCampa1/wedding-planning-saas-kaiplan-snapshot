import { Hono } from "hono";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { signups, referrals, leadMagnetDownloads } from "../db/schema";
import { sendConfirmation, sendLeadMagnetDelivery } from "../services/email";
import { addToProductList } from "../services/apollo";
import type { ApiEnv, DrizzleD1Database } from "../app";
import { captureMarketingApiException } from "../services/sentry";
import { leadMagnetMetadata } from "../lead-magnets";
import { enrollSequencerSequence } from "../services/sequencer";
import {
  guardPublicForm,
  isHoneypotTripped,
} from "../lib/public-form-protection";
import { consumeIdentifierToken } from "../middleware/rate-limit";
import { isMarketingE2EAllowed } from "../lib/e2e-gate";
import { scheduleBackgroundTask } from "../lib/background-task";
import { isJsonObject } from "../lib/json-body";

const signupBodySchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((e) => e.toLowerCase()),
  sourcePage: z.string().trim().min(1).max(500),
  utmSource: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  utmMedium: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  utmCampaign: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  referredBy: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{8}$/)
    .optional(),
  leadMagnetTitle: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .transform((t) => t.replace(/^[Yy]our\s+/, ""))
    .optional(),
  leadMagnetSlug: z.string().trim().min(1).max(200).optional(),
});

function generateReferralCode(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const result: string[] = [];
  while (result.length < 8) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < 248 && result.length < 8) {
        result.push(chars[b % 62] ?? chars[0]!);
      }
    }
  }
  return result.join("");
}

function generateSurveyToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateDownloadToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const DOWNLOAD_TOKEN_TTL_DAYS = 30;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function resolveLeadMagnetUrl(
  sourcePage: string,
  domain: string,
  leadMagnetTitle: string | undefined,
  leadMagnetSlug: string | undefined,
): { title: string; url: string } | null {
  if (!domain || domain.startsWith("http")) {
    return null;
  }

  if (leadMagnetSlug) {
    const metadata = leadMagnetMetadata[leadMagnetSlug];
    if (metadata) {
      return {
        title: leadMagnetTitle ?? metadata.title,
        url: `https://${domain}${metadata.path}`,
      };
    }

    return null;
  }

  if (leadMagnetTitle && sourcePage.startsWith("/free/")) {
    return { title: leadMagnetTitle, url: `https://${domain}${sourcePage}` };
  }

  return null;
}

function resolveSignupLeadMagnet(
  params: Pick<
    EmailParams,
    | "domain"
    | "sourcePage"
    | "leadMagnetTitle"
    | "leadMagnetSlug"
    | "leadMagnetUrl"
  >,
): { title: string; url: string } | null {
  if (params.leadMagnetTitle && params.leadMagnetUrl) {
    return {
      title: params.leadMagnetTitle,
      url: params.leadMagnetUrl,
    };
  }

  return resolveLeadMagnetUrl(
    params.sourcePage,
    params.domain,
    params.leadMagnetTitle,
    params.leadMagnetSlug,
  );
}

interface EmailParams {
  productName: string;
  domain: string;
  logoUrl: string;
  brandColor: string;
  accentColor: string;
  recipientEmail: string;
  emailFrom: string;
  resendApiKey?: string;
  calendarUrl: string;
  signupPosition: number;
  referralCode: string;
  referralUrl: string;
  surveyToken: string;
  leadMagnetTitle?: string;
  leadMagnetSlug?: string;
  leadMagnetUrl?: string;
  deliveryKeySuffix?: string;
  downloadUrl?: string;
  sourcePage: string;
  e2eMode?: boolean;
  localOutbox?: ApiEnv["LOCAL_OUTBOX"];
}

type SignupRow = {
  id: number;
  email: string;
  sourcePage: string;
  createdAt: string;
  referralCode: string;
  surveyToken: string;
  emailSentAt: string | null;
  queuePosition: number | null;
  leadMagnetTitle: string | null;
  leadMagnetUrl: string | null;
  unsubscribedAt: string | null;
};

function chooseSignupVariant(
  rows: SignupRow[],
  requestedEmail: string,
): SignupRow | undefined {
  const requestedLower = requestedEmail.toLowerCase();
  return [...rows].sort((a, b) => {
    const aSuppressed = a.unsubscribedAt === null ? 1 : 0;
    const bSuppressed = b.unsubscribedAt === null ? 1 : 0;
    if (aSuppressed !== bSuppressed) {
      return aSuppressed - bSuppressed;
    }

    const aExact = a.email === requestedLower ? 0 : 1;
    const bExact = b.email === requestedLower ? 0 : 1;
    if (aExact !== bExact) {
      return aExact - bExact;
    }

    return a.id - b.id;
  })[0];
}

function buildSignupDeliveryKey(
  params: EmailParams,
  leadMagnet: { url: string } | null,
): string {
  if (leadMagnet) {
    return [
      `signup-lead-magnet:${params.surveyToken}:${leadMagnet.url}`,
      params.deliveryKeySuffix,
    ]
      .filter(Boolean)
      .join(":");
  }

  return `signup-confirmation:${params.surveyToken}`;
}

async function sendSignupEmail(params: EmailParams): Promise<void> {
  const leadMagnet = resolveSignupLeadMagnet(params);
  const base = {
    productName: params.productName,
    domain: params.domain,
    logoUrl: params.logoUrl,
    brandColor: params.brandColor,
    accentColor: params.accentColor,
    recipientEmail: params.recipientEmail,
    emailFrom: params.emailFrom,
    resendApiKey: params.resendApiKey,
    calendarUrl: params.calendarUrl,
    signupPosition: params.signupPosition,
    referralCode: params.referralCode,
    referralUrl: params.referralUrl,
    surveyToken: params.surveyToken,
    e2eMode: params.e2eMode,
    localOutbox: params.localOutbox,
    deliveryKey: buildSignupDeliveryKey(params, leadMagnet),
  };

  if (leadMagnet) {
    // When no slug was provided we have no tokenized download URL to send,
    // so fall back to the web page URL as the download target. The template
    // still renders (both CTAs just point at the same URL in that case).
    await sendLeadMagnetDelivery({
      ...base,
      leadMagnetTitle: leadMagnet.title,
      leadMagnetUrl: leadMagnet.url,
      downloadUrl: params.downloadUrl ?? leadMagnet.url,
      leadMagnetSlug: params.leadMagnetSlug ?? "",
    });
    return;
  }

  await sendConfirmation(base);
}

async function claimSignupRetryEmail(
  db: DrizzleD1Database,
  email: string,
  claimedAt: string,
) {
  const claimedRows = await db
    .update(signups)
    .set({ emailSendClaimedAt: claimedAt })
    .where(
      and(
        eq(signups.email, email),
        isNull(signups.emailSentAt),
        isNull(signups.emailSendClaimedAt),
      ),
    )
    .returning({ id: signups.id });

  return claimedRows.length > 0;
}

async function releaseSignupRetryEmailClaim(
  db: DrizzleD1Database,
  email: string,
  claimedAt: string,
) {
  await db
    .update(signups)
    .set({ emailSendClaimedAt: null })
    .where(
      and(
        eq(signups.email, email),
        eq(signups.emailSendClaimedAt, claimedAt),
      ),
    );
}

async function claimLeadMagnetRetryEmail(
  db: DrizzleD1Database,
  downloadToken: string,
  claimedAt: string,
) {
  const claimedRows = await db
    .update(leadMagnetDownloads)
    .set({ emailSendClaimedAt: claimedAt })
    .where(
      and(
        eq(leadMagnetDownloads.downloadToken, downloadToken),
        isNull(leadMagnetDownloads.emailSentAt),
        isNull(leadMagnetDownloads.emailSendClaimedAt),
      ),
    )
    .returning({ id: leadMagnetDownloads.id });

  return claimedRows.length > 0;
}

async function releaseLeadMagnetRetryEmailClaim(
  db: DrizzleD1Database,
  downloadToken: string,
  claimedAt: string,
) {
  await db
    .update(leadMagnetDownloads)
    .set({ emailSendClaimedAt: null })
    .where(
      and(
        eq(leadMagnetDownloads.downloadToken, downloadToken),
        eq(leadMagnetDownloads.emailSendClaimedAt, claimedAt),
      ),
    );
}

async function enrollSignupSequences(
  env: ApiEnv,
  input: {
    email: string;
    signupId: number;
    sourcePage: string;
    leadMagnetSlug?: string;
    leadMagnetTitle?: string | null;
  },
): Promise<{ attempted: number; enrolled: number }> {
  const metadata = {
    signupId: input.signupId,
    sourcePage: input.sourcePage,
    leadMagnetSlug: input.leadMagnetSlug ?? null,
    leadMagnetTitle: input.leadMagnetTitle ?? null,
  };
  let attempted = 0;
  let enrolled = 0;

  if (!input.leadMagnetSlug) {
    attempted++;
    const welcomeEnrolled = await enrollSequencerSequence(env, {
      email: input.email,
      sequenceSlug: "kaiplan-fulfillment-welcome",
      externalId: `${input.signupId}:fulfillment-welcome`,
      metadata,
    });
    if (welcomeEnrolled) enrolled++;
  }

  const nurtureSequenceSlug = input.leadMagnetSlug
    ? (leadMagnetMetadata[input.leadMagnetSlug]?.nurtureSequenceId ??
      "kaiplan-nurture-value-1")
    : "kaiplan-nurture-value-1";

  attempted++;
  const nurtureEnrolled = await enrollSequencerSequence(env, {
    email: input.email,
    sequenceSlug: nurtureSequenceSlug,
    externalId: `${input.signupId}:${input.leadMagnetSlug ?? "signup"}`,
    metadata,
  });
  if (nurtureEnrolled) enrolled++;

  return { attempted, enrolled };
}

function reportSkippedSequencerEnrollment(
  enrollment: { attempted: number; enrolled: number },
  context: { source: string; signupId: number },
): void {
  if (enrollment.attempted === 0 || enrollment.enrolled > 0) {
    return;
  }

  const error = new Error("Sequencer enrollment skipped.");
  console.warn("[signup] Sequencer enrollment skipped.", {
    source: context.source,
    signupId: context.signupId,
  });
  captureMarketingApiException(error, {
    source: "signup-sequencer-skipped",
    route: context.source,
  });
}

async function enrollSignupSequencesSafely(
  env: ApiEnv,
  input: {
    email: string;
    signupId: number;
    sourcePage: string;
    leadMagnetSlug?: string;
    leadMagnetTitle?: string | null;
  },
  context: { source: string; signupId: number },
): Promise<void> {
  try {
    const sequencerEnrollment = await enrollSignupSequences(env, input);
    reportSkippedSequencerEnrollment(sequencerEnrollment, context);
  } catch (err) {
    console.warn("[signup] Sequencer enrollment failed.", {
      source: context.source,
      signupId: context.signupId,
    });
    captureMarketingApiException(err, {
      source: "signup-sequencer-failed",
      route: context.source,
    });
  }
}

export function signupRoute() {
  const route = new Hono<{
    Bindings: ApiEnv;
    Variables: { db: DrizzleD1Database };
  }>();
  class SignupRowNotFoundError extends Error {}

  async function getNextSignupPosition(
    tx: Pick<DrizzleD1Database, "select">,
  ): Promise<number> {
    const [positionResult] = await tx
      .select({
        maxQueuePosition: sql<number>`coalesce(max(${signups.queuePosition}), 0)`,
      })
      .from(signups)
      .where(sql`${signups.queuePosition} > 0`);

    return Number(positionResult?.maxQueuePosition ?? 0) + 1;
  }

  route.post("/", async (c) => {
    const rawBody = await c.req.json().catch(() => null);
    if (!isJsonObject(rawBody)) {
      return c.json({ error: "email and sourcePage required" }, 400);
    }

    if (isHoneypotTripped(rawBody)) {
      return c.json({ success: true }, 200);
    }

    const parsed = signupBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({ error: "Invalid request body" }, 400);
    }

    const guard = await guardPublicForm(rawBody, c.env);
    if (guard.outcome === "reject") {
      return c.json({ error: "Verification failed." }, 403);
    }

    const body = parsed.data;

    if (!consumeIdentifierToken("signup-email", body.email)) {
      return c.json({ error: "Too many requests" }, 429);
    }

    const db = c.get("db");
    const env = c.env;
    const e2eMode = isMarketingE2EAllowed(env);
    const referralCode = generateReferralCode();
    const surveyToken = generateSurveyToken();
    const resolvedLeadMagnet = resolveLeadMagnetUrl(
      body.sourcePage,
      env.PRODUCT_DOMAIN,
      body.leadMagnetTitle,
      body.leadMagnetSlug,
    );

    let signupResult: {
      row: SignupRow;
      isNewSignup: boolean;
      isNewLeadMagnetDownload: boolean;
      downloadEmailSentAt: string | null;
      position: number;
      downloadToken: string | null;
    };

    try {
      signupResult = await db.transaction(async (tx) => {
        const [existingSignup] = await tx
          .select({ id: signups.id })
          .from(signups)
          .where(sql`lower(${signups.email}) = ${body.email}`);

        const insertedSignups = existingSignup
          ? []
          : await tx
              .insert(signups)
              .values({
                email: body.email,
                sourcePage: body.sourcePage,
                utmSource: body.utmSource ?? null,
                utmMedium: body.utmMedium ?? null,
                utmCampaign: body.utmCampaign ?? null,
                referralCode,
                surveyToken,
                referredBy: body.referredBy ?? null,
                leadMagnetTitle: resolvedLeadMagnet?.title ?? null,
                leadMagnetUrl: resolvedLeadMagnet?.url ?? null,
                createdAt: new Date().toISOString(),
              })
              .onConflictDoNothing({ target: signups.email })
              .returning({ id: signups.id });

        const signupRows = await tx
          .select({
            id: signups.id,
            email: signups.email,
            sourcePage: signups.sourcePage,
            createdAt: signups.createdAt,
            referralCode: signups.referralCode,
            surveyToken: signups.surveyToken,
            emailSentAt: signups.emailSentAt,
            queuePosition: signups.queuePosition,
            leadMagnetTitle: signups.leadMagnetTitle,
            leadMagnetUrl: signups.leadMagnetUrl,
            unsubscribedAt: signups.unsubscribedAt,
          })
          .from(signups)
          .where(sql`lower(${signups.email}) = ${body.email}`);
        const row = chooseSignupVariant(signupRows, body.email);

        if (!row) {
          throw new SignupRowNotFoundError("Signup row not found");
        }

        const rowEmail = row.email ?? body.email;
        const isNewSignup = insertedSignups.length > 0;
        const position =
          row.queuePosition && row.queuePosition > 0
            ? row.queuePosition
            : await getNextSignupPosition(tx);
        const storedLeadMagnet =
          row.leadMagnetTitle && row.leadMagnetUrl
            ? {
                title: row.leadMagnetTitle,
                url: row.leadMagnetUrl,
              }
            : null;
        const leadMagnet = resolvedLeadMagnet ?? storedLeadMagnet;
        if (isNewSignup) {
          await tx
            .update(signups)
            .set({
              queuePosition: position,
              leadMagnetTitle: leadMagnet?.title ?? null,
              leadMagnetUrl: leadMagnet?.url ?? null,
            })
            .where(eq(signups.email, rowEmail));
        }

        if (isNewSignup && body.referredBy) {
          try {
            const [referrer] = await tx
              .select({ email: signups.email })
              .from(signups)
              .where(eq(signups.referralCode, body.referredBy));

            if (
              typeof referrer?.email === "string" &&
              referrer.email.length > 0
            ) {
              await tx
                .insert(referrals)
                .values({
                  referrerEmail: referrer.email,
                  referralCode: body.referredBy,
                  referredEmail: rowEmail,
                  createdAt: new Date().toISOString(),
                })
                .onConflictDoNothing();
            }
          } catch (error) {
            console.error("[signup] referral tracking failed:", error);
            captureMarketingApiException(error, {
              source: "signup-referral-tracking",
            });
          }
        }

        let downloadToken: string | null = null;
        let downloadEmailSentAt: string | null = null;
        let isNewLeadMagnetDownload = false;
        const downloadableLeadMagnetSlug = resolvedLeadMagnet
          ? body.leadMagnetSlug
          : null;
        if (downloadableLeadMagnetSlug) {
          const slug = downloadableLeadMagnetSlug;
          const nowDate = new Date();
          const nowIso = nowDate.toISOString();
          const candidateToken = generateDownloadToken();
          const expiresAt = addDays(
            nowDate,
            DOWNLOAD_TOKEN_TTL_DAYS,
          ).toISOString();

          const insertedDownloads = await tx
            .insert(leadMagnetDownloads)
            .values({
              signupEmail: rowEmail,
              leadMagnetSlug: slug,
              downloadToken: candidateToken,
              expiresAt,
              downloadCount: 0,
              createdAt: nowIso,
            })
            .onConflictDoNothing({
              target: [
                leadMagnetDownloads.signupEmail,
                leadMagnetDownloads.leadMagnetSlug,
              ],
            })
            .returning({ downloadToken: leadMagnetDownloads.downloadToken });
          isNewLeadMagnetDownload = insertedDownloads.length > 0;

          const [existingDownload] = await tx
            .select({
              id: leadMagnetDownloads.id,
              downloadToken: leadMagnetDownloads.downloadToken,
              expiresAt: leadMagnetDownloads.expiresAt,
              emailSentAt: leadMagnetDownloads.emailSentAt,
            })
            .from(leadMagnetDownloads)
            .where(
              and(
                eq(leadMagnetDownloads.signupEmail, rowEmail),
                eq(leadMagnetDownloads.leadMagnetSlug, slug),
              ),
            );

          if (
            existingDownload &&
            new Date(existingDownload.expiresAt).getTime() <= nowDate.getTime()
          ) {
            const [rotatedDownload] = await tx
              .update(leadMagnetDownloads)
              .set({
                downloadToken: candidateToken,
                expiresAt,
                downloadedAt: null,
                emailSentAt: null,
                emailSendClaimedAt: null,
                downloadCount: 0,
              })
              .where(
                and(
                  eq(leadMagnetDownloads.id, existingDownload.id),
                  eq(leadMagnetDownloads.expiresAt, existingDownload.expiresAt),
                ),
              )
              .returning({
                downloadToken: leadMagnetDownloads.downloadToken,
                emailSentAt: leadMagnetDownloads.emailSentAt,
              });
            if (rotatedDownload) {
              downloadToken = rotatedDownload.downloadToken;
              downloadEmailSentAt = rotatedDownload.emailSentAt;
              isNewLeadMagnetDownload = true;
            } else {
              const [currentDownload] = await tx
                .select({
                  downloadToken: leadMagnetDownloads.downloadToken,
                  emailSentAt: leadMagnetDownloads.emailSentAt,
                })
                .from(leadMagnetDownloads)
                .where(
                  and(
                    eq(leadMagnetDownloads.signupEmail, rowEmail),
                    eq(leadMagnetDownloads.leadMagnetSlug, slug),
                  ),
                );
              downloadToken = currentDownload?.downloadToken ?? null;
              downloadEmailSentAt = currentDownload?.emailSentAt ?? null;
            }
          } else {
            downloadToken = existingDownload?.downloadToken ?? candidateToken;
            downloadEmailSentAt = existingDownload?.emailSentAt ?? null;
          }
        }

        return {
          row: {
            ...row,
            email: rowEmail,
            sourcePage: row.sourcePage,
            queuePosition: position,
            leadMagnetTitle: leadMagnet?.title ?? null,
            leadMagnetUrl: leadMagnet?.url ?? null,
          },
          isNewSignup,
          isNewLeadMagnetDownload,
          downloadEmailSentAt,
          position,
          downloadToken,
        };
      });
    } catch (err) {
      if (err instanceof SignupRowNotFoundError) {
        return c.json({ error: "Not found" }, 404);
      }
      console.error("[signup] transaction failed:", err);
      captureMarketingApiException(err, { source: "signup-transaction" });
      return c.json({ error: "Failed to create signup" }, 500);
    }

    const {
      row,
      isNewSignup,
      isNewLeadMagnetDownload,
      downloadEmailSentAt,
      position,
      downloadToken,
    } = signupResult;
    const emailReferralCode = row.referralCode ?? referralCode;
    const emailSurveyToken = row.surveyToken ?? surveyToken;
    const canEnrollMarketingSequences = row.unsubscribedAt == null;
    const canSendMarketingEmail = row.unsubscribedAt == null;
    const responseDownloadToken =
      resolvedLeadMagnet && body.leadMagnetSlug && isNewLeadMagnetDownload
        ? downloadToken
        : null;
    const downloadUrl = downloadToken
      ? `https://${env.PRODUCT_DOMAIN}/api/lead-magnets/download?token=${downloadToken}`
      : undefined;
    const isLeadMagnetRequest = Boolean(
      resolvedLeadMagnet && body.leadMagnetSlug,
    );
    const shouldRetryConfirmation =
      !isNewSignup &&
      !isNewLeadMagnetDownload &&
      !isLeadMagnetRequest &&
      row.emailSentAt === null;
    const shouldRetryLeadMagnetDelivery =
      !isNewSignup &&
      !isNewLeadMagnetDownload &&
      isLeadMagnetRequest &&
      downloadEmailSentAt === null;

    if (!isNewSignup && !isNewLeadMagnetDownload) {
      if (
        canSendMarketingEmail &&
        (shouldRetryConfirmation || shouldRetryLeadMagnetDelivery)
      ) {
        const referralUrl = `https://${env.PRODUCT_DOMAIN}/?ref=${emailReferralCode}`;
        const retryClaimedAt = new Date().toISOString();
        const retryClaimed = shouldRetryLeadMagnetDelivery
          ? downloadToken
            ? await claimLeadMagnetRetryEmail(db, downloadToken, retryClaimedAt)
            : false
          : await claimSignupRetryEmail(db, row.email, retryClaimedAt);

        if (retryClaimed) {
          let retryEmailSent = false;
          try {
            await sendSignupEmail({
              productName: env.PRODUCT_NAME,
              domain: env.PRODUCT_DOMAIN,
              logoUrl: env.PRODUCT_LOGO_URL,
              brandColor: env.PRODUCT_BRAND_COLOR,
              accentColor: env.PRODUCT_ACCENT_COLOR,
              recipientEmail: row.email,
              emailFrom: env.EMAIL_FROM,
              resendApiKey: env.RESEND_API_KEY,
              calendarUrl: env.CALENDAR_URL,
              signupPosition: position,
              referralCode: emailReferralCode,
              referralUrl,
              surveyToken: emailSurveyToken,
              leadMagnetTitle:
                resolvedLeadMagnet?.title ?? row.leadMagnetTitle ?? undefined,
              leadMagnetUrl:
                resolvedLeadMagnet?.url ?? row.leadMagnetUrl ?? undefined,
              leadMagnetSlug: body.leadMagnetSlug,
              deliveryKeySuffix: downloadToken
                ? `download:${downloadToken}`
                : undefined,
              downloadUrl,
              sourcePage: body.sourcePage,
              e2eMode,
              localOutbox: env.LOCAL_OUTBOX,
            });
            retryEmailSent = true;

            const sentAt = new Date().toISOString();
            await db
              .update(signups)
              .set({
                emailSentAt: sentAt,
                emailSendClaimedAt: null,
                ...(resolvedLeadMagnet
                  ? {
                      leadMagnetTitle: resolvedLeadMagnet.title,
                      leadMagnetUrl: resolvedLeadMagnet.url,
                    }
                  : {}),
              })
              .where(eq(signups.email, row.email));

            if (resolvedLeadMagnet && downloadToken) {
              await db
                .update(leadMagnetDownloads)
                .set({ emailSentAt: sentAt, emailSendClaimedAt: null })
                .where(eq(leadMagnetDownloads.downloadToken, downloadToken));
            }

            if (
              canEnrollMarketingSequences &&
              (shouldRetryConfirmation || shouldRetryLeadMagnetDelivery)
            ) {
              const enrollmentPromise = enrollSignupSequencesSafely(
                env,
                {
                  email: row.email,
                  signupId: row.id,
                  sourcePage: body.sourcePage,
                  leadMagnetSlug: resolvedLeadMagnet
                    ? body.leadMagnetSlug
                    : undefined,
                  leadMagnetTitle:
                    resolvedLeadMagnet?.title ?? row.leadMagnetTitle,
                },
                {
                  source: shouldRetryConfirmation
                    ? "signup-retry-email"
                    : "lead-magnet-retry-email",
                  signupId: row.id,
                },
              );
              scheduleBackgroundTask(c, enrollmentPromise);
            }

            if (shouldRetryConfirmation) {
              if (canEnrollMarketingSequences) {
                const apolloPromise = addToProductList(
                  row.email,
                  env.PRODUCT_NAME,
                  env.APOLLO_API_KEY,
                  {
                    e2eMode,
                    localOutbox: env.LOCAL_OUTBOX,
                  },
                ).catch((apolloError: unknown) => {
                  console.error(
                    "[signup] Apollo retry failed (non-fatal):",
                    apolloError,
                  );
                  captureMarketingApiException(apolloError, {
                    source: "signup-retry-apollo",
                  });
                });

                scheduleBackgroundTask(c, apolloPromise);
              }
            }
          } catch (err) {
            if (!retryEmailSent) {
              if (shouldRetryLeadMagnetDelivery && downloadToken) {
                await releaseLeadMagnetRetryEmailClaim(
                  db,
                  downloadToken,
                  retryClaimedAt,
                );
              } else {
                await releaseSignupRetryEmailClaim(
                  db,
                  row.email,
                  retryClaimedAt,
                );
              }
            }
            console.error("[signup] retry email send failed:", err);
            captureMarketingApiException(err, { source: "signup-retry-email" });
            return c.json({ error: "Failed to send confirmation email" }, 500);
          }
        }
      }

      return c.json({
        success: true,
        position,
        surveyAvailable: false,
        ...(responseDownloadToken
          ? { downloadToken: responseDownloadToken }
          : {}),
      });
    }

    const referralUrl = `https://${env.PRODUCT_DOMAIN}/?ref=${emailReferralCode}`;

    if (canSendMarketingEmail) {
      try {
        await sendSignupEmail({
          productName: env.PRODUCT_NAME,
          domain: env.PRODUCT_DOMAIN,
          logoUrl: env.PRODUCT_LOGO_URL,
          brandColor: env.PRODUCT_BRAND_COLOR,
          accentColor: env.PRODUCT_ACCENT_COLOR,
          recipientEmail: row.email,
          emailFrom: env.EMAIL_FROM,
          resendApiKey: env.RESEND_API_KEY,
          calendarUrl: env.CALENDAR_URL,
          signupPosition: position,
          referralCode: emailReferralCode,
          referralUrl,
          surveyToken: emailSurveyToken,
          leadMagnetTitle:
            resolvedLeadMagnet?.title ?? row.leadMagnetTitle ?? undefined,
          leadMagnetUrl:
            resolvedLeadMagnet?.url ?? row.leadMagnetUrl ?? undefined,
          leadMagnetSlug: body.leadMagnetSlug,
          deliveryKeySuffix: downloadToken
            ? `download:${downloadToken}`
            : undefined,
          downloadUrl,
          sourcePage: body.sourcePage,
          e2eMode,
          localOutbox: env.LOCAL_OUTBOX,
        });
        const sentAt = new Date().toISOString();
        if (isNewSignup) {
          await db
            .update(signups)
            .set({ emailSentAt: sentAt })
            .where(eq(signups.email, row.email));
          if (resolvedLeadMagnet && downloadToken) {
            await db
              .update(leadMagnetDownloads)
              .set({ emailSentAt: sentAt, emailSendClaimedAt: null })
              .where(eq(leadMagnetDownloads.downloadToken, downloadToken));
          }
          if (canEnrollMarketingSequences) {
            const enrollmentPromise = enrollSignupSequencesSafely(
              env,
              {
                email: row.email,
                signupId: row.id,
                sourcePage: body.sourcePage,
                leadMagnetSlug: resolvedLeadMagnet
                  ? body.leadMagnetSlug
                  : undefined,
                leadMagnetTitle:
                  resolvedLeadMagnet?.title ?? row.leadMagnetTitle,
              },
              {
                source: "signup-email",
                signupId: row.id,
              },
            );
            scheduleBackgroundTask(c, enrollmentPromise);
          }
        } else if (resolvedLeadMagnet) {
          await db
            .update(signups)
            .set({
              leadMagnetTitle: resolvedLeadMagnet.title,
              leadMagnetUrl: resolvedLeadMagnet.url,
            })
            .where(eq(signups.email, row.email));
          if (downloadToken) {
            await db
              .update(leadMagnetDownloads)
              .set({ emailSentAt: sentAt, emailSendClaimedAt: null })
              .where(eq(leadMagnetDownloads.downloadToken, downloadToken));
          }
          if (isNewLeadMagnetDownload && canEnrollMarketingSequences) {
            const enrollmentPromise = enrollSignupSequencesSafely(
              env,
              {
                email: row.email,
                signupId: row.id,
                sourcePage: body.sourcePage,
                leadMagnetSlug: body.leadMagnetSlug,
                leadMagnetTitle: resolvedLeadMagnet.title,
              },
              {
                source: "signup-lead-magnet",
                signupId: row.id,
              },
            );
            scheduleBackgroundTask(c, enrollmentPromise);
          }
        }
      } catch (err) {
        console.error("[signup] email send failed:", err);
        captureMarketingApiException(err, { source: "signup-email" });
        return c.json({ error: "Failed to send confirmation email" }, 500);
      }
    }

    if (isNewSignup) {
      const apolloPromise = addToProductList(
        body.email,
        env.PRODUCT_NAME,
        env.APOLLO_API_KEY,
        {
          e2eMode,
          localOutbox: env.LOCAL_OUTBOX,
        },
      ).catch((err: unknown) => {
        console.error("[signup] Apollo failed (non-fatal):", err);
        captureMarketingApiException(err, { source: "signup-apollo" });
      });

      scheduleBackgroundTask(c, apolloPromise);
    }

    if (!isNewSignup) {
      return c.json({
        success: true,
        position,
        surveyAvailable: false,
        ...(responseDownloadToken
          ? { downloadToken: responseDownloadToken }
          : {}),
      });
    }

    return c.json({
      success: true,
      referralCode: emailReferralCode,
      position,
      surveyToken: emailSurveyToken,
      surveyAvailable: true,
      ...(downloadToken ? { downloadToken } : {}),
    });
  });

  return route;
}
