import { describe, expect, it, vi } from "vitest";
import {
  buildBillingSummary,
  cleanupOldProcessedEvents,
  dispatchTrialEndingReminders,
  expireElapsedFreeTrials,
  getEffectiveBillingPlan,
  getPriceIdForPlan,
  getWeddingOwnerId,
  getWeddingOwnerSubscription,
  getWeddingPlan,
  hasActiveBillingStatus,
  hasPaidPlanAccess,
  isBillingGateRequired,
  isInActiveTrial,
  loadSubscription,
  loadSubscriptionByCustomerId,
  normalizeBillingStatus,
  resolveIntervalFromPriceId,
  resolvePlanFromPriceId,
  resolveStripePrices,
  subscriptionHasFeatureAccess,
  upsertStripeCustomerId,
  upsertSubscriptionByCustomerId,
  upsertSubscription,
  updateSubscriptionByCustomerId,
} from "../../src/lib/billing";
import type { StripeLike } from "../../src/lib/stripe";
import {
  TEST_STRIPE_PRICE_ENV,
  TEST_STRIPE_PRICE_IDS,
} from "../helpers/stripe-env";
import { STRIPE_PRICE_ENV_KEYS } from "@kaiplan/shared";

const ENV = {
  ...TEST_STRIPE_PRICE_ENV,
};

function makeStripe(
  upcomingInvoice: { amount_due: number; currency: string } = {
    amount_due: 35000,
    currency: "usd",
  },
): StripeLike {
  return {
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
    invoices: {
      retrieveUpcoming: vi.fn().mockResolvedValue(upcomingInvoice),
      list: vi.fn(),
    },
    paymentIntents: {
      list: vi.fn(),
    },
    webhooks: {
      constructEventAsync: vi.fn(),
    },
  };
}

function makeSelectBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue({
    then: (fn: (rows: unknown) => unknown) => Promise.resolve(fn(resolveWith)),
  });
  return builder;
}

function makeJoinSelectBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  builder.from = vi.fn().mockReturnValue(builder);
  builder.innerJoin = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) => Promise.resolve(resolveWith).then(onFulfilled, onRejected);
  return builder;
}

function makeInsertChain(returnValue: unknown) {
  return {
    onConflictDoUpdate: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnValue),
    }),
    returning: vi.fn().mockResolvedValue(returnValue),
  };
}

function makeReminderUpdate(returningRows: unknown[] = [{ userId: "user-1" }]) {
  const where = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue(returningRows),
  });
  const set = vi.fn().mockReturnValue({ where });
  return { set, where, update: vi.fn().mockReturnValue({ set }) };
}

function collectSqlColumnNames(value: unknown, seen = new Set<unknown>()) {
  const names = new Set<string>();
  if (!value || typeof value !== "object" || seen.has(value)) {
    return names;
  }
  seen.add(value);

  const maybeColumn = value as { name?: unknown; queryChunks?: unknown[] };
  if (typeof maybeColumn.name === "string") {
    names.add(maybeColumn.name);
  }
  for (const chunk of maybeColumn.queryChunks ?? []) {
    for (const name of collectSqlColumnNames(chunk, seen)) {
      names.add(name);
    }
  }
  return names;
}

describe("resolveStripePrices", () => {
  it("returns the typed Stripe price map from a complete env", () => {
    const prices = resolveStripePrices(ENV);
    expect(prices).toEqual(TEST_STRIPE_PRICE_IDS);
  });

  it("throws a descriptive error when the Starter monthly price id is missing", () => {
    const partial = { ...ENV, [STRIPE_PRICE_ENV_KEYS.starter.month]: "" };
    expect(() => resolveStripePrices(partial)).toThrow(
      new RegExp(STRIPE_PRICE_ENV_KEYS.starter.month),
    );
  });

  it("throws when a price ID does not start with price_", () => {
    const bogus = {
      ...ENV,
      [STRIPE_PRICE_ENV_KEYS.lifetime.month]: "lifetime_123",
    };
    expect(() => resolveStripePrices(bogus)).toThrow(
      new RegExp(STRIPE_PRICE_ENV_KEYS.lifetime.month),
    );
  });

  it("throws when an annual price ID is missing", () => {
    const partial = {
      ...ENV,
      [STRIPE_PRICE_ENV_KEYS.pro.year]: undefined,
    } as unknown as typeof ENV;
    expect(() => resolveStripePrices(partial)).toThrow(
      new RegExp(STRIPE_PRICE_ENV_KEYS.pro.year),
    );
  });
});

