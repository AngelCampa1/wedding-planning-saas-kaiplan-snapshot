import { and, eq, gte, isNull, lt, or } from "drizzle-orm";
import type { Database } from "../db/client";
import type { MarketingDatabase } from "../db/marketing-client";
import { emailPreference } from "../db/marketing-schema";
import { subscription, user, userLifecycleEmail } from "../db/schema";
import type { EmailService } from "./email";
import {
  createManagePreferencesToken,
  deletePreviousManagePreferencesTokensSafely,
  getDefaultEmailPreferences,
} from "./email";

type LifecycleEnv = {
  APP_URL: string;
  EMAIL_TOKEN_SECRET: string;
  EMAIL_FROM_ADDRESS: string;
  EMAIL_REPLY_TO_ADDRESS?: string;
  RESEND_API_KEY?: string;
  PUBLIC_WEB_URL?: string;
};

type LifecycleRow = {
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  plan: string | null;
  status: string | null;
  trialStartedAt: Date | null;
  pendingCheckoutSessionId: string | null;
};

type ExistingLifecycleRow = {
  userId: string;
  stepKey: string;
  status: "pending" | "sent" | "failed";
  attempts: number;
  updatedAt: Date | string | null;
};

type LifecycleStep =
  | {
      kind: "subscribe";
      stepKey: string;
      day: number;
      subjectFocus: string;
      body: string;
      ctaLabel: string;
    }
  | {
      kind: "trial";
      stepKey: string;
      day: number;
      featureFocus: string;
      body: string;
      ctaLabel: string;
      path: string;
    };

const MAX_ATTEMPTS = 3;
const PENDING_STALE_AFTER_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEQUENCE_WINDOW_DAYS = 30;
const DISPATCH_BATCH_SIZE = 500;

const SUBSCRIBE_STEPS: LifecycleStep[] = [
  {
    kind: "subscribe",
    stepKey: "subscribe-day-1",
    day: 1,
    subjectFocus: "wedding plan",
    body: "You have the beginning of a wedding workspace. A trial unlocks the structure that keeps guest decisions, budget moves, and website work from scattering.",
    ctaLabel: "Start your trial",
  },
  {
    kind: "subscribe",
    stepKey: "subscribe-day-4",
    day: 4,
    subjectFocus: "guest list",
    body: "Guest names, RSVP status, households, and budget choices are easier to trust when they are connected instead of split across tabs.",
    ctaLabel: "Organize the list",
  },
  {
    kind: "subscribe",
    stepKey: "subscribe-day-8",
    day: 8,
    subjectFocus: "wedding website",
    body: "Your wedding website and RSVP flow can work from the same planning data, so guests get a polished experience and you keep one source of truth.",
    ctaLabel: "Preview plans",
  },
  {
    kind: "subscribe",
    stepKey: "subscribe-day-14",
    day: 14,
    subjectFocus: "vendor decisions",
    body: "Vendor quotes, payment notes, and planning tasks get noisy quickly. Kaiplan gives those decisions a quieter place to land.",
    ctaLabel: "Compare plans",
  },
  {
    kind: "subscribe",
    stepKey: "subscribe-day-21",
    day: 21,
    subjectFocus: "planning momentum",
    body: "Most spreadsheet systems start calm and get brittle right when the wedding details multiply. A trial gives you room to test a sturdier setup.",
    ctaLabel: "Start the trial",
  },
  {
    kind: "subscribe",
    stepKey: "subscribe-day-29",
    day: 29,
    subjectFocus: "next planning push",
    body: "If Kaiplan is going to help, this is a good moment to try it with real wedding details while the trial window is still fresh.",
    ctaLabel: "Choose a plan",
  },
];

const TRIAL_STEPS: LifecycleStep[] = [
  {
    kind: "trial",
    stepKey: "trial-day-2",
    day: 2,
    featureFocus: "guest planning",
    body: "Start with the guest list. It is the fastest way to feel how Kaiplan connects the decisions that usually drift apart.",
    ctaLabel: "Open guests",
    path: "/guests",
  },
  {
    kind: "trial",
    stepKey: "trial-day-10",
    day: 10,
    featureFocus: "vendor planning",
    body: "Use your trial to compare quotes, track payment notes, and keep vendor decisions tidy before the details multiply.",
    ctaLabel: "Open vendors",
    path: "/vendors",
  },
  {
    kind: "trial",
    stepKey: "trial-day-20",
    day: 20,
    featureFocus: "wedding website",
    body: "Try publishing the guest-facing side of your plans. Your website and RSVP tools are strongest when they share the same source of truth.",
    ctaLabel: "Open website",
    path: "/website",
  },
];

