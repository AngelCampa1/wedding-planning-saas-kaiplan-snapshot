import type {
  EmailPreferences,
  InviteMemberDeliveryMetadata,
  ManualRsvpReminderResult,
} from "@kaiplan/shared";
import { EMAIL_PREFERENCE_TYPES } from "@kaiplan/shared";
import { webcrypto } from "node:crypto";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { and, eq, inArray, isNull, lt, ne } from "drizzle-orm";
import { guest, wedding, weddingWebsite } from "../db/schema";
import {
  emailPreference,
  emailSendLog,
  emailUnsubscribeToken,
} from "../db/marketing-schema";
import type { Database } from "../db/client";
import type { MarketingDatabase } from "../db/marketing-client";
import {
  MemberInviteEmail,
  PasswordResetEmail,
  RsvpConfirmationEmail,
  RsvpReminderEmail,
  TrialEndingReminderEmail,
  TrialActivationNudgeEmail,
  SubscribeNudgeEmail,
  EmailVerificationEmail,
  rsvpLabel,
} from "./email-templates";

type EmailPreferencesTokenPayload = {
  kid: string;
  tokenId: string;
  email: string;
  weddingId: string | null;
  allowedTypes: Array<keyof EmailPreferences>;
  expiresAt: string;
};

type MemberInviteTokenPayload = {
  kid: string;
  memberId: string;
  weddingId: string;
  email: string;
  role: "editor" | "viewer";
  expiresAt: string;
};

const cryptoImpl = webcrypto;

function isEmailPreferenceType(value: unknown): value is keyof EmailPreferences {
  return (
    typeof value === "string" &&
    (EMAIL_PREFERENCE_TYPES as readonly string[]).includes(value)
  );
}

function parseEmailPreferencesTokenPayload(
  encodedPayload: string,
): EmailPreferencesTokenPayload {
  let payload: unknown;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    throw new Error("Invalid email preferences token.");
  }

  if (
    payload === null ||
    typeof payload !== "object" ||
    ((payload as EmailPreferencesTokenPayload).kid !== undefined &&
      (payload as EmailPreferencesTokenPayload).kid !== "v1") ||
    typeof (payload as EmailPreferencesTokenPayload).tokenId !== "string" ||
    typeof (payload as EmailPreferencesTokenPayload).email !== "string" ||
    ((payload as EmailPreferencesTokenPayload).weddingId !== null &&
      typeof (payload as EmailPreferencesTokenPayload).weddingId !==
        "string") ||
    !Array.isArray((payload as EmailPreferencesTokenPayload).allowedTypes) ||
    !(payload as EmailPreferencesTokenPayload).allowedTypes.every(
      isEmailPreferenceType,
    ) ||
    typeof (payload as EmailPreferencesTokenPayload).expiresAt !== "string"
  ) {
    throw new Error("Invalid email preferences token.");
  }

  return payload as EmailPreferencesTokenPayload;
}

export type SendPasswordResetInput = {
  user: { email: string; name?: string | null };
  url: string;
  token: string;
};

export type SendEmailVerificationInput = {
  user: { email: string; name?: string | null };
  url: string;
  token: string;
};

export type SendMemberInviteInput = {
  email: string;
  role: "editor" | "viewer";
  weddingId: string;
  memberId: string;
  invitedBy: { email: string; name: string };
};

export type SendRsvpConfirmationInput = {
  weddingId: string;
  primaryGuestId: string;
  guestEmail: string;
  token: string;
};

export type SendRsvpReminderInput = {
  weddingId: string;
  primaryGuestId: string;
  guestEmail: string | null;
  token: string | null;
};

export type SendFeedbackInput = {
  message: string;
  email?: string;
  pageUrl?: string;
};

export type SendTrialEndingReminderInput = {
  email: string;
  name: string;
  planName: string;
  trialStartedOn: string;
  chargeOn: string;
  amountLabel: string;
  manageBillingUrl: string;
};

export type SendSubscribeNudgeInput = {
  email: string;
  name: string;
  stepKey: string;
  subjectFocus: string;
  body: string;
  ctaLabel: string;
  subscribeUrl: string;
  manageEmailPrefsUrl: string;
};