describe("billing helpers", () => {
  it("normalizes Stripe statuses and billing access", () => {
    expect(normalizeBillingStatus(null)).toBe("inactive");
    expect(normalizeBillingStatus("trialing")).toBe("trialing");
    expect(normalizeBillingStatus("incomplete")).toBe("inactive");
    expect(normalizeBillingStatus("unknown")).toBe("inactive");
    expect(hasActiveBillingStatus("active")).toBe(true);
    expect(hasActiveBillingStatus("trialing")).toBe(true);
    expect(hasActiveBillingStatus("past_due")).toBe(false);
  });

  it("resolves plans from Stripe prices", () => {
    expect(resolvePlanFromPriceId(ENV, undefined)).toBe("free");
    expect(resolvePlanFromPriceId(ENV, "price_starter")).toBe("starter");
    expect(resolvePlanFromPriceId(ENV, "price_pro")).toBe("pro");
    expect(resolvePlanFromPriceId(ENV, "price_lifetime")).toBe("lifetime");
    expect(resolvePlanFromPriceId(ENV, "price_unknown")).toBe("free");
    expect(getPriceIdForPlan(ENV, "starter")).toBe("price_starter");
    expect(getPriceIdForPlan(ENV, "pro")).toBe("price_pro");
    expect(getPriceIdForPlan(ENV, "lifetime")).toBe("price_lifetime");
  });

  it("resolves plans from annual Stripe price IDs", () => {
    expect(resolvePlanFromPriceId(ENV, "price_starter_annual")).toBe("starter");
    expect(resolvePlanFromPriceId(ENV, "price_pro_annual")).toBe("pro");
  });

  it("resolves billing intervals from Stripe price IDs", () => {
    expect(resolveIntervalFromPriceId(ENV, null)).toBeNull();
    expect(resolveIntervalFromPriceId(ENV, "price_starter")).toBe("month");
    expect(resolveIntervalFromPriceId(ENV, "price_lifetime")).toBe("month");
    expect(resolveIntervalFromPriceId(ENV, "price_pro_annual")).toBe("year");
    expect(resolveIntervalFromPriceId(ENV, "price_unknown")).toBeNull();
  });

  it("returns annual price IDs for year interval", () => {
    expect(getPriceIdForPlan(ENV, "starter", "year")).toBe(
      "price_starter_annual",
    );
    expect(getPriceIdForPlan(ENV, "pro", "year")).toBe("price_pro_annual");
  });

  it("returns monthly price ID for lifetime regardless of interval", () => {
    expect(getPriceIdForPlan(ENV, "lifetime", "year")).toBe("price_lifetime");
    expect(getPriceIdForPlan(ENV, "lifetime", "month")).toBe("price_lifetime");
  });

  it("defaults to monthly price when interval is not provided", () => {
    expect(getPriceIdForPlan(ENV, "starter")).toBe("price_starter");
    expect(getPriceIdForPlan(ENV, "pro")).toBe("price_pro");
  });

  it("drops paid entitlements when the subscription is not active", () => {
    expect(getEffectiveBillingPlan(null)).toBe("free");
    expect(getEffectiveBillingPlan({ plan: "pro", status: "past_due" })).toBe(
      "free",
    );
    expect(
      subscriptionHasFeatureAccess(
        { plan: "pro", status: "past_due" },
        "vendors",
      ),
    ).toBe(false);
    expect(
      subscriptionHasFeatureAccess(
        { plan: "pro", status: "active" },
        "vendors",
      ),
    ).toBe(true);
  });

  it("builds billing summaries from subscription state", () => {
    expect(buildBillingSummary(null)).toEqual({
      plan: "free",
      status: "inactive",
      stripeCustomerId: null,
      currentPeriodEnd: null,
      billingGateRequired: false,
      features: [],
      canManageBilling: false,
      trialDaysRemaining: null,
      featuresUsed: [],
    });

    expect(
      buildBillingSummary({
        plan: "pro",
        status: "active",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
        trialStartedAt: null,
      }),
    ).toMatchObject({
      plan: "pro",
      status: "active",
      stripeCustomerId: "cus_123",
      billingGateRequired: false,
      features: ["vendors", "extraPlanner", "weddingWebsite"],
      canManageBilling: true,
      trialDaysRemaining: null,
    });

    expect(
      buildBillingSummary({
        plan: "pro",
        status: "canceled",
        stripeCustomerId: null,
        currentPeriodEnd: null,
        trialStartedAt: null,
      }),
    ).toMatchObject({
      billingGateRequired: false,
      features: [],
      canManageBilling: false,
      trialDaysRemaining: null,
    });
  });

  it("marks billing summaries as gated only when the placeholder gate is still active", () => {
    expect(
      buildBillingSummary({
        plan: "free",
        status: "inactive",
        stripeCustomerId: null,
        currentPeriodEnd: null,
        billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
        trialStartedAt: null,
      }),
    ).toMatchObject({
      billingGateRequired: true,
      features: [],
      trialDaysRemaining: null,
    });
  });

  it("computes trialDaysRemaining for a free user with an active trial", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    const result = buildBillingSummary({
      plan: "free",
      status: "inactive",
      stripeCustomerId: null,
      currentPeriodEnd: null,
      billingGateRequiredAt: null,
      trialStartedAt: tenDaysAgo,
    });
    expect(result.trialDaysRemaining).toBe(20);
  });

  it("returns null trialDaysRemaining when the trial has expired", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86_400_000);
    const result = buildBillingSummary({
      plan: "free",
      status: "inactive",
      stripeCustomerId: null,
      currentPeriodEnd: null,
      billingGateRequiredAt: null,
      trialStartedAt: thirtyOneDaysAgo,
    });
    expect(result.trialDaysRemaining).toBeNull();
  });

  it("returns null trialDaysRemaining for a paid user even if trialStartedAt is set", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    const result = buildBillingSummary({
      plan: "pro",
      status: "active",
      stripeCustomerId: "cus_123",
      currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      billingGateRequiredAt: null,
      trialStartedAt: tenDaysAgo,
    });
    expect(result.trialDaysRemaining).toBeNull();
  });

  it("returns null trialDaysRemaining when trialStartedAt is null", () => {
    const result = buildBillingSummary({
      plan: "free",
      status: "inactive",
      stripeCustomerId: null,
      currentPeriodEnd: null,
      billingGateRequiredAt: null,
      trialStartedAt: null,
    });
    expect(result.trialDaysRemaining).toBeNull();
  });

  it("returns 1 trialDaysRemaining on the last day of the trial (day 29)", () => {
    const twentyNineDaysAgo = new Date(Date.now() - 29 * 86_400_000);
    const result = buildBillingSummary({
      plan: "free",
      status: "inactive",
      stripeCustomerId: null,
      currentPeriodEnd: null,
      billingGateRequiredAt: null,
      trialStartedAt: twentyNineDaysAgo,
    });
    expect(result.trialDaysRemaining).toBe(1);
  });

  it("returns 0 trialDaysRemaining on exactly day 30 (trial ends today)", () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const result = buildBillingSummary({
      plan: "free",
      status: "inactive",
      stripeCustomerId: null,
      currentPeriodEnd: null,
      billingGateRequiredAt: null,
      trialStartedAt: thirtyDaysAgo,
    });
    expect(result.trialDaysRemaining).toBe(0);
  });

  it("returns null trialDaysRemaining for trialing paid plan", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    const result = buildBillingSummary({
      plan: "starter",
      status: "trialing",
      stripeCustomerId: "cus_123",
      currentPeriodEnd: null,
      billingGateRequiredAt: null,
      trialStartedAt: tenDaysAgo,
    });
    expect(result.trialDaysRemaining).toBeNull();
  });
});