function daysSince(start: Date, now: Date) {
  return Math.floor((now.getTime() - start.getTime()) / DAY_MS);
}

function chooseDueStep<T extends LifecycleStep>(
  steps: T[],
  elapsedDays: number,
) {
  return steps
    .filter((step) => elapsedDays >= step.day)
    .sort((left, right) => right.day - left.day)[0];
}

function hasPaidAccess(row: LifecycleRow) {
  return (
    row.plan !== "free" &&
    row.plan !== null &&
    (row.status === "active" || row.status === "trialing")
  );
}

function isSubscribeCandidate(row: LifecycleRow) {
  if (!row.emailVerified) return false;
  if (hasPaidAccess(row)) return false;
  if (isTrialCandidate(row)) return false;
  return !row.pendingCheckoutSessionId;
}

function isTrialCandidate(row: LifecycleRow) {
  return (
    row.emailVerified &&
    row.trialStartedAt instanceof Date &&
    ((row.status === "trialing" &&
      (row.plan === "free" || row.plan === "starter" || row.plan === "pro")) ||
      (row.plan === "free" && row.status === "inactive"))
  );
}

function appUrl(env: Pick<LifecycleEnv, "APP_URL">, path: string) {
  return `${env.APP_URL.replace(/\/$/, "")}${path}`;
}

async function loadLifecyclePreference(
  db: Pick<MarketingDatabase, "select">,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = (await db
    .select()
    .from(emailPreference)
    .where(
      and(
        eq(emailPreference.email, normalizedEmail),
        isNull(emailPreference.weddingId),
        eq(emailPreference.preferenceType, "appLifecycle"),
      ),
    )) as Array<{ enabled: boolean }>;

  return rows[0]?.enabled ?? getDefaultEmailPreferences().appLifecycle;
}

async function loadExistingStep(
  db: Pick<Database, "select">,
  userId: string,
  stepKey: string,
): Promise<ExistingLifecycleRow | null> {
  const rows = (await db
    .select({
      userId: userLifecycleEmail.userId,
      stepKey: userLifecycleEmail.stepKey,
      status: userLifecycleEmail.status,
      attempts: userLifecycleEmail.attempts,
      updatedAt: userLifecycleEmail.updatedAt,
    })
    .from(userLifecycleEmail)
    .where(
      and(
        eq(userLifecycleEmail.userId, userId),
        eq(userLifecycleEmail.stepKey, stepKey),
      ),
    )
    .limit(1)) as ExistingLifecycleRow[];

  return rows[0] ?? null;
}

async function claimStep(
  db: Pick<Database, "select" | "insert" | "update">,
  userId: string,
  stepKey: string,
  now: Date,
) {
  const existing = await loadExistingStep(db, userId, stepKey);
  if (existing?.status === "sent") return null;
  const stalePendingCutoff = new Date(
    now.getTime() - PENDING_STALE_AFTER_MS,
  );
  if (existing?.status === "pending") {
    const updatedAt =
      existing.updatedAt == null ? null : new Date(existing.updatedAt);
    if (!updatedAt || updatedAt >= stalePendingCutoff) return null;
  }
  if (existing && existing.attempts >= MAX_ATTEMPTS) return null;
  if (existing) {
    const [claimed] = (await db
      .update(userLifecycleEmail)
      .set({
        status: "pending",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userLifecycleEmail.userId, userId),
          eq(userLifecycleEmail.stepKey, stepKey),
          or(
            eq(userLifecycleEmail.status, "failed"),
            and(
              eq(userLifecycleEmail.status, "pending"),
              lt(userLifecycleEmail.updatedAt, stalePendingCutoff),
            ),
          ),
          eq(userLifecycleEmail.attempts, existing.attempts),
        ),
      )
      .returning({
        userId: userLifecycleEmail.userId,
        stepKey: userLifecycleEmail.stepKey,
      status: userLifecycleEmail.status,
      attempts: userLifecycleEmail.attempts,
      updatedAt: userLifecycleEmail.updatedAt,
      })) as ExistingLifecycleRow[];

    return claimed ?? null;
  }

  const [inserted] = (await db
    .insert(userLifecycleEmail)
    .values({
      id: crypto.randomUUID(),
      userId,
      stepKey,
      status: "pending",
      attempts: 0,
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning()) as ExistingLifecycleRow[];

  return inserted ?? null;
}

async function markStep(
  db: Pick<Database, "update">,
  input: {
    userId: string;
    stepKey: string;
    status: "sent" | "failed";
    attempts: number;
    error?: unknown;
  },
) {
  const message =
    input.error instanceof Error
      ? input.error.message
      : "Email delivery failed.";
  await db
    .update(userLifecycleEmail)
    .set({
      status: input.status,
      attempts: input.attempts,
      sentAt: input.status === "sent" ? new Date() : null,
      lastError: input.status === "failed" ? message.slice(0, 500) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userLifecycleEmail.userId, input.userId),
        eq(userLifecycleEmail.stepKey, input.stepKey),
      ),
    );
}

