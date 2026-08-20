import {
  BILLING_PLAN_FEATURES,
  BILLING_PLAN_LABELS,
  STRIPE_PRICE_ENV_KEYS,
  TRIAL_DURATION_DAYS,
  type BillingFeature,
  type BillingInterval,
  type BillingPlan,
  type BillingStatus,
  type BillingSummary,
  type StripePriceId,
  type StripePriceEnvKey,
  type StripePriceMap,
} from "@kaiplan/shared";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  or,
  lte,
} from "drizzle-orm";
import type { Database } from "../db/client";
import {
  processedWebhookEvent,
  subscription,
  user,
  wedding,
} from "../db/schema";
import type { Env } from "./env";
import type { EmailService } from "./email";
import type { StripeLike } from "./stripe";

type SubscriptionRow = typeof subscription.$inferSelect;
type BillingReadDb = Pick<Database, "select">;
type BillingWriteDb = Pick<Database, "insert" | "update">;
type BillingReminderDb = Pick<Database, "select" | "update">;

const TRIAL_REMINDER_LOOKAHEAD_DAYS = 3;
const TRIAL_REMINDER_CLAIM_STALE_MS = 6 * 60 * 60 * 1000;
// Subset of Env that holds Stripe price IDs. Extracted here so every consumer
// picks the same set of keys and drift between helpers is impossible.
export type StripePriceEnv = Pick<Env, Extract<StripePriceEnvKey, keyof Env>>;

function assertStripePriceId(
  value: string | undefined,
  envKey: keyof StripePriceEnv,
): StripePriceId {
  if (!value || !value.startsWith("price_")) {
    throw new Error(
      `Missing or invalid Stripe price ID for ${envKey}: expected a non-empty string starting with "price_".`,
    );
  }
  return value as StripePriceId;
}

// Single source of truth for the Stripe price map. Every place that needs to
// map (plan, interval) -> priceId or priceId -> plan goes through this helper,
// so there is exactly one switch statement to update when prices change.
export function resolveStripePrices(env: StripePriceEnv): StripePriceMap {
  const keys = STRIPE_PRICE_ENV_KEYS;

  return {
    starter: {
      month: assertStripePriceId(env[keys.starter.month], keys.starter.month),
      year: assertStripePriceId(env[keys.starter.year], keys.starter.year),
    },
    pro: {
      month: assertStripePriceId(env[keys.pro.month], keys.pro.month),
      year: assertStripePriceId(env[keys.pro.year], keys.pro.year),
    },
    lifetime: {
      month: assertStripePriceId(env[keys.lifetime.month], keys.lifetime.month),
    },
  };
}

const STRIPE_STATUS_TO_BILLING_STATUS: Record<string, BillingStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "canceled",
  unpaid: "unpaid",
  incomplete: "inactive",
  incomplete_expired: "inactive",
};

export function normalizeBillingStatus(
  status: string | null | undefined,
): BillingStatus {
  if (!status) {
    return "inactive";
  }

  return STRIPE_STATUS_TO_BILLING_STATUS[status] ?? "inactive";
}

export function resolvePlanFromPriceId(
  env: StripePriceEnv,
  priceId: string | null | undefined,
): BillingPlan {
  if (!priceId) {
    return "free";
  }

  const prices = resolveStripePrices(env);

  if (priceId === prices.starter.month || priceId === prices.starter.year) {
    return "starter";
  }

  if (priceId === prices.pro.month || priceId === prices.pro.year) {
    return "pro";
  }

  if (priceId === prices.lifetime.month) {
    return "lifetime";
  }

  return "free";
}

export function resolveIntervalFromPriceId(
  env: StripePriceEnv,
  priceId: string | null | undefined,
): BillingInterval | null {
  if (!priceId) {
    return null;
  }

  const prices = resolveStripePrices(env);

  if (
    priceId === prices.starter.month ||
    priceId === prices.pro.month ||
    priceId === prices.lifetime.month
  ) {
    return "month";
  }

  if (priceId === prices.starter.year || priceId === prices.pro.year) {
    return "year";
  }

  return null;
}

function formatBillingDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatBillingAmount(
  amountCents: number,
  currency: string,
  interval: BillingInterval | null,
) {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);

  if (interval === "year") {
    return `${amount}/year`;
  }

  if (interval === "month") {
    return `${amount}/month`;
  }

  return amount;
}