export type SendTrialActivationNudgeInput = {
  email: string;
  name: string;
  stepKey: string;
  featureFocus: string;
  body: string;
  ctaLabel: string;
  dashboardUrl: string;
  manageEmailPrefsUrl: string;
};

export type EmailService = {
  sendPasswordReset(input: SendPasswordResetInput): Promise<void>;
  sendEmailVerification(input: SendEmailVerificationInput): Promise<void>;
  sendMemberInvite(
    input: SendMemberInviteInput,
  ): Promise<InviteMemberDeliveryMetadata>;
  sendRsvpConfirmation(input: SendRsvpConfirmationInput): Promise<void>;
  sendRsvpReminder(
    input: SendRsvpReminderInput,
  ): Promise<ManualRsvpReminderResult>;
  sendFeedback(input: SendFeedbackInput): Promise<void>;
  sendTrialEndingReminder(input: SendTrialEndingReminderInput): Promise<void>;
  sendSubscribeNudge(input: SendSubscribeNudgeInput): Promise<void>;
  sendTrialActivationNudge(input: SendTrialActivationNudgeInput): Promise<void>;
};

export async function cleanupOldEmailOperationalData(
  db: Pick<MarketingDatabase, "delete" | "select">,
): Promise<void> {
  const oldTokenIds = await db
    .select({ id: emailUnsubscribeToken.id })
    .from(emailUnsubscribeToken)
    .where(lt(emailUnsubscribeToken.expiresAt, new Date().toISOString()))
    .limit(1000);

  if (oldTokenIds.length > 0) {
    await db.delete(emailUnsubscribeToken).where(
      inArray(
        emailUnsubscribeToken.id,
        oldTokenIds.map((row) => row.id),
      ),
    );
  }
}

type EmailServiceEnv = {
  APP_URL: string;
  BETTER_AUTH_URL?: string;
  PUBLIC_WEB_URL?: string;
  EMAIL_FROM_ADDRESS: string;
  EMAIL_REPLY_TO_ADDRESS?: string;
  EMAIL_TOKEN_SECRET: string;
  RESEND_API_KEY?: string;
  FEEDBACK_RECIPIENT_EMAIL?: string;
};

type ResendClient = {
  emails: {
    send(input: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      replyTo?: string;
      headers?: Record<string, string>;
    }): Promise<{
      data?: { id?: string | null } | null;
      error?: { message?: string | null } | null;
    }>;
  };
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * M6: Strip carriage-return and newline characters from email header values to
 * prevent header injection attacks. `\r` and `\n` are replaced with a space.
 */
export function stripHeaderCRLF(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
}