describe("billing db helpers", () => {
  it("loads subscriptions by user and customer", async () => {
    const userRow = { userId: "user-1", plan: "pro", status: "active" };
    const customerRow = {
      userId: "user-1",
      stripeCustomerId: "cus_123",
      plan: "pro",
      status: "active",
    };
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectBuilder([userRow]))
        .mockReturnValueOnce(makeSelectBuilder([customerRow])),
    };

    await expect(loadSubscription(db as never, "user-1")).resolves.toBe(
      userRow,
    );
    await expect(
      loadSubscriptionByCustomerId(db as never, "cus_123"),
    ).resolves.toBe(customerRow);
  });

  it("returns null when subscription queries miss", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectBuilder([]))
        .mockReturnValueOnce(makeSelectBuilder([])),
    };

    await expect(loadSubscription(db as never, "missing")).resolves.toBeNull();
    await expect(
      loadSubscriptionByCustomerId(db as never, "missing"),
    ).resolves.toBeNull();
  });

  it("upserts and updates subscription rows", async () => {
    const inserted = [{ userId: "user-1", stripeCustomerId: "cus_123" }];
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue(makeInsertChain(inserted)),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(inserted),
          }),
        }),
      }),
    };

    await expect(
      upsertStripeCustomerId(db as never, "user-1", "cus_123"),
    ).resolves.toEqual(inserted[0]);
    await expect(
      upsertSubscription(db as never, "user-1", {
        stripeCustomerId: "cus_123",
        plan: "lifetime",
        status: "active",
      }),
    ).resolves.toEqual(inserted[0]);
    await expect(
      updateSubscriptionByCustomerId(db as never, "cus_123", {
        status: "past_due",
      }),
    ).resolves.toEqual(inserted[0]);
  });

  it("creates a subscription row when a customer lookup needs hydration", async () => {
    const inserted = [
      { userId: "user-1", stripeCustomerId: "cus_123", plan: "pro" },
    ];
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue(makeInsertChain(inserted)),
      }),
    };

    await expect(
      upsertSubscriptionByCustomerId(
        db as never,
        "cus_123",
        {
          plan: "pro",
          status: "active",
        },
        "user-1",
      ),
    ).resolves.toEqual(inserted[0]);
  });

  it("preserves gate and trial metadata when hydrating from a customer lookup", async () => {
    const inserted = [
      {
        userId: "user-1",
        stripeCustomerId: "cus_123",
        plan: "pro",
        trialStartedAt: new Date("2026-04-01T00:00:00.000Z"),
        trialEndingReminderSentAt: null,
        billingGateRequiredAt: null,
      },
    ];
    const values = vi.fn().mockReturnValue(makeInsertChain(inserted));
    const db = {
      insert: vi.fn().mockReturnValue({
        values,
      }),
    };
    const trialStartedAt = new Date("2026-04-01T00:00:00.000Z");

    await expect(
      upsertSubscriptionByCustomerId(
        db as never,
        "cus_123",
        {
          plan: "pro",
          status: "trialing",
          billingGateRequiredAt: null,
          trialStartedAt,
          trialEndingReminderSentAt: null,
        },
        "user-1",
      ),
    ).resolves.toEqual(inserted[0]);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: "cus_123",
        plan: "pro",
        status: "trialing",
        billingGateRequiredAt: null,
        trialStartedAt,
        trialEndingReminderSentAt: null,
      }),
    );
  });

  it("clears pending checkout metadata when hydrating from a customer lookup", async () => {
    const inserted = [
      {
        userId: "user-1",
        stripeCustomerId: "cus_123",
        plan: "pro",
        pendingCheckoutSessionId: null,
        pendingCheckoutPlan: null,
        pendingCheckoutInterval: null,
        pendingCheckoutCreatedAt: null,
      },
    ];
    const values = vi.fn().mockReturnValue(makeInsertChain(inserted));
    const db = {
      insert: vi.fn().mockReturnValue({
        values,
      }),
    };

    await expect(
      upsertSubscriptionByCustomerId(
        db as never,
        "cus_123",
        {
          plan: "pro",
          status: "active",
          pendingCheckoutSessionId: null,
          pendingCheckoutPlan: null,
          pendingCheckoutInterval: null,
          pendingCheckoutCreatedAt: null,
        },
        "user-1",
      ),
    ).resolves.toEqual(inserted[0]);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingCheckoutSessionId: null,
        pendingCheckoutPlan: null,
        pendingCheckoutInterval: null,
        pendingCheckoutCreatedAt: null,
      }),
    );
  });

  it("does not hydrate a customer lookup when no user id is available", async () => {
    const db = {
      insert: vi.fn(),
    };

    await expect(
      upsertSubscriptionByCustomerId(
        db as never,
        "cus_123",
        {
          plan: "pro",
          status: "active",
        },
        null,
      ),
    ).resolves.toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns null when billing writes do not return a row", async () => {
    const db = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue(makeInsertChain([])),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    await expect(
      upsertStripeCustomerId(db as never, "user-1", "cus_123"),
    ).resolves.toBeNull();
    await expect(
      upsertSubscription(db as never, "user-1", { plan: "pro" }),
    ).resolves.toBeNull();
    await expect(
      updateSubscriptionByCustomerId(db as never, "cus_123", {
        status: "active",
      }),
    ).resolves.toBeNull();
  });

  it("loads the wedding owner id", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValue(makeSelectBuilder([{ createdBy: "owner-1" }])),
    };

    await expect(getWeddingOwnerId(db as never, "wed-1")).resolves.toBe(
      "owner-1",
    );
  });

  it("loads the wedding owner subscription", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectBuilder([{ createdBy: "owner-1" }]))
        .mockReturnValueOnce(
          makeSelectBuilder([
            { userId: "owner-1", plan: "pro", status: "active" },
          ]),
        ),
    };

    await expect(
      getWeddingOwnerSubscription(db as never, "wed-1"),
    ).resolves.toMatchObject({
      userId: "owner-1",
      plan: "pro",
    });
  });

  it("loads the wedding plan", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectBuilder([{ createdBy: "owner-1" }]))
        .mockReturnValueOnce(
          makeSelectBuilder([
            { userId: "owner-1", plan: "pro", status: "active" },
          ]),
        ),
    };

    await expect(getWeddingPlan(db as never, "wed-1")).resolves.toBe("pro");
  });

  it("falls back to free when a wedding has no owner", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectBuilder([])),
    };

    await expect(getWeddingPlan(db as never, "wed-1")).resolves.toBe("free");
  });

  it("persists a trialing subscription created via webhook with current_period_end from trial_end", async () => {
    const trialEnd = new Date("2026-05-01T00:00:00.000Z");
    const inserted = [
      {
        userId: "user-1",
        stripeCustomerId: "cus_trial",
        stripePriceId: "price_pro",
        plan: "pro",
        status: "trialing",
        currentPeriodEnd: trialEnd,
      },
    ];
    const values = vi.fn().mockReturnValue(makeInsertChain(inserted));
    const db = {
      insert: vi.fn().mockReturnValue({ values }),
    };

    // Simulate customer.subscription.created payload fields. Stripe sets
    // current_period_end = trial_end while the sub is trialing.
    const stripeStatus = "trialing";
    const result = await upsertSubscriptionByCustomerId(
      db as never,
      "cus_trial",
      {
        stripePriceId: "price_pro",
        plan: resolvePlanFromPriceId(ENV, "price_pro"),
        status: normalizeBillingStatus(stripeStatus),
        currentPeriodEnd: trialEnd,
      },
      "user-1",
    );

    expect(result).toEqual(inserted[0]);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        stripeCustomerId: "cus_trial",
        stripePriceId: "price_pro",
        plan: "pro",
        status: "trialing",
        currentPeriodEnd: trialEnd,
      }),
    );
  });

  it("flips trialing to active and updates currentPeriodEnd on subscription.updated", async () => {
    const newPeriodEnd = new Date("2026-06-01T00:00:00.000Z");
    const updated = [
      {
        userId: "user-1",
        stripeCustomerId: "cus_trial",
        plan: "pro",
        status: "active",
        currentPeriodEnd: newPeriodEnd,
      },
    ];
    const setSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(updated),
      }),
    });
    const db = {
      update: vi.fn().mockReturnValue({ set: setSpy }),
    };

    const result = await updateSubscriptionByCustomerId(
      db as never,
      "cus_trial",
      {
        status: normalizeBillingStatus("active"),
        currentPeriodEnd: newPeriodEnd,
      },
    );

    expect(result).toEqual(updated[0]);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "active",
        currentPeriodEnd: newPeriodEnd,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("cleanupOldProcessedEvents deletes processed webhook events older than the cutoff", async () => {
    // Build a select builder that returns rows with ids so the delete runs.
    function makeCleanupSelectBuilder(rows: { id: string }[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn().mockReturnValue(builder);
      builder.where = vi.fn().mockReturnValue(builder);
      builder.limit = vi.fn().mockResolvedValue(rows);
      return builder;
    }

    const selectSpy = vi
      .fn()
      .mockImplementation(() =>
        makeCleanupSelectBuilder([{ eventId: "evt-1" }]),
      );

    const where1 = vi.fn().mockResolvedValue(undefined);
    const deleteSpy = vi.fn().mockReturnValue({ where: where1 });
    const db = { select: selectSpy, delete: deleteSpy };

    await cleanupOldProcessedEvents(db as never, 7);

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(where1).toHaveBeenCalledTimes(1);
  });

  it("cleanupOldProcessedEvents defaults to a 7-day TTL", async () => {
    const before = Date.now();

    function makeCleanupSelectBuilder(rows: { id: string }[]) {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn().mockReturnValue(builder);
      builder.where = vi.fn().mockReturnValue(builder);
      builder.limit = vi.fn().mockResolvedValue(rows);
      return builder;
    }

    const db = {
      select: vi
        .fn()
        .mockImplementation(() =>
          makeCleanupSelectBuilder([{ eventId: "evt-1" }]),
        ),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await cleanupOldProcessedEvents(db as never);
    const after = Date.now();

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(before).toBeLessThanOrEqual(after);
  });

  it("cleanupOldProcessedEvents skips delete when no rows match", async () => {
    function makeEmptySelectBuilder() {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn().mockReturnValue(builder);
      builder.where = vi.fn().mockReturnValue(builder);
      builder.limit = vi.fn().mockResolvedValue([]);
      return builder;
    }

    const selectSpy = vi
      .fn()
      .mockImplementation(() => makeEmptySelectBuilder());
    const deleteSpy = vi.fn();
    const db = { select: selectSpy, delete: deleteSpy };

    await cleanupOldProcessedEvents(db as never, 7);

    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("returns null or free when the owner has no subscription", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(makeSelectBuilder([{ createdBy: "owner-1" }]))
        .mockReturnValueOnce(makeSelectBuilder([]))
        .mockReturnValueOnce(makeSelectBuilder([{ createdBy: "owner-1" }]))
        .mockReturnValueOnce(makeSelectBuilder([])),
    };

    await expect(
      getWeddingOwnerSubscription(db as never, "wed-1"),
    ).resolves.toBeNull();
    await expect(getWeddingPlan(db as never, "wed-1")).resolves.toBe("free");
  });

  it("sends one trial reminder with the fallback trial-start date and yearly price label", async () => {
    const rows = [
      {
        userId: "user-1",
        email: "trial@example.com",
        name: "Trial User",
        plan: "pro",
        stripeCustomerId: "cus_trial_1",
        stripePriceId: "price_pro_annual",
        currentPeriodEnd: new Date("2026-05-23T10:00:00.000Z"),
        trialStartedAt: null,
      },
    ];
    const update = makeReminderUpdate([{ userId: "user-1" }]);
    const db = {
      select: vi.fn().mockReturnValue(makeJoinSelectBuilder(rows)),
      update: update.update,
    };
    const emailService = {
      sendTrialEndingReminder: vi.fn().mockResolvedValue(undefined),
    };
    const stripe = makeStripe({ amount_due: 28000, currency: "usd" });

    await dispatchTrialEndingReminders(
      db as never,
      {
        APP_URL: "https://app.kaiplan.test/",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-20T12:00:00.000Z"),
    );

    expect(emailService.sendTrialEndingReminder).toHaveBeenCalledWith({
      email: "trial@example.com",
      name: "Trial User",
      planName: "Pro",
      trialStartedOn: "April 23, 2026",
      chargeOn: "May 23, 2026",
      amountLabel: "$280.00/year",
      manageBillingUrl: "https://app.kaiplan.test/settings",
    });
    expect(stripe.invoices.retrieveUpcoming).toHaveBeenCalledWith({
      customer: "cus_trial_1",
    });
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(update.set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trialEndingReminderClaimedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(update.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        trialEndingReminderSentAt: expect.any(Date),
        trialEndingReminderClaimedAt: null,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("skips reminder rows that are missing a current period end", async () => {
    const db = {
      select: vi.fn().mockReturnValue(
        makeJoinSelectBuilder([
          {
            userId: "user-1",
            email: "trial@example.com",
            name: "Trial User",
            plan: "starter",
            stripeCustomerId: "cus_trial_2",
            stripePriceId: "price_starter",
            currentPeriodEnd: null,
            trialStartedAt: null,
          },
        ]),
      ),
      update: vi.fn(),
    };
    const emailService = {
      sendTrialEndingReminder: vi.fn().mockResolvedValue(undefined),
    };
    const stripe = makeStripe();

    await dispatchTrialEndingReminders(
      db as never,
      {
        APP_URL: "https://app.kaiplan.test",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-20T12:00:00.000Z"),
    );

    expect(emailService.sendTrialEndingReminder).not.toHaveBeenCalled();
    expect(stripe.invoices.retrieveUpcoming).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("uses the existing trial start and previewed charge amount when reminder metadata is incomplete", async () => {
    const rows = [
      {
        userId: "user-2",
        email: "starter@example.com",
        name: "Starter User",
        plan: "starter",
        stripeCustomerId: "cus_trial_3",
        stripePriceId: "price_unknown",
        currentPeriodEnd: new Date("2026-05-23T10:00:00.000Z"),
        trialStartedAt: new Date("2026-04-24T00:00:00.000Z"),
      },
    ];
    const update = makeReminderUpdate([{ userId: "user-2" }]);
    const db = {
      select: vi.fn().mockReturnValue(makeJoinSelectBuilder(rows)),
      update: update.update,
    };
    const emailService = {
      sendTrialEndingReminder: vi.fn().mockResolvedValue(undefined),
    };
    const stripe = makeStripe({ amount_due: 1500, currency: "usd" });

    await dispatchTrialEndingReminders(
      db as never,
      {
        APP_URL: "https://app.kaiplan.test",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-20T12:00:00.000Z"),
    );

    expect(emailService.sendTrialEndingReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        planName: "Starter",
        trialStartedOn: "April 24, 2026",
        amountLabel: "$15.00/month",
      }),
    );
  });

  it("leaves reminder rows unsent when Stripe preview fails", async () => {
    const update = makeReminderUpdate([{ userId: "user-4" }]);
    const db = {
      select: vi.fn().mockReturnValue(
        makeJoinSelectBuilder([
          {
            userId: "user-4",
            email: "trial@example.com",
            name: "Trial User",
            plan: "starter",
            stripeCustomerId: "cus_trial_4",
            stripePriceId: "price_starter",
            currentPeriodEnd: new Date("2026-05-23T10:00:00.000Z"),
            trialStartedAt: null,
          },
        ]),
      ),
      update: update.update,
    };
    const emailService = {
      sendTrialEndingReminder: vi.fn().mockResolvedValue(undefined),
    };
    const stripe = makeStripe();
    vi.mocked(stripe.invoices.retrieveUpcoming!).mockRejectedValue(
      new Error("preview failed"),
    );

    await dispatchTrialEndingReminders(
      db as never,
      {
        APP_URL: "https://app.kaiplan.test",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-20T12:00:00.000Z"),
    );

    expect(emailService.sendTrialEndingReminder).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(2);
    expect(update.set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        trialEndingReminderClaimedAt: null,
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("retries missed trial reminders on the next scheduled run", async () => {
    const row = {
      userId: "user-5",
      email: "retry@example.com",
      name: "Retry User",
      plan: "starter",
      stripeCustomerId: "cus_trial_5",
      stripePriceId: "price_starter",
      currentPeriodEnd: new Date("2026-05-23T10:00:00.000Z"),
      trialStartedAt: null,
    };
    const firstUpdate = makeReminderUpdate([{ userId: "user-5" }]);
    const secondUpdate = makeReminderUpdate([{ userId: "user-5" }]);
    const firstDb = {
      select: vi.fn().mockReturnValue(makeJoinSelectBuilder([row])),
      update: firstUpdate.update,
    };
    const secondDb = {
      select: vi.fn().mockReturnValue(makeJoinSelectBuilder([row])),
      update: secondUpdate.update,
    };
    const emailService = {
      sendTrialEndingReminder: vi.fn().mockResolvedValue(undefined),
    };
    const stripe = makeStripe();
    vi.mocked(stripe.invoices.retrieveUpcoming!)
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockResolvedValueOnce({ amount_due: 35000, currency: "usd" });

    await dispatchTrialEndingReminders(
      firstDb as never,
      {
        APP_URL: "https://app.kaiplan.test",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-20T12:00:00.000Z"),
    );
    await dispatchTrialEndingReminders(
      secondDb as never,
      {
        APP_URL: "https://app.kaiplan.test",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-21T12:00:00.000Z"),
    );

    expect(emailService.sendTrialEndingReminder).toHaveBeenCalledTimes(1);
  });

  it("recovers stale trial reminder claims", async () => {
    const staleClaimedRow = {
      userId: "user-7",
      email: "stale-claim@example.com",
      name: "Stale Claim User",
      plan: "starter",
      stripeCustomerId: "cus_trial_7",
      stripePriceId: "price_starter",
      currentPeriodEnd: new Date("2026-05-23T10:00:00.000Z"),
      trialStartedAt: null,
      trialEndingReminderClaimedAt: new Date("2026-05-20T00:00:00.000Z"),
    };
    const update = makeReminderUpdate([{ userId: "user-7" }]);
    const db = {
      select: vi.fn().mockReturnValue(makeJoinSelectBuilder([staleClaimedRow])),
      update: update.update,
    };
    const emailService = {
      sendTrialEndingReminder: vi.fn().mockResolvedValue(undefined),
    };
    const stripe = makeStripe();

    await dispatchTrialEndingReminders(
      db as never,
      {
        APP_URL: "https://app.kaiplan.test",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-20T12:00:00.000Z"),
    );

    expect(emailService.sendTrialEndingReminder).toHaveBeenCalledTimes(1);
    expect(update.set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        trialEndingReminderClaimedAt: new Date("2026-05-20T12:00:00.000Z"),
      }),
    );
  });

  it("skips rows already claimed by an overlapping trial reminder dispatch", async () => {
    const update = makeReminderUpdate([]);
    const db = {
      select: vi.fn().mockReturnValue(
        makeJoinSelectBuilder([
          {
            userId: "user-6",
            email: "claimed@example.com",
            name: "Claimed User",
            plan: "pro",
            stripeCustomerId: "cus_trial_6",
            stripePriceId: "price_pro",
            currentPeriodEnd: new Date("2026-05-23T10:00:00.000Z"),
            trialStartedAt: null,
          },
        ]),
      ),
      update: update.update,
    };
    const emailService = {
      sendTrialEndingReminder: vi.fn().mockResolvedValue(undefined),
    };
    const stripe = makeStripe();

    await dispatchTrialEndingReminders(
      db as never,
      {
        APP_URL: "https://app.kaiplan.test",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-20T12:00:00.000Z"),
    );

    expect(emailService.sendTrialEndingReminder).not.toHaveBeenCalled();
    expect(stripe.invoices.retrieveUpcoming).not.toHaveBeenCalled();
  });

  it("claims trial reminders only while the row is still eligible", async () => {
    const update = makeReminderUpdate([]);
    const db = {
      select: vi.fn().mockReturnValue(
        makeJoinSelectBuilder([
          {
            userId: "user-8",
            email: "eligibility@example.com",
            name: "Eligible User",
            plan: "pro",
            stripeCustomerId: "cus_trial_8",
            stripePriceId: "price_pro",
            currentPeriodEnd: new Date("2026-05-23T10:00:00.000Z"),
            trialStartedAt: null,
          },
        ]),
      ),
      update: update.update,
    };
    const emailService = {
      sendTrialEndingReminder: vi.fn().mockResolvedValue(undefined),
    };
    const stripe = makeStripe();

    await dispatchTrialEndingReminders(
      db as never,
      {
        APP_URL: "https://app.kaiplan.test",
        ...ENV,
      },
      stripe,
      emailService,
      new Date("2026-05-20T12:00:00.000Z"),
    );

    const claimWhere = update.where.mock.calls[0]?.[0];
    expect(Array.from(collectSqlColumnNames(claimWhere))).toEqual(
      expect.arrayContaining([
        "user_id",
        "plan",
        "status",
        "current_period_end",
        "trial_ending_reminder_sent_at",
        "trial_ending_reminder_claimed_at",
      ]),
    );
  });
});

describe("expireElapsedFreeTrials", () => {
  function makeSelectForExpiry(rows: { userId: string }[]) {
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn().mockReturnValue(builder);
    builder.where = vi.fn().mockReturnValue(builder);
    builder.limit = vi.fn().mockResolvedValue(rows);
    return builder;
  }

  function makeUpdateForExpiry(rowCount: number) {
    return {
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount }),
      }),
    };
  }

  it("gates subscriptions whose free trial has elapsed and returns the count", async () => {
    const rows = [{ userId: "user-1" }, { userId: "user-2" }];
    const updateSpy = makeUpdateForExpiry(2);
    const db = {
      select: vi.fn().mockReturnValue(makeSelectForExpiry(rows)),
      update: vi.fn().mockReturnValue(updateSpy),
    };

    const count = await expireElapsedFreeTrials(db as never);

    expect(count).toBe(2);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(updateSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({
        billingGateRequiredAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
  });

  it("returns 0 when no subscriptions qualify", async () => {
    const db = {
      select: vi.fn().mockReturnValue(makeSelectForExpiry([])),
      update: vi.fn(),
    };

    const count = await expireElapsedFreeTrials(db as never);

    expect(count).toBe(0);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("accepts an optional now parameter for deterministic testing", async () => {
    const now = new Date("2026-04-25T12:00:00.000Z");
    const rows = [{ userId: "user-3" }];
    const setSpy = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ rowCount: 1 }),
    });
    const db = {
      select: vi.fn().mockReturnValue(makeSelectForExpiry(rows)),
      update: vi.fn().mockReturnValue({ set: setSpy }),
    };

    const count = await expireElapsedFreeTrials(db as never, now);

    expect(count).toBe(1);
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        billingGateRequiredAt: now,
        updatedAt: now,
      }),
    );
  });

  it("handles rowCount being undefined from the driver and returns the user id count", async () => {
    const rows = [{ userId: "user-5" }, { userId: "user-6" }];
    const db = {
      select: vi.fn().mockReturnValue(makeSelectForExpiry(rows)),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };

    const count = await expireElapsedFreeTrials(db as never);

    expect(count).toBe(2);
  });
});

describe("isInActiveTrial", () => {
  it("returns true for an active trial started 10 days ago", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    expect(
      isInActiveTrial({ status: "trialing", trialStartedAt: tenDaysAgo }),
    ).toBe(true);
  });

  it("returns true for a seeded free trial even if an old row still says inactive", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    expect(
      isInActiveTrial({
        plan: "free",
        status: "inactive",
        trialStartedAt: tenDaysAgo,
      }),
    ).toBe(true);
  });

  it("returns false for an expired trial started 31 days ago", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86_400_000);
    expect(
      isInActiveTrial({ status: "trialing", trialStartedAt: thirtyOneDaysAgo }),
    ).toBe(false);
  });

  it("returns false for a null row", () => {
    expect(isInActiveTrial(null)).toBe(false);
  });

  it("returns false when trialStartedAt is null", () => {
    expect(isInActiveTrial({ status: "trialing", trialStartedAt: null })).toBe(
      false,
    );
  });

  it("returns false when status is not trialing", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    expect(
      isInActiveTrial({ status: "active", trialStartedAt: tenDaysAgo }),
    ).toBe(false);
    expect(
      isInActiveTrial({ status: "inactive", trialStartedAt: tenDaysAgo }),
    ).toBe(false);
  });
});

describe("hasPaidPlanAccess with trial", () => {
  it("returns true during an active trial regardless of plan", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    expect(
      hasPaidPlanAccess({
        plan: "free",
        status: "trialing",
        trialStartedAt: tenDaysAgo,
      }),
    ).toBe(true);
  });

  it("returns true during an active trial even for a starter plan", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 86_400_000);
    expect(
      hasPaidPlanAccess({
        plan: "starter",
        status: "trialing",
        trialStartedAt: fiveDaysAgo,
      }),
    ).toBe(true);
  });

  it("returns false when the trial has expired", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86_400_000);
    expect(
      hasPaidPlanAccess({
        plan: "free",
        status: "trialing",
        trialStartedAt: thirtyOneDaysAgo,
      }),
    ).toBe(false);
  });
});