async function loadUpcomingTrialInvoiceAmount(
  stripe: StripeLike,
  stripeCustomerId: string,
) {
  if (!stripe.invoices.retrieveUpcoming) {
    throw new Error("Stripe upcoming-invoice preview is unavailable.");
  }

  return stripe.invoices.retrieveUpcoming({ customer: stripeCustomerId });
}

export function getPriceIdForPlan(
  env: StripePriceEnv,
  plan: Exclude<BillingPlan, "free">,
  interval: BillingInterval = "month",
): StripePriceId {
  const prices = resolveStripePrices(env);

  if (plan === "lifetime") {
    // Lifetime is a one-time purchase; the interval is ignored.
    return prices.lifetime.month;
  }

  return prices[plan][interval];
}

export function getFeaturesForPlan(plan: BillingPlan) {
  return [...BILLING_PLAN_FEATURES[plan]];
}

export function hasFeatureAccess(plan: BillingPlan, feature: BillingFeature) {
  return BILLING_PLAN_FEATURES[plan].includes(feature);
}

export function hasActiveBillingStatus(status: BillingStatus) {
  return status === "active" || status === "trialing";
}

export function isInActiveTrial(
  row:
    | (Pick<SubscriptionRow, "status" | "trialStartedAt"> &
        Partial<Pick<SubscriptionRow, "plan">>)
    | null,
): boolean {
  if (!row?.trialStartedAt) {
    return false;
  }

  const isTrialStatus =
    row.status === "trialing" ||
    (row.plan === "free" && row.status === "inactive");

  if (!isTrialStatus) return false;

  const elapsed = Date.now() - row.trialStartedAt.getTime();
  return elapsed < TRIAL_DURATION_DAYS * 86_400_000;
}

export function hasPaidPlanAccess(
  row: Pick<SubscriptionRow, "plan" | "status" | "trialStartedAt"> | null,
) {
  if (isInActiveTrial(row)) {
    return true;
  }

  if (!row || row.plan === "free") {
    return false;
  }

  return hasActiveBillingStatus(row.status);
}

export function isBillingGateRequired(
  row: Pick<
    SubscriptionRow,
    "billingGateRequiredAt" | "plan" | "status" | "trialStartedAt"
  > | null,
) {
  // On-the-fly trial expiry: fires when the trial window has passed even
  // before the cron job sets billingGateRequiredAt.
  if (
    row?.trialStartedAt &&
    (row.status === "trialing" ||
      (row.plan === "free" && row.status === "inactive")) &&
    !isInActiveTrial(row)
  ) {
    return true;
  }

  if (!row?.billingGateRequiredAt) {
    return false;
  }

  return !hasPaidPlanAccess(row);
}

export function getEffectiveBillingPlan(
  row: Pick<SubscriptionRow, "plan" | "status" | "trialStartedAt"> | null,
): BillingPlan {
  if (isInActiveTrial(row)) {
    return "pro";
  }

  if (!row || !hasPaidPlanAccess(row)) {
    return "free";
  }

  return row.plan;
}

export function subscriptionHasFeatureAccess(
  row: Pick<SubscriptionRow, "plan" | "status" | "trialStartedAt"> | null,
  feature: BillingFeature,
) {
  return hasFeatureAccess(getEffectiveBillingPlan(row), feature);
}

export async function recordFeatureFirstUse(
  db: Pick<Database, "update">,
  userId: string,
  feature: BillingFeature,
) {
  const now = new Date();

  if (feature === "vendors") {
    await db
      .update(subscription)
      .set({ vendorsFirstUsedAt: now })
      .where(
        and(
          eq(subscription.userId, userId),
          isNull(subscription.vendorsFirstUsedAt),
        ),
      );
  } else if (feature === "extraPlanner") {
    await db
      .update(subscription)
      .set({ extraPlannerFirstUsedAt: now })
      .where(
        and(
          eq(subscription.userId, userId),
          isNull(subscription.extraPlannerFirstUsedAt),
        ),
      );
  } else if (feature === "weddingWebsite") {
    await db
      .update(subscription)
      .set({ weddingWebsiteFirstUsedAt: now })
      .where(
        and(
          eq(subscription.userId, userId),
          isNull(subscription.weddingWebsiteFirstUsedAt),
        ),
      );
  }
}