async function signValue(value: string, secret: string) {
  const secretBytes = new TextEncoder().encode(secret);
  const secretBuffer = secretBytes.buffer.slice(
    secretBytes.byteOffset,
    secretBytes.byteOffset + secretBytes.byteLength,
  ) as ArrayBuffer;
  const valueBytes = new TextEncoder().encode(value);
  const valueBuffer = valueBytes.buffer.slice(
    valueBytes.byteOffset,
    valueBytes.byteOffset + valueBytes.byteLength,
  ) as ArrayBuffer;
  const key = await cryptoImpl.subtle.importKey(
    "raw",
    secretBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await cryptoImpl.subtle.sign("HMAC", key, valueBuffer);
  return Buffer.from(signature)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function getDefaultEmailPreferences(): EmailPreferences {
  return {
    appLifecycle: true,
    memberInvite: true,
    rsvpConfirmation: true,
    rsvpReminder: true,
  };
}

function normalizePreferenceEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildOneClickUnsubscribeUrl(
  managePrefsUrl: string,
  apiBaseUrl?: string,
) {
  try {
    const url = new URL(managePrefsUrl);
    const token = url.searchParams.get("token");
    if (!token) {
      return managePrefsUrl;
    }
    const baseUrl = apiBaseUrl ? new URL(apiBaseUrl) : url;
    const unsubscribeUrl = new URL(
      `/api/public/email/preferences/${encodeURIComponent(token)}`,
      `${baseUrl.protocol}//${baseUrl.host}`,
    );
    return unsubscribeUrl.toString();
  } catch {
    return managePrefsUrl;
  }
}

export async function signEmailPreferencesToken(
  payload: EmailPreferencesTokenPayload,
  secret: string,
) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

/**
 * Constant-time byte comparison to mitigate timing-based side-channel attacks.
 *
 * We encode both values to UTF-8 bytes and XOR every byte pair, accumulating
 * differences. The loop always runs over the full `expected` length so the
 * execution time does not reveal the position of the first mismatch.
 */
async function timingSafeEqual(
  expected: string,
  provided: string,
): Promise<boolean> {
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(provided);

  const maxLen = Math.max(a.length, b.length);
  let diff = a.length !== b.length ? 1 : 0;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

export async function verifyEmailPreferencesToken(
  token: string,
  secret: string,
): Promise<EmailPreferencesTokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid email preferences token.");
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    throw new Error("Invalid email preferences token.");
  }

  const expectedSignature = await signValue(encodedPayload, secret);
  const signaturesMatch = await timingSafeEqual(expectedSignature, signature);
  if (!signaturesMatch) {
    throw new Error("Invalid email preferences token.");
  }

  const payload = parseEmailPreferencesTokenPayload(encodedPayload);

  const expiresAt = new Date(payload.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Email preferences token has expired.");
  }

  return payload;
}

export async function signMemberInviteToken(
  payload: MemberInviteTokenPayload,
  secret: string,
) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await signValue(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyMemberInviteToken(
  token: string,
  secret: string,
): Promise<MemberInviteTokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid member invite token.");
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    throw new Error("Invalid member invite token.");
  }

  const expectedSignature = await signValue(encodedPayload, secret);
  const signaturesMatch = await timingSafeEqual(expectedSignature, signature);
  if (!signaturesMatch) {
    throw new Error("Invalid member invite token.");
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as unknown;

  if (
    payload === null ||
    typeof payload !== "object" ||
    (payload as MemberInviteTokenPayload).kid !== "member-invite-v1" ||
    typeof (payload as MemberInviteTokenPayload).memberId !== "string" ||
    typeof (payload as MemberInviteTokenPayload).weddingId !== "string" ||
    typeof (payload as MemberInviteTokenPayload).email !== "string" ||
    !["editor", "viewer"].includes(
      (payload as MemberInviteTokenPayload).role,
    ) ||
    typeof (payload as MemberInviteTokenPayload).expiresAt !== "string"
  ) {
    throw new Error("Invalid member invite token.");
  }

  const invitePayload = payload as MemberInviteTokenPayload;

  const expiresAt = new Date(invitePayload.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Member invite token has expired.");
  }

  return invitePayload;
}

async function loadPreferenceValue(
  db: MarketingDatabase,
  input: {
    email: string;
    weddingId: string | null;
    preferenceType: keyof EmailPreferences;
  },
) {
  const email = normalizePreferenceEmail(input.email);
  if (input.weddingId) {
    const weddingScoped = await db
      .select()
      .from(emailPreference)
      .where(
        and(
          eq(emailPreference.email, email),
          eq(emailPreference.weddingId, input.weddingId),
          eq(emailPreference.preferenceType, input.preferenceType),
        ),
      );

    const row = weddingScoped[0] as { enabled: boolean } | undefined;
    if (row) {
      return row.enabled;
    }
  }

  const globalRows = await db
    .select()
    .from(emailPreference)
    .where(
      and(
        eq(emailPreference.email, email),
        isNull(emailPreference.weddingId),
        eq(emailPreference.preferenceType, input.preferenceType),
      ),
    );

  const row = globalRows[0] as { enabled: boolean } | undefined;
  return row?.enabled ?? true;
}

export async function createManagePreferencesUrl(
  db: MarketingDatabase,
  env: EmailServiceEnv,
  input: {
    email: string;
    weddingId: string | null;
    allowedTypes: Array<keyof EmailPreferences>;
  },
) {
  const token = await createManagePreferencesToken(db, env, input);
  return token.url;
}

export async function createManagePreferencesToken(
  db: MarketingDatabase,
  env: EmailServiceEnv,
  input: {
    email: string;
    weddingId: string | null;
    allowedTypes: Array<keyof EmailPreferences>;
  },
) {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  const tokenId = cryptoImpl.randomUUID();
  const email = normalizePreferenceEmail(input.email);
  await db.insert(emailUnsubscribeToken).values({
    id: tokenId,
    email,
    weddingId: input.weddingId,
    allowedTypes: input.allowedTypes,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
  });

  const signedToken = await signEmailPreferencesToken(
    {
      kid: "v1",
      tokenId,
      email,
      weddingId: input.weddingId,
      allowedTypes: input.allowedTypes,
      expiresAt: expiresAt.toISOString(),
    },
    env.EMAIL_TOKEN_SECRET,
  );

  return {
    tokenId,
    email,
    weddingId: input.weddingId,
    url: `${env.APP_URL.replace(/\/$/, "")}/email-preferences?token=${encodeURIComponent(signedToken)}`,
  };
}

export async function deletePreviousManagePreferencesTokens(
  db: MarketingDatabase,
  input: {
    tokenId: string;
    email: string;
    weddingId: string | null;
  },
) {
  await db
    .delete(emailUnsubscribeToken)
    .where(
      and(
        eq(emailUnsubscribeToken.email, input.email),
        input.weddingId === null
          ? isNull(emailUnsubscribeToken.weddingId)
          : eq(emailUnsubscribeToken.weddingId, input.weddingId),
        isNull(emailUnsubscribeToken.usedAt),
        ne(emailUnsubscribeToken.id, input.tokenId),
      ),
    );
}

export async function deletePreviousManagePreferencesTokensSafely(
  db: MarketingDatabase,
  input: {
    tokenId: string;
    email: string;
    weddingId: string | null;
  },
) {
  try {
    await deletePreviousManagePreferencesTokens(db, input);
  } catch (error) {
    console.error("[email] preference token cleanup failed:", error);
  }
}

async function recordSend(
  db: MarketingDatabase,
  input: {
    email: string;
    weddingId: string | null;
    emailType: string;
    status: string;
    providerMessageId?: string | null;
    errorMessage?: string | null;
  },
) {
  await db.insert(emailSendLog).values({
    id: cryptoImpl.randomUUID(),
    email: input.email,
    weddingId: input.weddingId,
    emailType: input.emailType,
    status: input.status,
    providerMessageId: input.providerMessageId ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: new Date().toISOString(),
  });
}

async function sendMessage(
  client: ResendClient,
  env: EmailServiceEnv,
  input: {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
    managePrefsUrl?: string;
  },
) {
  // M7: Add List-Unsubscribe headers for Gmail bulk-sender compliance when a
  // manage-preferences URL is provided.
  const listUnsubscribeHeaders: Record<string, string> = input.managePrefsUrl
    ? {
        "List-Unsubscribe": `<${buildOneClickUnsubscribeUrl(
          input.managePrefsUrl,
          env.BETTER_AUTH_URL,
        )}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : {};

  const response = await client.emails.send({
    from: env.EMAIL_FROM_ADDRESS,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    replyTo: input.replyTo ?? env.EMAIL_REPLY_TO_ADDRESS,
    ...(Object.keys(listUnsubscribeHeaders).length > 0
      ? { headers: listUnsubscribeHeaders }
      : {}),
  });

  if (response.error) {
    throw new Error(response.error.message ?? "Email delivery failed.");
  }

  return response.data?.id ?? null;
}

async function logFailureAndRethrow(
  db: MarketingDatabase,
  input: {
    email: string;
    weddingId: string | null;
    emailType: string;
  },
  error: unknown,
): Promise<never> {
  const message =
    error instanceof Error ? error.message : "Email delivery failed.";

  await recordSend(db, {
    email: input.email,
    weddingId: input.weddingId,
    emailType: input.emailType,
    status: "failed",
    errorMessage: message,
  });

  throw error instanceof Error ? error : new Error(message);
}

export function createEmailService(
  db: Database,
  env: EmailServiceEnv,
  resendClient?: ResendClient,
  emailDb: MarketingDatabase = db as unknown as MarketingDatabase,
): EmailService {
  function getWebBaseUrl() {
    return (env.PUBLIC_WEB_URL ?? env.APP_URL).replace(/\/$/, "");
  }

  function getResendClient() {
    if (resendClient) {
      return resendClient;
    }

    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is required to send email.");
    }

    return new Resend(env.RESEND_API_KEY) as unknown as ResendClient;
  }

  return {
    async sendPasswordReset({ user, url }) {
      try {
        const html = await render(PasswordResetEmail({ resetUrl: url }));
        const emailId = await sendMessage(getResendClient(), env, {
          to: user.email,
          subject: "Reset your Kaiplan password",
          html,
        });
        await recordSend(emailDb, {
          email: user.email,
          weddingId: null,
          emailType: "passwordReset",
          status: "sent",
          providerMessageId: emailId,
        });
      } catch (error) {
        await logFailureAndRethrow(
          emailDb,
          {
            email: user.email,
            weddingId: null,
            emailType: "passwordReset",
          },
          error,
        );
      }
    },

    async sendEmailVerification({ user, url }) {
      try {
        const html = await render(
          EmailVerificationEmail({ verificationUrl: url }),
        );
        const emailId = await sendMessage(getResendClient(), env, {
          to: user.email,
          subject: "Verify your Kaiplan email",
          html,
        });
        await recordSend(emailDb, {
          email: user.email,
          weddingId: null,
          emailType: "emailVerification",
          status: "sent",
          providerMessageId: emailId,
        });
      } catch (error) {
        await logFailureAndRethrow(
          emailDb,
          {
            email: user.email,
            weddingId: null,
            emailType: "emailVerification",
          },
          error,
        );
      }
    },

    async sendSubscribeNudge(input) {
      try {
        const html = await render(
          SubscribeNudgeEmail({
            name: input.name,
            subjectFocus: input.subjectFocus,
            body: input.body,
            ctaLabel: input.ctaLabel,
            subscribeUrl: input.subscribeUrl,
            manageEmailPrefsUrl: input.manageEmailPrefsUrl,
          }),
        );
        const emailId = await sendMessage(getResendClient(), env, {
          to: input.email,
          subject: `Keep your ${input.subjectFocus} moving in Kaiplan`,
          html,
          managePrefsUrl: input.manageEmailPrefsUrl,
        });
        await recordSend(emailDb, {
          email: input.email,
          weddingId: null,
          emailType: input.stepKey,
          status: "sent",
          providerMessageId: emailId,
        });
      } catch (error) {
        await logFailureAndRethrow(
          emailDb,
          {
            email: input.email,
            weddingId: null,
            emailType: input.stepKey,
          },
          error,
        );
      }
    },

    async sendTrialActivationNudge(input) {
      try {
        const html = await render(
          TrialActivationNudgeEmail({
            name: input.name,
            featureFocus: input.featureFocus,
            body: input.body,
            ctaLabel: input.ctaLabel,
            dashboardUrl: input.dashboardUrl,
            manageEmailPrefsUrl: input.manageEmailPrefsUrl,
          }),
        );
        const emailId = await sendMessage(getResendClient(), env, {
          to: input.email,
          subject: `Try ${input.featureFocus} while your trial is open`,
          html,
          managePrefsUrl: input.manageEmailPrefsUrl,
        });
        await recordSend(emailDb, {
          email: input.email,
          weddingId: null,
          emailType: input.stepKey,
          status: "sent",
          providerMessageId: emailId,
        });
      } catch (error) {
        await logFailureAndRethrow(
          emailDb,
          {
            email: input.email,
            weddingId: null,
            emailType: input.stepKey,
          },
          error,
        );
      }
    },

    async sendMemberInvite(input) {
      const enabled = await loadPreferenceValue(emailDb, {
        email: input.email,
        weddingId: null,
        preferenceType: "memberInvite",
      });
      if (!enabled) {
        return {
          emailId: null,
          provider: "resend",
          status: "skipped",
          sentAt: null,
          templateKey: "member-invite",
          skipped: true,
          rateLimited: false,
          error: null,
        };
      }

      try {
        const weddingRows = await db
          .select({ name: wedding.name })
          .from(wedding)
          .where(eq(wedding.id, input.weddingId))
          .limit(1);
        // select().limit(1) on a known-valid weddingId always returns a row.
        const weddingRow = weddingRows[0]!;

        const inviteToken = await signMemberInviteToken(
          {
            kid: "member-invite-v1",
            memberId: input.memberId,
            weddingId: input.weddingId,
            email: input.email.toLowerCase(),
            role: input.role,
            expiresAt: new Date(
              Date.now() + 14 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
          env.EMAIL_TOKEN_SECRET,
        );
        const inviteUrl = `${env.APP_URL.replace(/\/$/, "")}/login?inviteToken=${encodeURIComponent(inviteToken)}`;
        const html = await render(
          MemberInviteEmail({
            invitedByName: input.invitedBy.name,
            weddingName: weddingRow.name,
            role: input.role,
            inviteUrl,
          }),
        );
        const emailId = await sendMessage(getResendClient(), env, {
          to: input.email,
          subject: `${input.invitedBy.name} invited you to ${weddingRow.name} on Kaiplan`,
          html,
        });
        await recordSend(emailDb, {
          email: input.email,
          weddingId: input.weddingId,
          emailType: "memberInvite",
          status: "sent",
          providerMessageId: emailId,
        });
        return {
          emailId,
          provider: "resend",
          status: "sent",
          sentAt: new Date().toISOString(),
          templateKey: "member-invite",
          skipped: false,
          rateLimited: false,
          error: null,
        };
      } catch (error) {
        return await logFailureAndRethrow(
          emailDb,
          {
            email: input.email,
            weddingId: input.weddingId,
            emailType: "memberInvite",
          },
          error,
        );
      }
    },

    async sendRsvpConfirmation(input) {
      const enabled = await loadPreferenceValue(emailDb, {
        email: input.guestEmail,
        weddingId: input.weddingId,
        preferenceType: "rsvpConfirmation",
      });
      if (!enabled) {
        return;
      }

      try {
        // 1. Load publishedSlug (nullable)
        const [websiteRow] = await db
          .select({ publishedSlug: weddingWebsite.publishedSlug })
          .from(weddingWebsite)
          .where(eq(weddingWebsite.weddingId, input.weddingId))
          .limit(1);

        const rsvpUrl = websiteRow?.publishedSlug
          ? `${getWebBaseUrl()}/w/${websiteRow.publishedSlug}?token=${input.token}#rsvp`
          : null;

        // 2. Load primary guest
        const primaryGuestRows = await db
          .select({
            firstName: guest.firstName,
            lastName: guest.lastName,
            rsvpStatus: guest.rsvpStatus,
          })
          .from(guest)
          .where(eq(guest.id, input.primaryGuestId))
          .limit(1);
        // select().limit(1) on a known-valid guestId always returns a row.
        const primaryGuest = primaryGuestRows[0]!;

        // 3. Load plus-ones
        const plusOnes = await db
          .select({
            firstName: guest.firstName,
            lastName: guest.lastName,
            rsvpStatus: guest.rsvpStatus,
          })
          .from(guest)
          .where(eq(guest.primaryGuestId, input.primaryGuestId));

        // 4. Load wedding name + date
        const weddingRowsForRsvp = await db
          .select({ name: wedding.name, date: wedding.date })
          .from(wedding)
          .where(eq(wedding.id, input.weddingId))
          .limit(1);
        // select().limit(1) on a known-valid weddingId always returns a row.
        const weddingRow = weddingRowsForRsvp[0]!;

        // 5. Build household summary
        const householdSummary = [
          {
            name: `${primaryGuest.firstName} ${primaryGuest.lastName}`,
            status: rsvpLabel(primaryGuest.rsvpStatus ?? "pending"),
          },
          ...plusOnes.map((po) => ({
            name: `${po.firstName} ${po.lastName}`,
            status: rsvpLabel(po.rsvpStatus ?? "pending"),
          })),
        ];

        const manageToken = await createManagePreferencesToken(emailDb, env, {
          email: input.guestEmail,
          weddingId: input.weddingId,
          allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        });
        const manageUrl = manageToken.url;

        const html = await render(
          RsvpConfirmationEmail({
            guestFirstName: primaryGuest.firstName,
            weddingName: weddingRow.name,
            weddingDate: weddingRow.date ?? null,
            householdSummary,
            rsvpUrl,
            manageUrl,
          }),
        );

        const emailId = await sendMessage(getResendClient(), env, {
          to: input.guestEmail,
          subject: `Your RSVP is confirmed — ${weddingRow.name}`,
          html,
          managePrefsUrl: manageUrl,
        });

        await deletePreviousManagePreferencesTokensSafely(emailDb, manageToken);

        await recordSend(emailDb, {
          email: input.guestEmail,
          weddingId: input.weddingId,
          emailType: "rsvpConfirmation",
          status: "sent",
          providerMessageId: emailId,
        });
      } catch (error) {
        await logFailureAndRethrow(
          emailDb,
          {
            email: input.guestEmail,
            weddingId: input.weddingId,
            emailType: "rsvpConfirmation",
          },
          error,
        );
      }
    },

    async sendFeedback({ message, email, pageUrl }) {
      // M6: strip CR/LF from header values to prevent header injection.
      // Do NOT HTML-escape the subject — that produces "&amp;" in the visible
      // subject line; stripping CR/LF is the correct defence here.
      const subject = `[Kaiplan feedback] ${stripHeaderCRLF(message.slice(0, 60))}`;
      const submitterEmail = email ? stripHeaderCRLF(email) : undefined;
      const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
      const safeEmail = submitterEmail ? escapeHtml(submitterEmail) : undefined;
      const safePageUrl = pageUrl ? escapeHtml(pageUrl) : undefined;
      const html = `
<p><strong>Message:</strong></p>
<p>${safeMessage}</p>
<p><strong>Submitted by:</strong> ${safeEmail ?? "not provided"}</p>
<p><strong>Page:</strong> ${safePageUrl ?? "not provided"}</p>
      `.trim();

      const to = env.FEEDBACK_RECIPIENT_EMAIL;
      if (!to) {
        throw new Error("FEEDBACK_RECIPIENT_EMAIL is not configured.");
      }

      const response = await getResendClient().emails.send({
        from: env.EMAIL_FROM_ADDRESS,
        to: [to],
        subject,
        html,
        ...(submitterEmail ? { replyTo: submitterEmail } : {}),
      });

      if (response.error) {
        throw new Error(response.error.message ?? "Email delivery failed.");
      }
    },

    async sendTrialEndingReminder(input) {
      try {
        // Trial reminder recipients are signed-in users, so the
        // /settings page already gates email preferences behind their
        // existing account auth — no separate signed-token URL needed.
        // This mirrors the `manageBillingUrl` already constructed in
        // `billing.ts` (same APP_URL, same /settings path).
        const manageEmailPrefsUrl = `${env.APP_URL.replace(/\/$/, "")}/settings`;
        const html = await render(
          TrialEndingReminderEmail({
            name: input.name,
            planName: input.planName,
            trialStartedOn: input.trialStartedOn,
            chargeOn: input.chargeOn,
            amountLabel: input.amountLabel,
            manageBillingUrl: input.manageBillingUrl,
            manageEmailPrefsUrl,
          }),
        );
        const emailId = await sendMessage(getResendClient(), env, {
          to: input.email,
          subject: `Your ${input.planName} trial ends on ${input.chargeOn}`,
          html,
        });
        await recordSend(emailDb, {
          email: input.email,
          weddingId: null,
          emailType: "trialEndingReminder",
          status: "sent",
          providerMessageId: emailId,
        });
      } catch (error) {
        await logFailureAndRethrow(
          emailDb,
          {
            email: input.email,
            weddingId: null,
            emailType: "trialEndingReminder",
          },
          error,
        );
      }
    },

    async sendRsvpReminder(input) {
      if (!input.guestEmail) {
        return {
          primaryGuestId: input.primaryGuestId,
          guestEmail: null,
          status: "skippedMissingEmail",
          emailId: null,
          error: null,
        };
      }

      if (!input.token) {
        return {
          primaryGuestId: input.primaryGuestId,
          guestEmail: input.guestEmail,
          status: "skippedIneligible",
          emailId: null,
          error: null,
        };
      }

      const enabled = await loadPreferenceValue(emailDb, {
        email: input.guestEmail,
        weddingId: input.weddingId,
        preferenceType: "rsvpReminder",
      });
      if (!enabled) {
        return {
          primaryGuestId: input.primaryGuestId,
          guestEmail: input.guestEmail,
          status: "skippedOptedOut",
          emailId: null,
          error: null,
        };
      }

      // Load publishedSlug — skip reminder if website not published
      const [websiteRow] = await db
        .select({ publishedSlug: weddingWebsite.publishedSlug })
        .from(weddingWebsite)
        .where(eq(weddingWebsite.weddingId, input.weddingId))
        .limit(1);

      if (!websiteRow?.publishedSlug) {
        return {
          primaryGuestId: input.primaryGuestId,
          guestEmail: input.guestEmail,
          status: "skippedNoWebsite",
          emailId: null,
          error: null,
        };
      }

      const rsvpUrl = `${getWebBaseUrl()}/w/${websiteRow.publishedSlug}?token=${input.token}#rsvp`;

      try {
        // Load guest firstName
        const primaryGuestReminderRows = await db
          .select({ firstName: guest.firstName })
          .from(guest)
          .where(eq(guest.id, input.primaryGuestId))
          .limit(1);
        // select().limit(1) on a known-valid guestId always returns a row.
        const primaryGuest = primaryGuestReminderRows[0]!;

        // Load wedding name + date
        const weddingRowsForReminder = await db
          .select({ name: wedding.name, date: wedding.date })
          .from(wedding)
          .where(eq(wedding.id, input.weddingId))
          .limit(1);
        // select().limit(1) on a known-valid weddingId always returns a row.
        const weddingRow = weddingRowsForReminder[0]!;

        const manageToken = await createManagePreferencesToken(emailDb, env, {
          email: input.guestEmail,
          weddingId: input.weddingId,
          allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        });
        const manageUrl = manageToken.url;
        const html = await render(
          RsvpReminderEmail({
            guestFirstName: primaryGuest.firstName,
            weddingName: weddingRow.name,
            weddingDate: weddingRow.date ?? null,
            rsvpUrl,
            manageUrl,
          }),
        );
        const emailId = await sendMessage(getResendClient(), env, {
          to: input.guestEmail,
          subject: `RSVP reminder from ${weddingRow.name}`,
          html,
          managePrefsUrl: manageUrl,
        });
        await deletePreviousManagePreferencesTokensSafely(emailDb, manageToken);
        await recordSend(emailDb, {
          email: input.guestEmail,
          weddingId: input.weddingId,
          emailType: "rsvpReminder",
          status: "sent",
          providerMessageId: emailId,
        });
        return {
          primaryGuestId: input.primaryGuestId,
          guestEmail: input.guestEmail,
          status: "sent",
          emailId,
          error: null,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Email delivery failed.";
        await recordSend(emailDb, {
          email: input.guestEmail,
          weddingId: input.weddingId,
          emailType: "rsvpReminder",
          status: "failed",
          errorMessage: message,
        });
        return {
          primaryGuestId: input.primaryGuestId,
          guestEmail: input.guestEmail,
          status: "failed",
          emailId: null,
          error: message,
        };
      }
    },
  };
}

