import { and, asc, eq, isNull, lt } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { signups } from "../db/schema";
import { sendSurveyReminder } from "../services/email";
import type { LocalOutbox } from "../integration/local-outbox";
import { captureMarketingApiException } from "../services/sentry";
import { isMarketingE2EAllowed } from "../lib/e2e-gate";

interface CronEnv {
  RESEND_API_KEY?: string;
  PRODUCT_NAME: string;
  PRODUCT_DOMAIN: string;
  PRODUCT_LOGO_URL: string;
  PRODUCT_BRAND_COLOR: string;
  PRODUCT_ACCENT_COLOR: string;
  EMAIL_FROM: string;
  E2E_MODE?: string;
  ENVIRONMENT?: string;
  LOCAL_OUTBOX?: LocalOutbox;
}

async function claimReminder(
  db: DrizzleD1Database,
  signupId: number,
  createdBefore: string,
): Promise<boolean> {
  const claimQuery = db
    .update(signups)
    .set({ reminderSent: 1 })
    .where(
      and(
        eq(signups.id, signupId),
        eq(signups.surveyCompleted, 0),
        eq(signups.reminderSent, 0),
        isNull(signups.unsubscribedAt),
        lt(signups.createdAt, createdBefore),
      ),
    );

  if (typeof (claimQuery as { returning?: unknown }).returning === "function") {
    const claimed = (await (
      claimQuery as {
        returning: (shape: { id: typeof signups.id }) => Promise<unknown[]>;
      }
    ).returning({ id: signups.id })) as unknown[];

    return claimed.length > 0;
  }

  await claimQuery;
  return true;
}

async function releaseReminderClaim(
  db: DrizzleD1Database,
  signupId: number,
): Promise<void> {
  await db
    .update(signups)
    .set({ reminderSent: 0 })
    .where(eq(signups.id, signupId));
}

export async function handleSurveyReminder(
  db: DrizzleD1Database,
  env: CronEnv,
): Promise<void> {
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  let eligible: Array<{
    id: number;
    email: string;
    surveyToken: string | null;
  }>;
  try {
    eligible = await db
      .select()
      .from(signups)
      .where(
        and(
          eq(signups.surveyCompleted, 0),
          eq(signups.reminderSent, 0),
          isNull(signups.unsubscribedAt),
          lt(signups.createdAt, twentyFourHoursAgo),
        ),
      )
      .orderBy(asc(signups.createdAt))
      .limit(50);
  } catch (err) {
    console.error("[survey-reminder] eligible signup lookup failed", err);
    captureMarketingApiException(err, {
      source: "survey-reminder-eligible-lookup",
    });
    return;
  }

  const BATCH_SIZE = 5;
  const EMAIL_TIMEOUT_MS = 5_000;

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async (signup) => {
        const surveyToken = signup.surveyToken?.trim();

        if (!surveyToken) {
          console.error(
            `Skipping survey reminder for signup id=${signup.id} (${signup.email}) because surveyToken is empty or unusable.`,
          );
          return;
        }

        let claimed: boolean;
        try {
          claimed = await claimReminder(db, signup.id, twentyFourHoursAgo);
        } catch (err) {
          console.error(
            `Failed to claim survey reminder for signup id=${signup.id} (non-fatal):`,
            err,
          );
          captureMarketingApiException(err, {
            source: "survey-reminder-claim",
          });
          return;
        }

        if (!claimed) {
          return;
        }

        const timeoutPromise = new Promise<boolean>((_, reject) =>
          setTimeout(
            () => reject(new Error("Email send timed out")),
            EMAIL_TIMEOUT_MS,
          ),
        );

        let sent: boolean;
        try {
          sent = await Promise.race([
            sendSurveyReminder({
              productName: env.PRODUCT_NAME,
              domain: env.PRODUCT_DOMAIN,
              logoUrl: env.PRODUCT_LOGO_URL,
              brandColor: env.PRODUCT_BRAND_COLOR,
              accentColor: env.PRODUCT_ACCENT_COLOR,
              recipientEmail: signup.email,
              emailFrom: env.EMAIL_FROM,
              resendApiKey: env.RESEND_API_KEY,
              surveyToken,
              deliveryKey: `survey-reminder:${signup.id}`,
              e2eMode: isMarketingE2EAllowed(env),
              localOutbox: env.LOCAL_OUTBOX,
            }),
            timeoutPromise,
          ]);
        } catch (err) {
          const isTimeout =
            err instanceof Error && err.message === "Email send timed out";
          console.error(
            isTimeout
              ? `Survey reminder timed out for signup id=${signup.id} (${signup.email}).`
              : `Survey reminder email failed for signup id=${signup.id} (${signup.email}).`,
            err,
          );
          captureMarketingApiException(err, {
            source: isTimeout
              ? "survey-reminder-timeout"
              : "survey-reminder-send",
          });
          if (isTimeout) {
            return;
          }
          await releaseReminderClaim(db, signup.id);
          return;
        }

        if (!sent) {
          console.error(
            `Survey reminder email failed for signup id=${signup.id} (${signup.email}).`,
          );
          await releaseReminderClaim(db, signup.id);
        }
      }),
    );
  }
}