function computeTrialDaysRemaining(
  row: Pick<SubscriptionRow, "plan" | "status" | "trialStartedAt"> | null,
): number | null {
  if (!row?.trialStartedAt) return null;
  // Suppress the trial banner once the user has an actual paid subscription.
  if (row.plan !== "free" && hasActiveBillingStatus(row.status)) return null;
  const elapsed = Math.floor(
    (Date.now() - row.trialStartedAt.getTime()) / 86_400_000,
  );
  const remaining = TRIAL_DURATION_DAYS - elapsed;
  // Returns null for both "no trial ever" (trialStartedAt null) and "trial
  // expired" (negative remaining) — the UI treats both the same way (no banner).
  return remaining >= 0 ? remaining : null;
}

export function buildBillingSummary(
  row: Pick<
    SubscriptionRow,
    | "plan"
    | "status"
    | "stripeCustomerId"
    | "currentPeriodEnd"
    | "billingGateRequiredAt"
    | "trialStartedAt"
    | "vendorsFirstUsedAt"
    | "extraPlannerFirstUsedAt"
    | "weddingWebsiteFirstUsedAt"
  > | null,
): BillingSummary {
  const plan = row?.plan ?? "free";
  const status = row?.status ?? "inactive";

  const featuresUsed: BillingFeature[] = [
    ...(row?.vendorsFirstUsedAt ? (["vendors"] as const) : []),
    ...(row?.extraPlannerFirstUsedAt ? (["extraPlanner"] as const) : []),
    ...(row?.weddingWebsiteFirstUsedAt ? (["weddingWebsite"] as const) : []),
  ];

  return {
    plan,
    status,
    stripeCustomerId: row?.stripeCustomerId ?? null,
    currentPeriodEnd: row?.currentPeriodEnd?.toISOString() ?? null,
    billingGateRequired: isBillingGateRequired(row),
    features: getFeaturesForPlan(getEffectiveBillingPlan(row)),
    canManageBilling: Boolean(row?.stripeCustomerId),
    trialDaysRemaining: computeTrialDaysRemaining(row),
    featuresUsed,
  };
}

