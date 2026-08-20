import { Hono } from "hono";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import {
  createCheckoutSessionSchema,
  PRICING_TIERS,
  type BillingInterval,
  type BillingPlan,
  type BillingHistoryResponse,
} from "@kaiplan/shared";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import type { Env } from "../lib/env";
import { sessionMiddleware } from "../middleware/session";
import {
  buildBillingSummary,
  cleanupOldProcessedEvents,
  getPriceIdForPlan,
  loadSubscription,
  loadSubscriptionByCustomerId,
  normalizeBillingStatus,
  isBillingGateRequired,
  resolvePlanFromPriceId,
  resolveStripePrices,
  type StripePriceEnv,
  upsertStripeCustomerId,
  upsertSubscription,
  updateSubscriptionByCustomerId,
  upsertSubscriptionByCustomerId,
} from "../lib/billing";
import { processedWebhookEvent, user as authUser } from "../db/schema";
import { recordAuditEvent } from "../lib/audit-log";
import type { StripeLike, StripeEvent } from "../lib/stripe";
import { isE2eAllowed } from "../lib/e2e-gate";
import {
  readJsonObjectBody,
  readOptionalJsonObjectBody,
} from "../lib/json-body";

type SessionUser = {
  id: string;
  email: string;
  name: string;
};

type Variables = {
  user: SessionUser;
};

const CHECKOUT_PENDING_TTL_MS = 30 * 60 * 1000;

function castMetadata(value: unknown): Record<string, string | undefined> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string | undefined>;
  }
  return {};
}

async function ensureStripeCustomer(
  db: Pick<Database, "select" | "insert" | "update">,
  stripe: StripeLike,
  user: SessionUser,
  idempotencyKey: string,
) {
  const current = await loadSubscription(db, user.id);
  if (current?.stripeCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(
        current.stripeCustomerId,
      );
      if (!customer.deleted) {
        return current.stripeCustomerId;
      }
    } catch (error) {
      if (!isStripeResourceMissingError(error)) {
        throw error;
      }
    }
  }

  const customerInput = {
    email: user.email,
    name: user.name,
    metadata: { userId: user.id },
  };
  const customer = stripe.customers.createWithIdempotency
    ? await stripe.customers.createWithIdempotency(
        customerInput,
        idempotencyKey,
      )
    : await stripe.customers.create(customerInput);

  await upsertStripeCustomerId(db, user.id, customer.id);
  return customer.id;
}

function isStripeResourceMissingError(error: unknown) {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  return (
    record.code === "resource_missing" ||
    (record.type === "StripeInvalidRequestError" && record.statusCode === 404)
  );
}