describe("isBillingGateRequired trial expiry", () => {
  it("returns true when trial has expired (status=trialing, trialStartedAt 31 days ago, billingGateRequiredAt=null)", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86_400_000);
    expect(
      isBillingGateRequired({
        status: "trialing",
        trialStartedAt: thirtyOneDaysAgo,
        billingGateRequiredAt: null,
        plan: "free",
      }),
    ).toBe(true);
  });

  it("returns true when a legacy inactive free trial row has expired", () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86_400_000);
    expect(
      isBillingGateRequired({
        status: "inactive",
        trialStartedAt: thirtyOneDaysAgo,
        billingGateRequiredAt: null,
        plan: "free",
      }),
    ).toBe(true);
  });

  it("returns false during an active trial", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    expect(
      isBillingGateRequired({
        status: "trialing",
        trialStartedAt: tenDaysAgo,
        billingGateRequiredAt: null,
        plan: "free",
      }),
    ).toBe(false);
  });

  it("allows access when active trial exists even if billingGateRequiredAt is set from a stale cron run", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    expect(
      isBillingGateRequired({
        status: "trialing",
        trialStartedAt: tenDaysAgo,
        billingGateRequiredAt: new Date(),
        plan: "free",
      }),
    ).toBe(false);
  });
});

describe("getEffectiveBillingPlan with active trial", () => {
  it("returns pro during an active trial", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    expect(
      getEffectiveBillingPlan({
        plan: "free",
        status: "trialing",
        trialStartedAt: tenDaysAgo,
      }),
    ).toBe("pro");
  });
});