export async function loadSubscription(db: BillingReadDb, userId: string) {
  return db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function loadSubscriptionByCustomerId(
  db: BillingReadDb,
  customerId: string,
) {
  return db
    .select()
    .from(subscription)
    .where(eq(subscription.stripeCustomerId, customerId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function upsertStripeCustomerId(
  db: BillingWriteDb,
  userId: string,
  stripeCustomerId: string,
) {
  const now = new Date();

  return db
    .insert(subscription)
    .values({
      userId,
      stripeCustomerId,
      plan: "free",
      status: "inactive",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscription.userId,
      set: {
        stripeCustomerId,
        updatedAt: now,
      },
    })
    .returning()
    .then((rows) => rows[0] ?? null);
}

export async function upsertSubscription(
  db: BillingWriteDb,
  userId: string,
  values: Partial<
    Pick<
      SubscriptionRow,
      | "stripeCustomerId"
      | "stripeSubscriptionId"
      | "stripePriceId"
      | "plan"
      | "status"
      | "currentPeriodEnd"
      | "billingGateRequiredAt"
      | "trialStartedAt"
      | "trialEndingReminderSentAt"
      | "pendingCheckoutSessionId"
      | "pendingCheckoutPlan"
      | "pendingCheckoutInterval"
      | "pendingCheckoutCreatedAt"
    >
  >,
) {
  const now = new Date();

  // Only include currentPeriodEnd when it is explicitly provided in values.
  // Omitting it prevents checkout.session.completed from clobbering a period
  // end that was already written by an out-of-order subscription event.
  const hasPeriodEnd = "currentPeriodEnd" in values;
  const hasStripeSubscriptionId = "stripeSubscriptionId" in values;
  const hasBillingGateRequiredAt = "billingGateRequiredAt" in values;
  const hasTrialStartedAt = "trialStartedAt" in values;
  const hasTrialEndingReminderSentAt = "trialEndingReminderSentAt" in values;
  const hasPendingCheckoutSessionId = "pendingCheckoutSessionId" in values;
  const hasPendingCheckoutPlan = "pendingCheckoutPlan" in values;
  const hasPendingCheckoutInterval = "pendingCheckoutInterval" in values;
  const hasPendingCheckoutCreatedAt = "pendingCheckoutCreatedAt" in values;

  return db
    .insert(subscription)
    .values({
      userId,
      stripeCustomerId: values.stripeCustomerId ?? null,
      ...(hasStripeSubscriptionId
        ? { stripeSubscriptionId: values.stripeSubscriptionId }
        : {}),
      stripePriceId: values.stripePriceId ?? null,
      plan: values.plan ?? "free",
      status: values.status ?? "inactive",
      ...(hasPeriodEnd ? { currentPeriodEnd: values.currentPeriodEnd } : {}),
      ...(hasBillingGateRequiredAt
        ? { billingGateRequiredAt: values.billingGateRequiredAt }
        : {}),
      ...(hasTrialStartedAt ? { trialStartedAt: values.trialStartedAt } : {}),
      ...(hasTrialEndingReminderSentAt
        ? { trialEndingReminderSentAt: values.trialEndingReminderSentAt }
        : {}),
      ...(hasPendingCheckoutSessionId
        ? { pendingCheckoutSessionId: values.pendingCheckoutSessionId }
        : {}),
      ...(hasPendingCheckoutPlan
        ? { pendingCheckoutPlan: values.pendingCheckoutPlan }
        : {}),
      ...(hasPendingCheckoutInterval
        ? { pendingCheckoutInterval: values.pendingCheckoutInterval }
        : {}),
      ...(hasPendingCheckoutCreatedAt
        ? { pendingCheckoutCreatedAt: values.pendingCheckoutCreatedAt }
        : {}),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: subscription.userId,
      set: {
        // Spreading `values` here is safe: the hasPeriodEnd guard on the insert
        // side mirrors correctly because both paths receive the same `values`
        // object. The E2E path that intentionally passes currentPeriodEnd: null
        // is gated by ENVIRONMENT !== "production" at the call site, so null
        // never reaches this update in production.
        ...values,
        updatedAt: now,
      },
    })
    .returning()
    .then((rows) => rows[0] ?? null);
}

export async function updateSubscriptionByCustomerId(
  db: BillingWriteDb,
  stripeCustomerId: string,
  values: Partial<
    Pick<
      SubscriptionRow,
      | "stripeSubscriptionId"
      | "stripePriceId"
      | "plan"
      | "status"
      | "currentPeriodEnd"
      | "billingGateRequiredAt"
      | "trialStartedAt"
      | "trialEndingReminderSentAt"
      | "pendingCheckoutSessionId"
      | "pendingCheckoutPlan"
      | "pendingCheckoutInterval"
      | "pendingCheckoutCreatedAt"
    >
  >,
) {
  return db
    .update(subscription)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(subscription.stripeCustomerId, stripeCustomerId))
    .returning()
    .then((rows) => rows[0] ?? null);
}

export async function upsertSubscriptionByCustomerId(
  db: BillingWriteDb,
  stripeCustomerId: string,
  values: Partial<
    Pick<
      SubscriptionRow,
      | "stripeSubscriptionId"
      | "stripePriceId"
      | "plan"
      | "status"
      | "currentPeriodEnd"
      | "billingGateRequiredAt"
      | "trialStartedAt"
      | "trialEndingReminderSentAt"
      | "pendingCheckoutSessionId"
      | "pendingCheckoutPlan"
      | "pendingCheckoutInterval"
      | "pendingCheckoutCreatedAt"
    >
  >,
  userId?: string | null,
) {
  if (!userId) {
    return null;
  }

  // Forward currentPeriodEnd only when the caller explicitly included it.
  const hasPeriodEnd = "currentPeriodEnd" in values;
  const hasStripeSubscriptionId = "stripeSubscriptionId" in values;
  const hasPendingCheckoutSessionId = "pendingCheckoutSessionId" in values;
  const hasPendingCheckoutPlan = "pendingCheckoutPlan" in values;
  const hasPendingCheckoutInterval = "pendingCheckoutInterval" in values;
  const hasPendingCheckoutCreatedAt = "pendingCheckoutCreatedAt" in values;
  return upsertSubscription(db, userId, {
    stripeCustomerId,
    ...(hasStripeSubscriptionId
      ? { stripeSubscriptionId: values.stripeSubscriptionId }
      : {}),
    stripePriceId: values.stripePriceId ?? null,
    plan: values.plan ?? "free",
    status: values.status ?? "inactive",
    ...(hasPeriodEnd ? { currentPeriodEnd: values.currentPeriodEnd } : {}),
    ...("billingGateRequiredAt" in values
      ? { billingGateRequiredAt: values.billingGateRequiredAt }
      : {}),
    ...("trialStartedAt" in values
      ? { trialStartedAt: values.trialStartedAt }
      : {}),
    ...("trialEndingReminderSentAt" in values
      ? { trialEndingReminderSentAt: values.trialEndingReminderSentAt }
      : {}),
    ...(hasPendingCheckoutSessionId
      ? { pendingCheckoutSessionId: values.pendingCheckoutSessionId }
      : {}),
    ...(hasPendingCheckoutPlan
      ? { pendingCheckoutPlan: values.pendingCheckoutPlan }
      : {}),
    ...(hasPendingCheckoutInterval
      ? { pendingCheckoutInterval: values.pendingCheckoutInterval }
      : {}),
    ...(hasPendingCheckoutCreatedAt
      ? { pendingCheckoutCreatedAt: values.pendingCheckoutCreatedAt }
      : {}),
  });
}

export async function dispatchTrialEndingReminders(
  db: BillingReminderDb,
  env: Pick<Env, "APP_URL"> & StripePriceEnv,
  stripe: StripeLike,
  emailService: EmailService,
  now = new Date(),
) {
  const staleClaimCutoff = new Date(
    now.getTime() - TRIAL_REMINDER_CLAIM_STALE_MS,
  );
  const windowStart = new Date(now);
  windowStart.setUTCHours(0, 0, 0, 0);

  const windowEnd = new Date(windowStart);
  windowEnd.setUTCDate(
    windowEnd.getUTCDate() + TRIAL_REMINDER_LOOKAHEAD_DAYS + 1,
  );

  const rows = await db
    .select({
      userId: subscription.userId,
      email: user.email,
      name: user.name,
      plan: subscription.plan,
      stripeCustomerId: subscription.stripeCustomerId,
      stripePriceId: subscription.stripePriceId,
      currentPeriodEnd: subscription.currentPeriodEnd,
      trialStartedAt: subscription.trialStartedAt,
    })
    .from(subscription)
    .innerJoin(user, eq(subscription.userId, user.id))
    .where(
      and(
        inArray(subscription.plan, ["starter", "pro"]),
        eq(subscription.status, "trialing"),
        isNull(subscription.trialEndingReminderSentAt),
        or(
          isNull(subscription.trialEndingReminderClaimedAt),
          lt(subscription.trialEndingReminderClaimedAt, staleClaimCutoff),
        ),
        gte(subscription.currentPeriodEnd, windowStart),
        lt(subscription.currentPeriodEnd, windowEnd),
      ),
    );

  for (const row of rows) {
    if (!row.currentPeriodEnd) {
      continue;
    }

    const interval =
      resolveIntervalFromPriceId(env, row.stripePriceId) ?? "month";
    const chargeOn = formatBillingDate(row.currentPeriodEnd);
    const fallbackTrialStart = new Date(row.currentPeriodEnd);
    fallbackTrialStart.setUTCDate(
      fallbackTrialStart.getUTCDate() - TRIAL_DURATION_DAYS,
    );
    const trialStartedAt = row.trialStartedAt ?? fallbackTrialStart;
    const paidPlan = row.plan === "starter" ? "starter" : "pro";
    const customerId = row.stripeCustomerId;

    if (!customerId) {
      console.error(
        `[trial-reminder] missing stripe customer for user ${row.userId}`,
      );
      continue;
    }

    const claimedRows = await db
      .update(subscription)
      .set({
        trialEndingReminderClaimedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(subscription.userId, row.userId),
          inArray(subscription.plan, ["starter", "pro"]),
          eq(subscription.status, "trialing"),
          isNull(subscription.trialEndingReminderSentAt),
          or(
            isNull(subscription.trialEndingReminderClaimedAt),
            lt(subscription.trialEndingReminderClaimedAt, staleClaimCutoff),
          ),
          gte(subscription.currentPeriodEnd, windowStart),
          lt(subscription.currentPeriodEnd, windowEnd),
        ),
      )
      .returning({ userId: subscription.userId });
    if (claimedRows.length === 0) {
      continue;
    }

    try {
      const upcomingInvoice = await loadUpcomingTrialInvoiceAmount(
        stripe,
        customerId,
      );

      await emailService.sendTrialEndingReminder({
        email: row.email,
        name: row.name,
        planName: BILLING_PLAN_LABELS[paidPlan],
        trialStartedOn: formatBillingDate(trialStartedAt),
        chargeOn,
        amountLabel: formatBillingAmount(
          upcomingInvoice.amount_due,
          upcomingInvoice.currency,
          interval,
        ),
        manageBillingUrl: `${env.APP_URL.replace(/\/$/, "")}/settings`,
      });

      await db
        .update(subscription)
        .set({
          trialEndingReminderSentAt: new Date(),
          trialEndingReminderClaimedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(subscription.userId, row.userId));
    } catch (error) {
      await db
        .update(subscription)
        .set({
          trialEndingReminderClaimedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(subscription.userId, row.userId));
      console.error(`[trial-reminder] failed for user ${row.userId}`, error);
    }
  }
}

export async function cleanupOldProcessedEvents(
  db: Pick<Database, "delete" | "select">,
  olderThanDays = 7,
): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  // Batch deletes with LIMIT 1000 to avoid long table locks on large datasets.
  // This cleanup runs on a schedule so eventual cleanup via multiple batches is fine.
  const oldEventIds = await db
    .select({ eventId: processedWebhookEvent.eventId })
    .from(processedWebhookEvent)
    .where(lt(processedWebhookEvent.processedAt, cutoff))
    .limit(1000);
  if (oldEventIds.length > 0) {
    await db.delete(processedWebhookEvent).where(
      inArray(
        processedWebhookEvent.eventId,
        oldEventIds.map((r) => r.eventId),
      ),
    );
  }
}

export async function getWeddingOwnerId(db: BillingReadDb, weddingId: string) {
  return db
    .select({ createdBy: wedding.createdBy })
    .from(wedding)
    .where(eq(wedding.id, weddingId))
    .limit(1)
    .then((rows) => rows[0]?.createdBy ?? null);
}

export async function getWeddingPlan(db: BillingReadDb, weddingId: string) {
  const ownerId = await getWeddingOwnerId(db, weddingId);
  if (!ownerId) {
    return "free" as BillingPlan;
  }

  const ownerSubscription = await loadSubscription(db, ownerId);
  return ownerSubscription?.plan ?? "free";
}

export async function getWeddingOwnerSubscription(
  db: BillingReadDb,
  weddingId: string,
) {
  const ownerId = await getWeddingOwnerId(db, weddingId);
  if (!ownerId) {
    return null;
  }

  return loadSubscription(db, ownerId);
}

/**
 * Finds free-trial subscriptions whose configured trial window has elapsed and sets
 * `billing_gate_required_at` on them so the billing gate middleware will
 * block access until the user upgrades.
 *
 * Targets rows where:
 *   - trial_started_at IS NOT NULL  (trial was started)
 *   - billing_gate_required_at IS NULL  (not already gated)
 *   - trial_started_at + configured trial length <= now()  (trial has elapsed)
 *   - plan = 'free' OR status NOT IN ('active', 'trialing')  (no paid access)
 *
 * Returns the number of subscriptions that were gated.
 */
export async function expireElapsedFreeTrials(
  db: BillingReminderDb,
  now = new Date(),
): Promise<number> {
  const trialCutoff = new Date(
    now.getTime() - TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
  );

  const expiredRows = await db
    .select({ userId: subscription.userId })
    .from(subscription)
    .where(
      and(
        isNotNull(subscription.trialStartedAt),
        isNull(subscription.billingGateRequiredAt),
        lte(subscription.trialStartedAt, trialCutoff),
        or(
          eq(subscription.plan, "free"),
          not(inArray(subscription.status, ["active", "trialing"])),
        ),
      ),
    )
    .limit(1000);

  if (expiredRows.length === 0) {
    return 0;
  }

  await db
    .update(subscription)
    .set({
      billingGateRequiredAt: now,
      updatedAt: now,
    })
    .where(
      inArray(
        subscription.userId,
        expiredRows.map((r) => r.userId),
      ),
    );

  return expiredRows.length;
}