async function sendStep(
  db: Pick<Database, "select" | "insert" | "update">,
  emailDb: MarketingDatabase,
  env: LifecycleEnv,
  emailService: Pick<
    EmailService,
    "sendSubscribeNudge" | "sendTrialActivationNudge"
  >,
  row: LifecycleRow,
  step: LifecycleStep,
  now: Date,
) {
  const claim = await claimStep(db, row.userId, step.stepKey, now);
  if (!claim) return;

  const attempts = claim.attempts + 1;

  try {
    const manageToken = await createManagePreferencesToken(
      emailDb,
      env,
      {
        email: row.email,
        weddingId: null,
        allowedTypes: ["appLifecycle"],
      },
    );
    const manageEmailPrefsUrl = manageToken.url;

    if (step.kind === "subscribe") {
      await emailService.sendSubscribeNudge({
        email: row.email,
        name: row.name,
        stepKey: step.stepKey,
        subjectFocus: step.subjectFocus,
        body: step.body,
        ctaLabel: step.ctaLabel,
        subscribeUrl: appUrl(env, "/subscribe"),
        manageEmailPrefsUrl,
      });
    } else {
      await emailService.sendTrialActivationNudge({
        email: row.email,
        name: row.name,
        stepKey: step.stepKey,
        featureFocus: step.featureFocus,
        body: step.body,
        ctaLabel: step.ctaLabel,
        dashboardUrl: appUrl(env, step.path),
        manageEmailPrefsUrl,
      });
    }

    await deletePreviousManagePreferencesTokensSafely(emailDb, manageToken);

    await markStep(db, {
      userId: row.userId,
      stepKey: step.stepKey,
      status: "sent",
      attempts,
    });
  } catch (error) {
    await markStep(db, {
      userId: row.userId,
      stepKey: step.stepKey,
      status: "failed",
      attempts,
      error,
    });
    console.error(`[lifecycle-email] failed ${step.stepKey}`, error);
  }
}

export async function dispatchSignupLifecycleEmails(
  db: Pick<Database, "select" | "insert" | "update">,
  emailDb: MarketingDatabase,
  env: LifecycleEnv,
  emailService: Pick<
    EmailService,
    "sendSubscribeNudge" | "sendTrialActivationNudge"
  >,
  now = new Date(),
) {
  const candidates = (await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      plan: subscription.plan,
      status: subscription.status,
      trialStartedAt: subscription.trialStartedAt,
      pendingCheckoutSessionId: subscription.pendingCheckoutSessionId,
    })
    .from(user)
    .leftJoin(subscription, eq(subscription.userId, user.id))
    .where(
      or(
        gte(
          user.createdAt,
          new Date(now.getTime() - SEQUENCE_WINDOW_DAYS * DAY_MS),
        ),
        gte(
          subscription.trialStartedAt,
          new Date(now.getTime() - SEQUENCE_WINDOW_DAYS * DAY_MS),
        ),
      ),
    )
    .limit(DISPATCH_BATCH_SIZE)) as LifecycleRow[];

  for (const row of candidates) {
    if (!row.emailVerified) {
      continue;
    }

    if (isTrialCandidate(row)) {
      const lifecycleEnabled = await loadLifecyclePreference(
        emailDb,
        row.email,
      );
      if (!lifecycleEnabled) continue;
      const step = chooseDueStep(
        TRIAL_STEPS,
        daysSince(row.trialStartedAt!, now),
      );
      if (step) {
        await sendStep(db, emailDb, env, emailService, row, step, now);
      }
      continue;
    }

    if (isSubscribeCandidate(row)) {
      const lifecycleEnabled = await loadLifecyclePreference(
        emailDb,
        row.email,
      );
      if (!lifecycleEnabled) continue;
      const step = chooseDueStep(
        SUBSCRIBE_STEPS,
        daysSince(row.createdAt, now),
      );
      if (step) {
        await sendStep(db, emailDb, env, emailService, row, step, now);
      }
    }
  }
}