describe("buildBillingSummary featuresUsed", () => {
  it("includes vendors in featuresUsed when vendorsFirstUsedAt is set", () => {
    const result = buildBillingSummary({
      plan: "pro",
      status: "active",
      stripeCustomerId: "cus_123",
      currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      billingGateRequiredAt: null,
      trialStartedAt: null,
      vendorsFirstUsedAt: new Date("2026-04-01T00:00:00.000Z"),
      extraPlannerFirstUsedAt: null,
      weddingWebsiteFirstUsedAt: null,
    });
    expect(result.featuresUsed).toEqual(["vendors"]);
  });

  it("includes all features in featuresUsed when all timestamps are set", () => {
    const ts = new Date("2026-04-01T00:00:00.000Z");
    const result = buildBillingSummary({
      plan: "pro",
      status: "active",
      stripeCustomerId: "cus_123",
      currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      billingGateRequiredAt: null,
      trialStartedAt: null,
      vendorsFirstUsedAt: ts,
      extraPlannerFirstUsedAt: ts,
      weddingWebsiteFirstUsedAt: ts,
    });
    expect(result.featuresUsed).toEqual([
      "vendors",
      "extraPlanner",
      "weddingWebsite",
    ]);
  });

  it("returns empty featuresUsed when no timestamps are set", () => {
    const result = buildBillingSummary({
      plan: "pro",
      status: "active",
      stripeCustomerId: "cus_123",
      currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      billingGateRequiredAt: null,
      trialStartedAt: null,
      vendorsFirstUsedAt: null,
      extraPlannerFirstUsedAt: null,
      weddingWebsiteFirstUsedAt: null,
    });
    expect(result.featuresUsed).toEqual([]);
  });

  it("includes only extraPlanner and weddingWebsite when vendorsFirstUsedAt is null", () => {
    const ts = new Date("2026-04-01T00:00:00.000Z");
    const result = buildBillingSummary({
      plan: "pro",
      status: "active",
      stripeCustomerId: "cus_123",
      currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
      billingGateRequiredAt: null,
      trialStartedAt: null,
      vendorsFirstUsedAt: null,
      extraPlannerFirstUsedAt: ts,
      weddingWebsiteFirstUsedAt: ts,
    });
    expect(result.featuresUsed).toEqual(["extraPlanner", "weddingWebsite"]);
  });
});
