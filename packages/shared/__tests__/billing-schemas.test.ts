import { describe, it, expect } from "vitest";
import {
  BILLING_FEATURES,
  BILLING_FEATURE_LABELS,
  BILLING_INTERVAL_LABELS,
  BILLING_INTERVALS,
  BILLING_PLANS,
  BILLING_PLAN_FEATURES,
  BILLING_PLAN_LABELS,
  BILLING_STATUSES,
  PRICING_TIERS,
  STRIPE_PRICE_ENV_KEYS,
  billingSummarySchema,
  createCheckoutSessionSchema,
  billingHistoryItemSchema,
  billingHistoryResponseSchema,
} from "../src";

describe("billing constants", () => {
  it("includes the supported billing plans in order", () => {
    expect(BILLING_PLANS).toEqual(["free", "starter", "pro", "lifetime"]);
  });

  it("labels every billing plan from the shared source of truth", () => {
    expect(Object.keys(BILLING_PLAN_LABELS)).toEqual(BILLING_PLANS);
    expect(BILLING_PLAN_LABELS).toMatchObject({
      free: "Free",
      starter: "Starter",
      pro: "Pro",
      lifetime: "Lifetime",
    });
  });

  it("keeps free and starter users outside paid feature gates", () => {
    expect(BILLING_PLAN_FEATURES.free).toEqual([]);
    expect(BILLING_PLAN_FEATURES.starter).toEqual([]);
  });

  it("grants pro-only features to pro and lifetime", () => {
    expect(BILLING_PLAN_FEATURES.pro).toEqual(BILLING_FEATURES);
    expect(BILLING_PLAN_FEATURES.lifetime).toEqual(BILLING_FEATURES);
  });

  it("labels every billing feature from the shared source of truth", () => {
    expect(Object.keys(BILLING_FEATURE_LABELS)).toEqual(BILLING_FEATURES);
    expect(BILLING_FEATURE_LABELS).toMatchObject({
      vendors: "Vendor tracking & contracts",
      extraPlanner: "Multi-planner collaboration",
      weddingWebsite: "Wedding website & RSVP",
    });
  });

  it("exposes normalized billing statuses", () => {
    expect(BILLING_STATUSES).toContain("active");
    expect(BILLING_STATUSES).toContain("inactive");
    expect(BILLING_STATUSES).toContain("past_due");
  });

  it("exposes billing intervals", () => {
    expect(BILLING_INTERVALS).toEqual(["month", "year"]);
  });

  it("labels every billing interval from the shared source of truth", () => {
    expect(Object.keys(BILLING_INTERVAL_LABELS)).toEqual(BILLING_INTERVALS);
    expect(BILLING_INTERVAL_LABELS).toMatchObject({
      month: "Monthly",
      year: "Yearly",
    });
  });

  it("maps Stripe price env keys from the shared billing source", () => {
    expect(Object.keys(STRIPE_PRICE_ENV_KEYS)).toEqual(PRICING_TIERS);
    expect(STRIPE_PRICE_ENV_KEYS).toEqual({
      starter: {
        month: "STRIPE_STARTER_PRICE_ID",
        year: "STRIPE_STARTER_ANNUAL_PRICE_ID",
      },
      pro: {
        month: "STRIPE_PRO_PRICE_ID",
        year: "STRIPE_PRO_ANNUAL_PRICE_ID",
      },
      lifetime: {
        month: "STRIPE_LIFETIME_PRICE_ID",
      },
    });
  });
});