async function loadBillingHistoryItems(
  stripe: StripeLike,
  customerId: string,
): Promise<BillingHistoryResponse> {
  try {
    const [invoiceResponse, paymentIntentResponse] = await Promise.all([
      stripe.invoices.list({
        customer: customerId,
        limit: 20,
      }),
      stripe.paymentIntents.list({
        customer: customerId,
        limit: 20,
      }),
    ]);

    const invoices = mapInvoiceItems(invoiceResponse.data);
    const invoicePaymentIntentIds = new Set(
      invoices
        .map((invoice) => invoice.paymentIntentId)
        .filter((paymentIntentId): paymentIntentId is string =>
          Boolean(paymentIntentId),
        ),
    );
    const items = [
      ...invoices.map(
        ({ paymentIntentId: _paymentIntentId, ...invoice }) => invoice,
      ),
      ...mapPaymentIntentItems(paymentIntentResponse.data).filter(
        (paymentIntent) => !invoicePaymentIntentIds.has(paymentIntent.id),
      ),
    ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return { items };
  } catch (error) {
    if (isStripeResourceMissingError(error)) {
      return { items: [] };
    }

    throw error;
  }
}

async function createBillingPortalSession(
  stripe: StripeLike,
  input: Parameters<StripeLike["billingPortal"]["sessions"]["create"]>[0],
) {
  try {
    return {
      kind: "ok" as const,
      session: await stripe.billingPortal.sessions.create(input),
    };
  } catch (error) {
    if (isStripeResourceMissingError(error)) {
      return { kind: "missing-customer" as const };
    }

    throw error;
  }
}

function mapInvoiceItems(
  invoices: Awaited<ReturnType<StripeLike["invoices"]["list"]>>["data"],
) {
  return invoices.map((invoice) => ({
    id: invoice.id,
    type: "invoice" as const,
    amountCents: invoice.amount_paid,
    currency: invoice.currency.toUpperCase(),
    status: invoice.status ?? "unknown",
    createdAt: new Date(invoice.created * 1000).toISOString(),
    hostedUrl: invoice.hosted_invoice_url,
    paymentIntentId: invoice.payment_intent ?? null,
  }));
}

function mapPaymentIntentItems(
  paymentIntents: Awaited<
    ReturnType<StripeLike["paymentIntents"]["list"]>
  >["data"],
) {
  return paymentIntents.map((paymentIntent) => ({
    id: paymentIntent.id,
    type: "payment_intent" as const,
    amountCents: paymentIntent.amount,
    currency: paymentIntent.currency.toUpperCase(),
    status: paymentIntent.status,
    createdAt: new Date(paymentIntent.created * 1000).toISOString(),
    hostedUrl: null,
  }));
}

function buildCheckoutRedirectUrl(
  baseUrl: string,
  plan: BillingPlan,
  interval?: "month" | "year",
) {
  const redirectUrl = new URL(baseUrl);
  redirectUrl.searchParams.set("plan", plan);
  if (interval) {
    redirectUrl.searchParams.set("interval", interval);
  }
  return redirectUrl.toString();
}

function buildAppCheckoutReturnUrl(
  appUrl: string,
  status: "success" | "cancel",
  plan: BillingPlan,
  interval?: "month" | "year",
) {
  const baseUrl = new URL(
    status === "success"
      ? "/subscribe?checkout=success"
      : "/subscribe?checkout=cancel",
    appUrl,
  );
  baseUrl.searchParams.set("plan", plan);
  if (interval) {
    baseUrl.searchParams.set("interval", interval);
  }
  return baseUrl.toString();
}

function normalizeCheckoutInterval(interval?: string | null): BillingInterval {
  return interval === "year" ? "year" : "month";
}

function buildCheckoutIdempotencyKey(
  userId: string,
  plan: BillingPlan,
  interval: BillingInterval,
  stateVersion: string,
) {
  return `checkout:${userId}:${plan}:${interval}:${stateVersion}`;
}

function buildCheckoutIdempotencyState(
  existingSub: Awaited<ReturnType<typeof loadSubscription>>,
) {
  if (!existingSub) {
    return "new";
  }

  if (existingSub.pendingCheckoutSessionId) {
    return `pending:${existingSub.pendingCheckoutSessionId}`;
  }

  if (
    !existingSub.stripeCustomerId &&
    existingSub.plan === "free" &&
    existingSub.status === "inactive"
  ) {
    return "new";
  }

  if (existingSub.updatedAt instanceof Date) {
    return `state:${existingSub.updatedAt.getTime()}`;
  }

  return "existing";
}

function isPendingCheckoutFresh(
  createdAt: Date | null | undefined,
  now = new Date(),
) {
  if (!createdAt) {
    return false;
  }
  return now.getTime() - createdAt.getTime() <= CHECKOUT_PENDING_TTL_MS;
}

async function createCheckoutSession(
  stripe: StripeLike,
  input: Parameters<StripeLike["checkout"]["sessions"]["create"]>[0],
  idempotencyKey: string,
) {
  if (stripe.checkout.sessions.createWithIdempotency) {
    return stripe.checkout.sessions.createWithIdempotency(
      input,
      idempotencyKey,
    );
  }

  return stripe.checkout.sessions.create(input);
}

function summarizeCaughtError(error: unknown) {
  return { error: String(error) };
}

const billingPortalRequestSchema = z
  .object({
    returnTarget: z.enum(["settings", "subscribe"]).optional(),
  })
  .optional();

function findKnownPriceId(
  priceIds: Array<string | null | undefined>,
  env: StripePriceEnv,
) {
  const prices = resolveStripePrices(env);
  const knownPriceIds = new Set<string>([
    prices.starter.month,
    prices.starter.year,
    prices.pro.month,
    prices.pro.year,
    prices.lifetime.month,
  ]);

  return (
    priceIds.find(
      (priceId): priceId is string =>
        typeof priceId === "string" && knownPriceIds.has(priceId),
    ) ??
    priceIds.find(
      (priceId): priceId is string => typeof priceId === "string",
    ) ??
    null
  );
}

function getInvoicePriceId(
  object: Record<string, unknown>,
  env: StripePriceEnv,
) {
  const lines = object.lines as
    | { data?: Array<{ price?: { id?: string | null } | null }> }
    | undefined;
  const priceIds = lines?.data?.map((line) => line?.price?.id ?? null) ?? [];
  return findKnownPriceId(priceIds, env);
}

function getSubscriptionPriceId(
  object: Record<string, unknown>,
  env: StripePriceEnv,
) {
  const items = object.items as
    | { data?: Array<{ price?: { id?: string | null } | null }> }
    | undefined;
  const priceIds = items?.data?.map((item) => item?.price?.id ?? null) ?? [];
  return findKnownPriceId(priceIds, env);
}

function isFullChargeRefund(object: Record<string, unknown>) {
  const amount =
    typeof object.amount === "number" && Number.isFinite(object.amount)
      ? object.amount
      : null;
  const amountRefunded =
    typeof object.amount_refunded === "number" &&
    Number.isFinite(object.amount_refunded)
      ? object.amount_refunded
      : null;

  if (object.refunded === true) {
    return true;
  }

  if (amount !== null && amountRefunded !== null) {
    return amountRefunded >= amount;
  }

  return object.refunded !== false;
}

function isZeroAmountSubscriptionCreationInvoice(
  object: Record<string, unknown>,
) {
  if (object.billing_reason !== "subscription_create") {
    return false;
  }

  const amountDue =
    typeof object.amount_due === "number" && Number.isFinite(object.amount_due)
      ? object.amount_due
      : null;
  const amountPaid =
    typeof object.amount_paid === "number" &&
    Number.isFinite(object.amount_paid)
      ? object.amount_paid
      : null;

  return amountDue === 0 && amountPaid === 0;
}

async function isStaleCustomerForUser(
  db: Pick<Database, "select">,
  userId: string,
  customerId: string,
): Promise<boolean> {
  const existing = await loadSubscription(db, userId);
  return Boolean(
    existing?.stripeCustomerId && existing.stripeCustomerId !== customerId,
  );
}

async function userExists(db: Pick<Database, "select">, userId: string) {
  const rows = (await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(eq(authUser.id, userId))
    .limit(1)) as Array<{ id: string }>;

  return rows.length > 0;
}

function isWebhookBillingPlan(
  value: unknown,
): value is Exclude<BillingPlan, "free"> {
  return (
    typeof value === "string" &&
    PRICING_TIERS.includes(value as Exclude<BillingPlan, "free">)
  );
}

function getStripeSubscriptionId(object: StripeEvent["data"]["object"]) {
  return typeof object.id === "string" && object.id.length > 0
    ? object.id
    : null;
}

function getInvoiceSubscriptionId(object: StripeEvent["data"]["object"]) {
  const subscription = object.subscription;
  if (typeof subscription === "string" && subscription.length > 0) {
    return subscription;
  }

  if (
    subscription !== null &&
    typeof subscription === "object" &&
    !Array.isArray(subscription)
  ) {
    const record = subscription as Record<string, unknown>;
    if (typeof record.id === "string" && record.id.length > 0) {
      return record.id;
    }
  }

  return null;
}

function isCurrentStripeSubscription(
  existing: { stripeSubscriptionId?: string | null } | null,
  stripeSubscriptionId: string | null,
) {
  return (
    !existing?.stripeSubscriptionId ||
    !stripeSubscriptionId ||
    existing.stripeSubscriptionId === stripeSubscriptionId
  );
}

function canApplyStripeSubscriptionLifecycleEvent(
  existing: {
    stripeSubscriptionId?: string | null;
    status?: string | null;
    plan?: string | null;
    pendingCheckoutSessionId?: string | null;
  } | null,
  stripeSubscriptionId: string | null,
) {
  if (
    stripeSubscriptionId &&
    existing?.status === "canceled" &&
    existing.stripeSubscriptionId === stripeSubscriptionId
  ) {
    return false;
  }

  if (isCurrentStripeSubscription(existing, stripeSubscriptionId)) {
    return true;
  }

  return Boolean(
    stripeSubscriptionId &&
    existing?.pendingCheckoutSessionId &&
    (existing.status === "canceled" || existing.plan === "free"),
  );
}

function canApplyStripeInvoiceEvent(
  existing: {
    stripeSubscriptionId?: string | null;
    status?: string | null;
  } | null,
  stripeSubscriptionId: string | null,
) {
  if (
    stripeSubscriptionId &&
    existing?.status === "canceled" &&
    existing.stripeSubscriptionId === stripeSubscriptionId
  ) {
    return false;
  }

  return isCurrentStripeSubscription(existing, stripeSubscriptionId);
}

async function applyWebhookEvent(
  db: Pick<Database, "insert" | "update" | "select">,
  stripe: StripeLike,
  event: StripeEvent,
  env: StripePriceEnv,
) {
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const object = event.data.object;
    const customerId = String(object.customer ?? "");
    if (!customerId) {
      return;
    }
    const stripeSubscriptionId = getStripeSubscriptionId(object);
    const priceId = getSubscriptionPriceId(object, env);
    const status = normalizeBillingStatus(String(object.status ?? ""));
    if (stripeSubscriptionId) {
      const existing = await loadSubscriptionByCustomerId(db, customerId);
      if (
        !canApplyStripeSubscriptionLifecycleEvent(
          existing,
          stripeSubscriptionId,
        )
      ) {
        return;
      }
    }
    const subscriptionItems = object.items as
      | { data?: Array<{ current_period_end?: number | null }> }
      | undefined;
    // M4: fall back to the top-level current_period_end for older Stripe API
    // versions where items.data[0].current_period_end may be absent.
    const rawPeriodEnd =
      subscriptionItems?.data?.[0]?.current_period_end ??
      (object.current_period_end as number | null | undefined) ??
      null;
    const currentPeriodEnd =
      typeof rawPeriodEnd === "number" ? new Date(rawPeriodEnd * 1000) : null;
    const rawTrialStart =
      (object.trial_start as number | null | undefined) ??
      (object.current_period_start as number | null | undefined) ??
      null;
    const trialStartedAt =
      typeof rawTrialStart === "number" ? new Date(rawTrialStart * 1000) : null;

    const updated = await updateSubscriptionByCustomerId(db, customerId, {
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
      stripePriceId: priceId,
      plan: resolvePlanFromPriceId(env, priceId),
      status,
      currentPeriodEnd,
      billingGateRequiredAt: null,
      pendingCheckoutSessionId: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
      ...(trialStartedAt ? { trialStartedAt } : {}),
    });

    if (updated) {
      await recordBillingPlanAuditEvent(db, {
        subscription: updated,
        sourceEventType: event.type,
        stripeEventId: event.id,
      });
      return;
    }

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      // Customer was deleted in Stripe; nothing to process
      return;
    }
    const userId = customer.metadata.userId ?? null;
    if (!userId) {
      return;
    }

    if (await isStaleCustomerForUser(db, userId, customerId)) {
      console.warn(
        "[billing] ignoring subscription webhook for stale Stripe customer",
        {
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        },
      );
      return;
    }
    if (!(await userExists(db, userId))) {
      console.warn("[billing] ignoring subscription webhook for missing user", {
        stripeCustomerId: customerId,
        userId,
        stripeEventId: event.id,
        sourceEventType: event.type,
      });
      return;
    }

    const hydrated = await upsertSubscriptionByCustomerId(
      db,
      customerId,
      {
        stripePriceId: priceId,
        plan: resolvePlanFromPriceId(env, priceId),
        status,
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
        currentPeriodEnd,
        billingGateRequiredAt: null,
        pendingCheckoutSessionId: null,
        pendingCheckoutPlan: null,
        pendingCheckoutInterval: null,
        pendingCheckoutCreatedAt: null,
        ...(trialStartedAt ? { trialStartedAt } : {}),
        ...(status === "trialing" ? { trialEndingReminderSentAt: null } : {}),
      },
      userId,
    );
    await recordBillingPlanAuditEvent(db, {
      subscription: hydrated,
      sourceEventType: event.type,
      stripeEventId: event.id,
    });
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    // On deletion, always downgrade to free regardless of price data.
    const object = event.data.object;
    const customerId = String(object.customer ?? "");
    if (!customerId) {
      return;
    }
    const stripeSubscriptionId = getStripeSubscriptionId(object);
    const existing = await loadSubscriptionByCustomerId(db, customerId);
    if (!isCurrentStripeSubscription(existing, stripeSubscriptionId)) {
      return;
    }

    const updated = await updateSubscriptionByCustomerId(db, customerId, {
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
      plan: "free",
      status: "canceled",
      pendingCheckoutSessionId: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
    });

    if (updated) {
      await recordBillingPlanAuditEvent(db, {
        subscription: updated,
        sourceEventType: event.type,
        stripeEventId: event.id,
      });
      return;
    }

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      // Customer was deleted in Stripe; nothing to process
      return;
    }
    const userId = customer.metadata.userId ?? null;
    if (!userId) {
      return;
    }

    if (await isStaleCustomerForUser(db, userId, customerId)) {
      console.warn(
        "[billing] ignoring subscription deletion for stale Stripe customer",
        {
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        },
      );
      return;
    }
    if (!(await userExists(db, userId))) {
      console.warn(
        "[billing] ignoring subscription deletion for missing user",
        {
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        },
      );
      return;
    }

    const hydrated = await upsertSubscriptionByCustomerId(
      db,
      customerId,
      {
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
        plan: "free",
        status: "canceled",
        pendingCheckoutSessionId: null,
        pendingCheckoutPlan: null,
        pendingCheckoutInterval: null,
        pendingCheckoutCreatedAt: null,
      },
      userId,
    );
    await recordBillingPlanAuditEvent(db, {
      subscription: hydrated,
      sourceEventType: event.type,
      stripeEventId: event.id,
    });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const object = event.data.object;
    const metadata = castMetadata(object.metadata);
    const userId = metadata.userId;
    const plan = metadata.plan;
    const rawInterval = metadata.interval;
    const interval =
      rawInterval === "month" || rawInterval === "year" ? rawInterval : "month";
    const customerId =
      typeof object.customer === "string" ? object.customer : null;
    const checkoutSessionId = typeof object.id === "string" ? object.id : null;
    const checkoutSubscriptionId =
      typeof object.subscription === "string" ? object.subscription : null;

    if (userId) {
      if (!customerId || !checkoutSessionId) {
        return;
      }

      const existing = await loadSubscription(db, userId);
      if (!existing && !(await userExists(db, userId))) {
        console.warn(
          "[billing] ignoring checkout completion for missing user",
          {
            checkoutSessionId,
            stripeCustomerId: customerId,
            userId,
            stripeEventId: event.id,
            sourceEventType: event.type,
          },
        );
        return;
      }

      if (
        existing?.stripeCustomerId &&
        existing.stripeCustomerId !== customerId
      ) {
        console.warn("[billing] ignoring stale checkout completion webhook", {
          checkoutSessionId,
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        });
        return;
      }

      if (
        existing?.pendingCheckoutSessionId &&
        existing.pendingCheckoutSessionId !== checkoutSessionId
      ) {
        console.warn("[billing] ignoring stale checkout completion webhook", {
          checkoutSessionId,
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        });
        return;
      }

      if (
        existing?.pendingCheckoutSessionId === null &&
        existing.stripeCustomerId !== null &&
        !(existing.plan === "free" && existing.status === "inactive")
      ) {
        console.warn("[billing] ignoring stale checkout completion webhook", {
          checkoutSessionId,
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        });
        return;
      }

      const resolvedPlan = isWebhookBillingPlan(existing?.pendingCheckoutPlan)
        ? existing.pendingCheckoutPlan
        : isWebhookBillingPlan(plan)
          ? plan
          : null;
      if (!resolvedPlan) {
        return;
      }

      const resolvedInterval = normalizeCheckoutInterval(
        existing?.pendingCheckoutInterval ?? interval,
      );

      // Do NOT write currentPeriodEnd here. For subscriptions,
      // customer.subscription.created/updated events populate it correctly.
      // Writing null here would clobber an already-set period end when events
      // arrive out of order (subscription.updated before checkout.completed).
      //
      // For subscription-mode checkouts, do NOT infer status from the checkout
      // event. Trials have payment_status "no_payment_required" and even paid
      // subscriptions should have their status owned by
      // customer.subscription.created / customer.subscription.updated. Use
      // "trialing" so newly-converted users can enter the app immediately
      // while customer.subscription.created / updated fills in period dates.
      // For one-time payment-mode checkouts (lifetime), keep the existing
      // behaviour: set "active" when payment_status is "paid".
      const isSubscriptionMode = object.mode === "subscription";
      const status: ReturnType<typeof normalizeBillingStatus> =
        isSubscriptionMode
          ? "trialing"
          : object.payment_status === "paid"
            ? "active"
            : normalizeBillingStatus(String(object.status ?? ""));
      const updated = await upsertSubscription(db, userId, {
        stripeCustomerId: customerId,
        ...(checkoutSubscriptionId
          ? { stripeSubscriptionId: checkoutSubscriptionId }
          : {}),
        stripePriceId: getPriceIdForPlan(env, resolvedPlan, resolvedInterval),
        plan: resolvedPlan,
        status,
        billingGateRequiredAt: null,
        pendingCheckoutSessionId: null,
        pendingCheckoutPlan: null,
        pendingCheckoutInterval: null,
        pendingCheckoutCreatedAt: null,
        ...(isSubscriptionMode
          ? {
              trialStartedAt: new Date(),
              trialEndingReminderSentAt: null,
            }
          : {}),
      });
      await recordBillingPlanAuditEvent(db, {
        subscription: updated,
        sourceEventType: event.type,
        stripeEventId: event.id,
        actorUserId: userId,
      });
    }
    return;
  }

  if (event.type === "invoice.payment_succeeded") {
    const object = event.data.object;
    const customerId = String(object.customer ?? "");
    if (!customerId) {
      return;
    }
    if (isZeroAmountSubscriptionCreationInvoice(object)) {
      return;
    }
    const stripeSubscriptionId = getInvoiceSubscriptionId(object);
    if (stripeSubscriptionId) {
      const existing = await loadSubscriptionByCustomerId(db, customerId);
      if (!canApplyStripeInvoiceEvent(existing, stripeSubscriptionId)) {
        return;
      }
    }
    const updated = await updateSubscriptionByCustomerId(db, customerId, {
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
      status: "active",
      billingGateRequiredAt: null,
      pendingCheckoutSessionId: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
    });

    if (updated) {
      await recordBillingPlanAuditEvent(db, {
        subscription: updated,
        sourceEventType: event.type,
        stripeEventId: event.id,
      });
      return;
    }

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      // Customer was deleted in Stripe; nothing to process
      return;
    }
    const userId = customer.metadata.userId ?? null;
    const priceId = getInvoicePriceId(object, env);
    if (!userId || !priceId) {
      return;
    }

    if (await isStaleCustomerForUser(db, userId, customerId)) {
      console.warn(
        "[billing] ignoring invoice payment succeeded for stale Stripe customer",
        {
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        },
      );
      return;
    }
    if (!(await userExists(db, userId))) {
      console.warn(
        "[billing] ignoring invoice payment succeeded for missing user",
        {
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        },
      );
      return;
    }

    const hydrated = await upsertSubscriptionByCustomerId(
      db,
      customerId,
      {
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
        stripePriceId: priceId,
        plan: resolvePlanFromPriceId(env, priceId),
        status: "active",
        billingGateRequiredAt: null,
        pendingCheckoutSessionId: null,
        pendingCheckoutPlan: null,
        pendingCheckoutInterval: null,
        pendingCheckoutCreatedAt: null,
      },
      userId,
    );
    await recordBillingPlanAuditEvent(db, {
      subscription: hydrated,
      sourceEventType: event.type,
      stripeEventId: event.id,
    });
    return;
  }

  if (event.type === "invoice.payment_failed") {
    const object = event.data.object;
    const customerId = String(object.customer ?? "");
    if (!customerId) {
      return;
    }
    const stripeSubscriptionId = getInvoiceSubscriptionId(object);
    if (stripeSubscriptionId) {
      const existing = await loadSubscriptionByCustomerId(db, customerId);
      if (!canApplyStripeInvoiceEvent(existing, stripeSubscriptionId)) {
        return;
      }
    }
    const updated = await updateSubscriptionByCustomerId(db, customerId, {
      ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
      status: "past_due",
      pendingCheckoutSessionId: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
    });

    if (updated) {
      await recordBillingPlanAuditEvent(db, {
        subscription: updated,
        sourceEventType: event.type,
        stripeEventId: event.id,
      });
      return;
    }

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      // Customer was deleted in Stripe; nothing to process
      return;
    }
    const userId = customer.metadata.userId ?? null;
    const priceId = getInvoicePriceId(object, env);
    if (!userId || !priceId) {
      return;
    }

    if (await isStaleCustomerForUser(db, userId, customerId)) {
      console.warn(
        "[billing] ignoring invoice payment failed for stale Stripe customer",
        {
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        },
      );
      return;
    }
    if (!(await userExists(db, userId))) {
      console.warn(
        "[billing] ignoring invoice payment failed for missing user",
        {
          stripeCustomerId: customerId,
          userId,
          stripeEventId: event.id,
          sourceEventType: event.type,
        },
      );
      return;
    }

    const hydrated = await upsertSubscriptionByCustomerId(
      db,
      customerId,
      {
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
        stripePriceId: priceId,
        plan: resolvePlanFromPriceId(env, priceId),
        status: "past_due",
        pendingCheckoutSessionId: null,
        pendingCheckoutPlan: null,
        pendingCheckoutInterval: null,
        pendingCheckoutCreatedAt: null,
      },
      userId,
    );
    await recordBillingPlanAuditEvent(db, {
      subscription: hydrated,
      sourceEventType: event.type,
      stripeEventId: event.id,
    });
    return;
  }

  if (
    event.type === "charge.refunded" ||
    event.type === "charge.dispute.created"
  ) {
    // Only downgrade lifetime purchases on refund/dispute. Subscription refunds
    // are handled by the subscription lifecycle events (canceled, past_due).
    //
    // H4 fix: Stripe charge objects do NOT automatically inherit checkout session
    // metadata, so relying on object.metadata.plan would miss real lifetime refunds.
    // Instead, look up the subscription record by stripeCustomerId to determine
    // whether the customer holds a lifetime plan.
    const object = event.data.object;
    const customerId =
      typeof object.customer === "string" ? object.customer : null;
    if (!customerId) {
      return;
    }

    if (event.type === "charge.refunded" && !isFullChargeRefund(object)) {
      return;
    }

    const sub = await loadSubscriptionByCustomerId(db, customerId);
    if (sub?.plan !== "lifetime" && sub?.pendingCheckoutPlan !== "lifetime") {
      return;
    }

    // If no subscription row exists for this customer, updateSubscriptionByCustomerId
    // returns null and nothing is written. This is intentional: if the user is already
    // on free, there is nothing to downgrade and the no-op is safe.
    const updated = await updateSubscriptionByCustomerId(db, customerId, {
      plan: "free",
      status: "canceled",
      pendingCheckoutSessionId: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
    });
    await recordBillingPlanAuditEvent(db, {
      subscription: updated ?? sub,
      sourceEventType: event.type,
      stripeEventId: event.id,
    });
  }
}