type CapturedPasswordReset = {
  email: string;
  url: string;
  token: string;
  capturedAt: number;
};

const capturedPasswordResets: CapturedPasswordReset[] = [];

export function getCapturedPasswordResets(): readonly CapturedPasswordReset[] {
  return capturedPasswordResets;
}

export function clearCapturedPasswordResets() {
  capturedPasswordResets.length = 0;
}

type CapturedFeedback = {
  message: string;
  email?: string;
  pageUrl?: string;
  capturedAt: number;
};

const capturedFeedback: CapturedFeedback[] = [];

export function getCapturedFeedback(): readonly CapturedFeedback[] {
  return capturedFeedback;
}

export function clearCapturedFeedback() {
  capturedFeedback.length = 0;
}

export function createNoopEmailService(): EmailService {
  return {
    async sendPasswordReset({ user, url, token }) {
      capturedPasswordResets.push({
        email: user.email,
        url,
        token,
        capturedAt: Date.now(),
      });
      return undefined;
    },
    async sendEmailVerification() {
      return undefined;
    },
    async sendMemberInvite() {
      return {
        emailId: null,
        provider: "resend",
        status: "skipped",
        sentAt: null,
        templateKey: "member-invite",
        skipped: true,
        rateLimited: false,
        error: null,
      };
    },
    async sendRsvpConfirmation() {
      return undefined;
    },
    async sendRsvpReminder(input) {
      return {
        primaryGuestId: input.primaryGuestId,
        guestEmail: input.guestEmail,
        status:
          input.guestEmail && input.token ? "sent" : "skippedMissingEmail",
        emailId: null,
        error: null,
      };
    },
    async sendFeedback({ message, email, pageUrl }) {
      capturedFeedback.push({
        message,
        email,
        pageUrl,
        capturedAt: Date.now(),
      });
    },
    async sendTrialEndingReminder() {
      return undefined;
    },
    async sendSubscribeNudge() {
      return undefined;
    },
    async sendTrialActivationNudge() {
      return undefined;
    },
  };
}