describe("createCheckoutSessionSchema", () => {
  it("accepts starter checkout", () => {
    const result = createCheckoutSessionSchema.safeParse({ plan: "starter" });
    expect(result.success).toBe(true);
  });

  it("accepts lifetime checkout", () => {
    const result = createCheckoutSessionSchema.safeParse({ plan: "lifetime" });
    expect(result.success).toBe(true);
  });

  it("rejects free checkout", () => {
    const result = createCheckoutSessionSchema.safeParse({ plan: "free" });
    expect(result.success).toBe(false);
  });

  it("defaults interval to month when not provided", () => {
    const result = createCheckoutSessionSchema.safeParse({ plan: "starter" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interval).toBe("month");
    }
  });

  it("accepts interval year", () => {
    const result = createCheckoutSessionSchema.safeParse({
      plan: "pro",
      interval: "year",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interval).toBe("year");
    }
  });

  it("accepts interval month explicitly", () => {
    const result = createCheckoutSessionSchema.safeParse({
      plan: "starter",
      interval: "month",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.interval).toBe("month");
    }
  });

  it("rejects invalid interval values", () => {
    const result = createCheckoutSessionSchema.safeParse({
      plan: "starter",
      interval: "quarterly",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every paid plan derived from BILLING_PLANS", () => {
    for (const plan of PRICING_TIERS) {
      const result = createCheckoutSessionSchema.safeParse({ plan });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown plan names", () => {
    const result = createCheckoutSessionSchema.safeParse({
      plan: "enterprise",
    });
    expect(result.success).toBe(false);
  });
});

describe("billingHistoryItemSchema", () => {
  const validItem = {
    id: "inv_123",
    type: "invoice" as const,
    amountCents: 2000,
    currency: "USD",
    status: "paid",
    createdAt: "2026-04-08T10:00:00.000Z",
    hostedUrl: "https://billing.stripe.com/invoice/inv_123",
  };

  it("accepts a valid billing history item", () => {
    expect(billingHistoryItemSchema.safeParse(validItem).success).toBe(true);
  });

  it("accepts a null hostedUrl", () => {
    expect(
      billingHistoryItemSchema.safeParse({ ...validItem, hostedUrl: null })
        .success,
    ).toBe(true);
  });

  it("rejects an invalid ISO datetime for createdAt", () => {
    expect(
      billingHistoryItemSchema.safeParse({
        ...validItem,
        createdAt: "2026-04-08",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-datetime string for createdAt", () => {
    expect(
      billingHistoryItemSchema.safeParse({
        ...validItem,
        createdAt: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("rejects a currency string longer than 3 characters", () => {
    expect(
      billingHistoryItemSchema.safeParse({ ...validItem, currency: "USDX" })
        .success,
    ).toBe(false);
  });

  it("rejects a currency string shorter than 3 characters", () => {
    expect(
      billingHistoryItemSchema.safeParse({ ...validItem, currency: "US" })
        .success,
    ).toBe(false);
  });

  it("rejects a lowercase currency code", () => {
    expect(
      billingHistoryItemSchema.safeParse({ ...validItem, currency: "usd" })
        .success,
    ).toBe(false);
  });

  it("rejects a non-URL hostedUrl string", () => {
    expect(
      billingHistoryItemSchema.safeParse({
        ...validItem,
        hostedUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });

  it("accepts payment_intent type", () => {
    expect(
      billingHistoryItemSchema.safeParse({
        ...validItem,
        type: "payment_intent",
      }).success,
    ).toBe(true);
  });
});

describe("billingHistoryResponseSchema", () => {
  it("accepts an empty items array", () => {
    expect(billingHistoryResponseSchema.safeParse({ items: [] }).success).toBe(
      true,
    );
  });

  it("accepts multiple valid history items", () => {
    expect(
      billingHistoryResponseSchema.safeParse({
        items: [
          {
            id: "inv_1",
            type: "invoice",
            amountCents: 2000,
            currency: "USD",
            status: "paid",
            createdAt: "2026-04-08T10:00:00.000Z",
            hostedUrl: null,
          },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("billingSummarySchema — trialDaysRemaining", () => {
  const base = {
    plan: "free" as const,
    status: "inactive" as const,
    stripeCustomerId: null,
    currentPeriodEnd: null,
    billingGateRequired: false,
    features: [],
    canManageBilling: false,
    featuresUsed: [],
  };

  it("accepts trialDaysRemaining: null (no active trial)", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      trialDaysRemaining: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a positive integer trialDaysRemaining", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      trialDaysRemaining: 15,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trialDaysRemaining).toBe(15);
    }
  });

  it("accepts trialDaysRemaining: 0 (trial expired today)", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      trialDaysRemaining: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.trialDaysRemaining).toBe(0);
    }
  });

  it("rejects negative trialDaysRemaining", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      trialDaysRemaining: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer trialDaysRemaining", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      trialDaysRemaining: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a summary missing trialDaysRemaining entirely", () => {
    const result = billingSummarySchema.safeParse(base);
    expect(result.success).toBe(false);
  });
});

describe("billingSummarySchema — featuresUsed", () => {
  const base = {
    plan: "free" as const,
    status: "inactive" as const,
    stripeCustomerId: null,
    currentPeriodEnd: null,
    billingGateRequired: false,
    features: [],
    canManageBilling: false,
    trialDaysRemaining: null,
  };

  it("accepts featuresUsed with a valid feature value", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      featuresUsed: ["vendors"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.featuresUsed).toEqual(["vendors"]);
    }
  });

  it("accepts featuresUsed as an empty array", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      featuresUsed: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.featuresUsed).toEqual([]);
    }
  });

  it("accepts featuresUsed with all valid feature values", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      featuresUsed: ["vendors", "extraPlanner", "weddingWebsite"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.featuresUsed).toEqual([
        "vendors",
        "extraPlanner",
        "weddingWebsite",
      ]);
    }
  });

  it("rejects featuresUsed containing an invalid feature value", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      featuresUsed: ["invalidFeature"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects featuresUsed containing a mix of valid and invalid feature values", () => {
    const result = billingSummarySchema.safeParse({
      ...base,
      featuresUsed: ["vendors", "notAFeature"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a summary missing featuresUsed entirely", () => {
    const result = billingSummarySchema.safeParse(base);
    expect(result.success).toBe(false);
  });
});

describe("M36 — billingHistoryItemSchema datetime offset support", () => {
  const base = {
    id: "inv_123",
    type: "invoice" as const,
    amountCents: 2000,
    currency: "USD",
    status: "paid",
    hostedUrl: null,
  };

  it("accepts a UTC+offset createdAt string", () => {
    expect(
      billingHistoryItemSchema.safeParse({
        ...base,
        createdAt: "2026-04-08T15:30:00+05:30",
      }).success,
    ).toBe(true);
  });

  it("accepts a UTC-offset createdAt string", () => {
    expect(
      billingHistoryItemSchema.safeParse({
        ...base,
        createdAt: "2026-04-08T08:00:00-05:00",
      }).success,
    ).toBe(true);
  });
});