async function recordBillingPlanAuditEvent(
  db: Pick<Database, "insert">,
  input: {
    subscription:
      | {
          userId?: string | null;
          stripeCustomerId?: string | null;
          plan?: BillingPlan | null;
          status?: string | null;
        }
      | null
      | undefined;
    sourceEventType: string;
    stripeEventId: string;
    actorUserId?: string | null;
  },
) {
  const userId = input.subscription?.userId;
  if (!userId) {
    return;
  }

  await recordAuditEvent(db, {
    actorUserId: input.actorUserId ?? null,
    eventType: "billing.plan.changed",
    targetType: "subscription",
    targetId: userId,
    metadata: {
      plan: input.subscription?.plan ?? null,
      status: input.subscription?.status ?? null,
      sourceEventType: input.sourceEventType,
      stripeEventId: input.stripeEventId,
      stripeCustomerId: input.subscription?.stripeCustomerId ?? null,
    },
  });
}

export function billingRoutes(
  db: Database,
  auth: Auth,
  stripe: StripeLike,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  const requireSession = sessionMiddleware(auth);

  app.get("/", requireSession, async (c) => {
    const user = c.get("user");
    const current = await loadSubscription(db, user.id);
    return c.json(buildBillingSummary(current));
  });

  app.get("/history", requireSession, async (c) => {
    const user = c.get("user");
    const current = await loadSubscription(db, user.id);

    if (!current?.stripeCustomerId) {
      const empty: BillingHistoryResponse = { items: [] };
      return c.json(empty);
    }

    return c.json(
      await loadBillingHistoryItems(stripe, current.stripeCustomerId),
    );
  });

  app.post("/checkout", requireSession, async (c) => {
    // Validate Stripe price env vars eagerly so a misconfigured deployment
    // fails before any DB lookup or Stripe API call.
    resolveStripePrices(c.env);

    const user = c.get("user");
    const { body, response } = await readJsonObjectBody(c);
    if (response) return response;

    const parsed = createCheckoutSessionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const priceId = getPriceIdForPlan(
      c.env,
      parsed.data.plan,
      parsed.data.interval,
    );
    const isLifetime = parsed.data.plan === "lifetime";
    const requestedInterval = normalizeCheckoutInterval(parsed.data.interval);

    const checkoutResult = await db.transaction(async (tx) => {
      // Keep the lock open until after Stripe Checkout session creation so a
      // second concurrent request cannot observe the same unlocked state and
      // create a duplicate subscription session for the same user.
      await tx.execute(
        sql`INSERT INTO subscription (user_id, plan, status)
            VALUES (${user.id}, 'free', 'inactive')
            ON CONFLICT (user_id) DO NOTHING`,
      );
      await tx.execute(
        sql`SELECT user_id FROM subscription WHERE user_id = ${user.id} FOR UPDATE`,
      );

      const existingSub = await loadSubscription(tx, user.id);
      // A free-plan record may carry status "active" as a placeholder (no real
      // Stripe subscription behind it), so we intentionally allow checkout to
      // proceed for active+free users rather than treating them as already
      // subscribed.
      if (
        existingSub &&
        (existingSub.status === "active" ||
          existingSub.status === "trialing") &&
        existingSub.plan !== "free"
      ) {
        return { kind: "already-subscribed" as const };
      }

      if (
        existingSub?.pendingCheckoutSessionId &&
        isPendingCheckoutFresh(existingSub.pendingCheckoutCreatedAt)
      ) {
        const pendingInterval = normalizeCheckoutInterval(
          existingSub.pendingCheckoutInterval ?? undefined,
        );
        if (
          existingSub.pendingCheckoutPlan === parsed.data.plan &&
          pendingInterval === requestedInterval
        ) {
          if (stripe.checkout.sessions.retrieve) {
            const existingSession = await stripe.checkout.sessions.retrieve(
              existingSub.pendingCheckoutSessionId,
            );
            if (existingSession.url) {
              return { kind: "ok" as const, url: existingSession.url };
            }
          }
          return {
            kind: "checkout-in-progress" as const,
            plan: existingSub.pendingCheckoutPlan,
            interval: pendingInterval,
          };
        }

        return {
          kind: "checkout-in-progress" as const,
          plan: existingSub.pendingCheckoutPlan,
          interval: pendingInterval,
        };
      }

      if (existingSub?.pendingCheckoutSessionId) {
        const pendingSessionId = existingSub.pendingCheckoutSessionId;
        const pendingInterval = normalizeCheckoutInterval(
          existingSub.pendingCheckoutInterval,
        );
        let pendingStatus: string | null = null;
        if (stripe.checkout.sessions.retrieve) {
          try {
            const retrieved =
              await stripe.checkout.sessions.retrieve(pendingSessionId);
            pendingStatus = retrieved.status ?? null;
          } catch {
            pendingStatus = null;
          }
        }

        if (pendingStatus === "complete") {
          return {
            kind: "checkout-in-progress" as const,
            plan: existingSub.pendingCheckoutPlan,
            interval: pendingInterval,
          };
        }

        if (pendingStatus !== "expired") {
          if (!stripe.checkout.sessions.expire) {
            return {
              kind: "checkout-in-progress" as const,
              plan: existingSub.pendingCheckoutPlan,
              interval: pendingInterval,
            };
          }
          try {
            const expired =
              await stripe.checkout.sessions.expire(pendingSessionId);
            pendingStatus = expired.status ?? null;
          } catch {
            if (stripe.checkout.sessions.retrieve) {
              try {
                const refreshed =
                  await stripe.checkout.sessions.retrieve(pendingSessionId);
                pendingStatus = refreshed.status ?? null;
              } catch {
                pendingStatus = null;
              }
            }
            if (pendingStatus !== "expired") {
              return {
                kind: "checkout-in-progress" as const,
                plan: existingSub.pendingCheckoutPlan,
                interval: pendingInterval,
              };
            }
          }
        }

        await upsertSubscription(tx, user.id, {
          pendingCheckoutSessionId: null,
          pendingCheckoutPlan: null,
          pendingCheckoutInterval: null,
          pendingCheckoutCreatedAt: null,
        });
      }

      const checkoutIdempotencyState =
        buildCheckoutIdempotencyState(existingSub);
      const customerId = await ensureStripeCustomer(
        tx,
        stripe,
        user,
        `customer:${user.id}:${checkoutIdempotencyState}`,
      );
      const returnToSubscribe = isBillingGateRequired(existingSub);
      const session = await createCheckoutSession(
        stripe,
        {
          customer: customerId,
          mode: isLifetime ? "payment" : "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: returnToSubscribe
            ? buildAppCheckoutReturnUrl(
                c.env.APP_URL,
                "success",
                parsed.data.plan,
                requestedInterval,
              )
            : buildCheckoutRedirectUrl(
                c.env.STRIPE_CHECKOUT_SUCCESS_URL,
                parsed.data.plan,
                requestedInterval,
              ),
          cancel_url: returnToSubscribe
            ? buildAppCheckoutReturnUrl(
                c.env.APP_URL,
                "cancel",
                parsed.data.plan,
                requestedInterval,
              )
            : buildCheckoutRedirectUrl(
                c.env.STRIPE_CHECKOUT_CANCEL_URL,
                parsed.data.plan,
                requestedInterval,
              ),
          metadata: {
            userId: user.id,
            plan: parsed.data.plan,
            interval: requestedInterval,
          },
          ...(isLifetime
            ? {}
            : {
                payment_method_collection: "always" as const,
              }),
        },
        buildCheckoutIdempotencyKey(
          user.id,
          parsed.data.plan,
          requestedInterval,
          checkoutIdempotencyState,
        ),
      );

      if (!session.url) {
        return { kind: "stripe-unavailable" as const };
      }

      if (isE2eAllowed(c.env)) {
        await upsertSubscription(tx, user.id, {
          stripeCustomerId: customerId,
          stripePriceId: priceId,
          plan: parsed.data.plan,
          status: isLifetime ? "active" : "trialing",
          currentPeriodEnd: null,
          billingGateRequiredAt: null,
          pendingCheckoutSessionId: null,
          pendingCheckoutPlan: null,
          pendingCheckoutInterval: null,
          pendingCheckoutCreatedAt: null,
          ...(isLifetime ? {} : { trialStartedAt: new Date() }),
        });
      } else {
        await upsertSubscription(tx, user.id, {
          stripeCustomerId: customerId,
          pendingCheckoutSessionId: session.id,
          pendingCheckoutPlan: parsed.data.plan,
          pendingCheckoutInterval: requestedInterval,
          pendingCheckoutCreatedAt: new Date(),
        });
      }

      return { kind: "ok" as const, url: session.url };
    });

    if (checkoutResult.kind === "already-subscribed") {
      return c.json({ error: "Already subscribed" }, 409);
    }

    if (checkoutResult.kind === "stripe-unavailable") {
      return c.json({ error: "Stripe checkout is unavailable." }, 502);
    }

    if (checkoutResult.kind === "checkout-in-progress") {
      return c.json(
        {
          error:
            "A checkout session is already in progress. Complete or wait for it to expire before switching plans.",
          checkoutInProgress: true,
          plan: checkoutResult.plan,
          interval: checkoutResult.interval,
        },
        409,
      );
    }

    return c.json({ url: checkoutResult.url });
  });

  app.post("/portal", requireSession, async (c) => {
    const user = c.get("user");
    const current = await loadSubscription(db, user.id);
    const { body, response } = await readOptionalJsonObjectBody(c);
    if (response) return response;

    const parsed = billingPortalRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    if (!current?.stripeCustomerId) {
      return c.json({ error: "No billing profile found." }, 400);
    }

    const returnPath =
      parsed.data?.returnTarget === "subscribe" ? "/subscribe" : "/settings";

    const portalResult = await createBillingPortalSession(stripe, {
      customer: current.stripeCustomerId,
      return_url: new URL(
        returnPath,
        c.env.STRIPE_PORTAL_RETURN_URL,
      ).toString(),
    });
    if (portalResult.kind === "missing-customer") {
      return c.json({ error: "Billing profile not found." }, 400);
    }

    const { session } = portalResult;
    if (!session.url) {
      return c.json({ error: "Stripe billing portal is unavailable." }, 502);
    }

    return c.json({ url: session.url });
  });

  app.post("/webhook", async (c) => {
    if (!c.env.STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return c.json({ error: "Webhook secret not configured." }, 500);
    }

    // Validate Stripe price env vars eagerly so a misconfigured deployment
    // fails before signature verification or any DB transaction.
    resolveStripePrices(c.env);

    const signature = c.req.header("stripe-signature");
    if (!signature) {
      return c.json({ error: "Missing Stripe signature." }, 400);
    }

    const payload = await c.req.text();

    let event: StripeEvent;
    try {
      event = await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        c.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error(
        "Stripe webhook signature verification failed:",
        summarizeCaughtError(err),
      );
      return c.json({ error: "Invalid Stripe signature." }, 400);
    }

    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(processedWebhookEvent)
        .values({
          eventId: event.id,
          type: event.type,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted.length === 0) {
        return "duplicate";
      }

      await applyWebhookEvent(tx, stripe, event, c.env);
      return "processed";
    });

    // Fire-and-forget TTL cleanup. This runs maintenance work after the
    // idempotency insert, so it never blocks the webhook response. Errors are
    // intentionally swallowed: cleanup failures are non-critical.
    // When a Cloudflare ExecutionContext waitUntil callback is provided the
    // cleanup promise is handed off so the runtime keeps the Worker alive
    // until it settles; otherwise it runs as a plain fire-and-forget.
    const cleanupPromise = cleanupOldProcessedEvents(db).catch((err) => {
      console.warn(
        "Failed to clean up old Stripe webhook events:",
        summarizeCaughtError(err),
      );
    });
    if (waitUntil) {
      waitUntil(cleanupPromise);
    } else {
      void cleanupPromise;
    }

    if (result === "duplicate") {
      return c.json({ received: true });
    }

    return c.json({ received: true });
  });

  return app;
}
