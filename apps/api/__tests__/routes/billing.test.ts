import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";
import { billingRoutes } from "../../src/routes/billing";
import type { StripeLike } from "../../src/lib/stripe";
import {
  TEST_STRIPE_PRICE_ENV,
  TEST_STRIPE_PRICE_IDS,
} from "../helpers/stripe-env";

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

const BASE_ENV = {
  HYPERDRIVE: { connectionString: "postgres://example" },
  DATABASE_URL: "postgres://example",
  BETTER_AUTH_SECRET: "secret",
  BETTER_AUTH_URL: "https://api.kaiplan.app",
  APP_URL: "https://my.kaiplan.app",
  GOOGLE_CLIENT_ID: "google-id",
  GOOGLE_CLIENT_SECRET: "google-secret",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  ...TEST_STRIPE_PRICE_ENV,
  STRIPE_CHECKOUT_SUCCESS_URL:
    "https://my.kaiplan.app/settings?checkout=success",
  STRIPE_CHECKOUT_CANCEL_URL: "https://my.kaiplan.app/settings?checkout=cancel",
  STRIPE_PORTAL_RETURN_URL: "https://my.kaiplan.app/settings",
};

function makeAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: TEST_USER, session: {} }),
    },
  } as unknown as Auth;
}

function makeUnauthAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  } as unknown as Auth;
}

function makeSelectBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};

  builder.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolveWith).then(onFulfilled, onRejected);

  builder.select = vi.fn().mockReturnValue(builder);
  builder.from = vi.fn().mockReturnValue(builder);
  builder.innerJoin = vi.fn().mockReturnValue(builder);
  builder.leftJoin = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue({
    then: (fn: (rows: unknown) => unknown) => Promise.resolve(fn(resolveWith)),
  });

  return builder;
}

function makeDb(selectResponses: unknown[] = [], writeResult: unknown[] = []) {
  let selectIndex = 0;
  const db: Record<string, unknown> = {};

  db.select = vi.fn().mockImplementation(() => {
    const rows =
      selectIndex < selectResponses.length ? selectResponses[selectIndex] : [];
    selectIndex += 1;
    return makeSelectBuilder(rows);
  });

  const insertBuilder: Record<string, unknown> = {};
  insertBuilder.values = vi.fn().mockReturnValue({
    onConflictDoNothing: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(writeResult),
    }),
    onConflictDoUpdate: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(writeResult),
    }),
    returning: vi.fn().mockResolvedValue(writeResult),
  });
  db.insert = vi.fn().mockReturnValue(insertBuilder);

  const updateBuilder: Record<string, unknown> = {};
  updateBuilder.set = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(writeResult),
    }),
  });
  db.update = vi.fn().mockReturnValue(updateBuilder);

  const deleteBuilder: Record<string, unknown> = {};
  deleteBuilder.where = vi.fn().mockResolvedValue(undefined);
  db.delete = vi.fn().mockReturnValue(deleteBuilder);

  // M3: The checkout route acquires an advisory lock via tx.execute() before
  // calling loadSubscription, so the transaction stub must expose execute.
  db.execute = vi.fn().mockResolvedValue(undefined);
  db.transaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: db.select,
        insert: db.insert,
        update: db.update,
        delete: db.delete,
        execute: db.execute,
      }),
    );

  return db as unknown as Database;
}

function makeDbFailingOnInsertCall(
  selectResponses: unknown[],
  failOnInsertCall: number,
  error: Error,
  writeResult: unknown[] = [],
) {
  const db = makeDb(selectResponses, writeResult) as unknown as Database & {
    insert: ReturnType<typeof vi.fn>;
  };
  let insertCallIndex = 0;

  db.insert = vi.fn().mockImplementation(() => {
    const shouldReject = insertCallIndex === failOnInsertCall;
    insertCallIndex += 1;

    return {
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockImplementation(() =>
              shouldReject
                ? Promise.reject(error)
                : Promise.resolve(writeResult),
            ),
        }),
      }),
    };
  });

  return db as Database;
}

function makeStripe(): StripeLike {
  return {
    customers: {
      create: vi.fn().mockResolvedValue({ id: "cus_123" }),
      retrieve: vi.fn().mockResolvedValue({
        id: "cus_123",
        metadata: { userId: TEST_USER.id },
      }),
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/session",
        }),
      },
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: "cs_123",
          url: "https://checkout.stripe.com/c/pay/cs_123",
        }),
        retrieve: vi.fn().mockResolvedValue({
          id: "cs_123",
          url: "https://checkout.stripe.com/c/pay/cs_123",
          status: "open",
        }),
        expire: vi.fn().mockResolvedValue({
          id: "cs_123",
          url: "https://checkout.stripe.com/c/pay/cs_123",
          status: "expired",
        }),
      },
    },
    invoices: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: "in_123",
            status: "paid",
            hosted_invoice_url: "https://stripe.com/invoice/in_123",
            amount_paid: 2000,
            currency: "usd",
            created: 1710000000,
          },
        ],
      }),
    },
    paymentIntents: {
      list: vi.fn().mockResolvedValue({
        data: [
          {
            id: "pi_123",
            status: "succeeded",
            amount: 10000,
            currency: "usd",
            created: 1710000001,
          },
        ],
      }),
    },
    webhooks: {
      constructEventAsync: vi.fn(),
    },
  };
}

function makeStripeResourceMissingError() {
  return Object.assign(new Error("No such customer"), {
    type: "StripeInvalidRequestError",
    code: "resource_missing",
    statusCode: 404,
  });
}

function makeApp(db: Database, auth: Auth, stripe = makeStripe()) {
  const app = new Hono<{ Bindings: typeof BASE_ENV }>();
  app.route("/billing", billingRoutes(db, auth, stripe));
  return { app, stripe };
}

async function req(
  app: Hono<{ Bindings: typeof BASE_ENV }>,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  return app.request(
    path,
    {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    BASE_ENV,
  );
}

describe("billingRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 from billing summary when unauthenticated", async () => {
    const { app } = makeApp(makeDb(), makeUnauthAuth());

    const res = await req(app, "GET", "/billing");

    expect(res.status).toBe(401);
  });

  it("returns free billing summary when the user has no subscription", async () => {
    const { app } = makeApp(makeDb([[]]), makeAuth());

    const res = await req(app, "GET", "/billing");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      plan: "free",
      status: "inactive",
      features: [],
      canManageBilling: false,
    });
  });

  it("removes paid features from the billing summary when the subscription is not active", async () => {
    const { app } = makeApp(
      makeDb([
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripePriceId: "price_pro",
            status: "past_due",
            currentPeriodEnd: new Date("2026-05-01"),
            plan: "pro",
          },
        ],
      ]),
      makeAuth(),
    );

    const res = await req(app, "GET", "/billing");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      plan: "pro",
      status: "past_due",
      features: [],
    });
  });

  it("includes featuresUsed in the billing summary based on first-use timestamps", async () => {
    const { app } = makeApp(
      makeDb([
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripePriceId: "price_pro",
            status: "active",
            currentPeriodEnd: new Date("2026-06-01"),
            plan: "pro",
            trialStartedAt: null,
            billingGateRequiredAt: null,
            vendorsFirstUsedAt: new Date("2026-04-01T00:00:00.000Z"),
            extraPlannerFirstUsedAt: null,
            weddingWebsiteFirstUsedAt: null,
          },
        ],
      ]),
      makeAuth(),
    );

    const res = await req(app, "GET", "/billing");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("featuresUsed");
    expect(body.featuresUsed).toEqual(["vendors"]);
  });

  it("includes all three features in featuresUsed when all timestamps are present", async () => {
    const ts = new Date("2026-04-01T00:00:00.000Z");
    const { app } = makeApp(
      makeDb([
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripePriceId: "price_pro",
            status: "active",
            currentPeriodEnd: new Date("2026-06-01"),
            plan: "pro",
            trialStartedAt: null,
            billingGateRequiredAt: null,
            vendorsFirstUsedAt: ts,
            extraPlannerFirstUsedAt: ts,
            weddingWebsiteFirstUsedAt: ts,
          },
        ],
      ]),
      makeAuth(),
    );

    const res = await req(app, "GET", "/billing");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.featuresUsed).toEqual([
      "vendors",
      "extraPlanner",
      "weddingWebsite",
    ]);
  });

  it("returns empty featuresUsed when no feature timestamps are set", async () => {
    const { app } = makeApp(
      makeDb([
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripePriceId: "price_pro",
            status: "active",
            currentPeriodEnd: new Date("2026-06-01"),
            plan: "pro",
            trialStartedAt: null,
            billingGateRequiredAt: null,
            vendorsFirstUsedAt: null,
            extraPlannerFirstUsedAt: null,
            weddingWebsiteFirstUsedAt: null,
          },
        ],
      ]),
      makeAuth(),
    );

    const res = await req(app, "GET", "/billing");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.featuresUsed).toEqual([]);
  });

  it("creates a starter checkout session using the starter price", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        mode: "subscription",
        line_items: [{ price: "price_starter", quantity: 1 }],
        success_url:
          "https://my.kaiplan.app/settings?checkout=success&plan=starter&interval=month",
        cancel_url:
          "https://my.kaiplan.app/settings?checkout=cancel&plan=starter&interval=month",
      }),
    );
  });

  it("uses a plan-aware checkout idempotency key", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const stripe = makeStripe();
    stripe.checkout.sessions.createWithIdempotency = vi.fn().mockResolvedValue({
      id: "cs_123",
      url: "https://checkout.stripe.com/c/pay/cs_123",
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.createWithIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        mode: "subscription",
      }),
      "checkout:user-1:starter:month:new",
    );
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("uses the new checkout idempotency state for free inactive placeholders", async () => {
    const placeholderSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: null,
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: null,
    };
    const db = makeDb(
      [[placeholderSubscription], [placeholderSubscription]],
      [{ stripeCustomerId: "cus_123" }],
    );
    const stripe = makeStripe();
    stripe.checkout.sessions.createWithIdempotency = vi.fn().mockResolvedValue({
      id: "cs_123",
      url: "https://checkout.stripe.com/c/pay/cs_123",
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.createWithIdempotency).toHaveBeenCalledWith(
      expect.any(Object),
      "checkout:user-1:starter:month:new",
    );
  });

  it("reuses customer and checkout idempotency when first-time pending persistence fails", async () => {
    const persistError = new Error("pending checkout write failed");
    const failingDb = makeDbFailingOnInsertCall([[], []], 1, persistError, [
      { stripeCustomerId: "cus_reused" },
    ]);
    const retryDb = makeDb([[], []], [{ stripeCustomerId: "cus_reused" }]);
    const stripe = makeStripe();
    stripe.customers.createWithIdempotency = vi.fn().mockResolvedValue({
      id: "cus_reused",
    });
    stripe.checkout.sessions.createWithIdempotency = vi.fn().mockResolvedValue({
      id: "cs_retry",
      url: "https://checkout.stripe.com/c/pay/cs_retry",
    });
    const firstAttempt = makeApp(failingDb, makeAuth(), stripe);
    const retryAttempt = makeApp(retryDb, makeAuth(), stripe);

    const firstRes = await req(firstAttempt.app, "POST", "/billing/checkout", {
      plan: "starter",
    });
    expect(firstRes.status).toBe(500);

    const retryRes = await req(retryAttempt.app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(retryRes.status).toBe(200);
    expect(stripe.customers.createWithIdempotency).toHaveBeenCalledTimes(2);
    expect(stripe.customers.createWithIdempotency).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ email: TEST_USER.email }),
      "customer:user-1:new",
    );
    expect(stripe.customers.createWithIdempotency).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ email: TEST_USER.email }),
      "customer:user-1:new",
    );
    const checkoutCalls = vi.mocked(
      stripe.checkout.sessions.createWithIdempotency,
    ).mock.calls;
    expect(checkoutCalls.map((call) => call[0].customer)).toEqual([
      "cus_reused",
      "cus_reused",
    ]);
    expect(checkoutCalls.map((call) => call[1])).toEqual([
      "checkout:user-1:starter:month:new",
      "checkout:user-1:starter:month:new",
    ]);
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("reuses customer and checkout idempotency when deleted customer replacement persistence fails", async () => {
    const checkoutStateUpdatedAt = new Date("2026-02-03T04:05:06.000Z");
    const deletedCustomerSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_deleted",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
      updatedAt: checkoutStateUpdatedAt,
    };
    const persistError = new Error("pending checkout write failed");
    const failingDb = makeDbFailingOnInsertCall(
      [[deletedCustomerSubscription], [deletedCustomerSubscription]],
      1,
      persistError,
      [{ stripeCustomerId: "cus_replacement_reused" }],
    );
    const retryDb = makeDb(
      [[deletedCustomerSubscription], [deletedCustomerSubscription]],
      [{ stripeCustomerId: "cus_replacement_reused" }],
    );
    const stripe = makeStripe();
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_deleted",
      deleted: true,
      metadata: { userId: TEST_USER.id },
    });
    stripe.customers.createWithIdempotency = vi.fn().mockResolvedValue({
      id: "cus_replacement_reused",
    });
    stripe.checkout.sessions.createWithIdempotency = vi.fn().mockResolvedValue({
      id: "cs_retry",
      url: "https://checkout.stripe.com/c/pay/cs_retry",
    });
    const firstAttempt = makeApp(failingDb, makeAuth(), stripe);
    const retryAttempt = makeApp(retryDb, makeAuth(), stripe);
    const expectedState = `state:${checkoutStateUpdatedAt.getTime()}`;

    const firstRes = await req(firstAttempt.app, "POST", "/billing/checkout", {
      plan: "starter",
    });
    expect(firstRes.status).toBe(500);

    const retryRes = await req(retryAttempt.app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(retryRes.status).toBe(200);
    expect(stripe.customers.createWithIdempotency).toHaveBeenCalledTimes(2);
    expect(stripe.customers.createWithIdempotency).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ email: TEST_USER.email }),
      `customer:user-1:${expectedState}`,
    );
    expect(stripe.customers.createWithIdempotency).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ email: TEST_USER.email }),
      `customer:user-1:${expectedState}`,
    );
    const checkoutCalls = vi.mocked(
      stripe.checkout.sessions.createWithIdempotency,
    ).mock.calls;
    expect(checkoutCalls.map((call) => call[0].customer)).toEqual([
      "cus_replacement_reused",
      "cus_replacement_reused",
    ]);
    expect(checkoutCalls.map((call) => call[1])).toEqual([
      `checkout:user-1:starter:month:${expectedState}`,
      `checkout:user-1:starter:month:${expectedState}`,
    ]);
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("reuses the checkout idempotency key across retry-window boundaries after pending persistence fails", async () => {
    const checkoutStateUpdatedAt = new Date("2026-01-02T03:04:05.000Z");
    const inactiveSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_123",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: null,
      pendingCheckoutPlan: null,
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: null,
      updatedAt: checkoutStateUpdatedAt,
    };
    const persistError = new Error("pending checkout write failed");
    const failingDb = makeDb([
      [inactiveSubscription],
      [inactiveSubscription],
    ]) as unknown as Database & {
      insert: ReturnType<typeof vi.fn>;
    };
    failingDb.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(persistError),
        }),
      }),
    });
    const retryDb = makeDb(
      [[inactiveSubscription], [inactiveSubscription]],
      [inactiveSubscription],
    );
    const stripe = makeStripe();
    stripe.checkout.sessions.createWithIdempotency = vi.fn().mockResolvedValue({
      id: "cs_retry",
      url: "https://checkout.stripe.com/c/pay/cs_retry",
    });
    let nowCalls = 0;
    const nowSpy = vi
      .spyOn(Date, "now")
      .mockImplementation(() => (nowCalls++ === 0 ? 1_799_999 : 1_800_001));
    const firstAttempt = makeApp(failingDb, makeAuth(), stripe);
    const retryAttempt = makeApp(retryDb, makeAuth(), stripe);

    try {
      const firstRes = await req(
        firstAttempt.app,
        "POST",
        "/billing/checkout",
        {
          plan: "starter",
        },
      );
      expect(firstRes.status).toBe(500);

      const res = await req(retryAttempt.app, "POST", "/billing/checkout", {
        plan: "starter",
      });

      expect(res.status).toBe(200);
      const idempotencyKeys = vi
        .mocked(stripe.checkout.sessions.createWithIdempotency)
        .mock.calls.map((call) => call[1]);
      const expectedKey = `checkout:user-1:starter:month:state:${checkoutStateUpdatedAt.getTime()}`;
      expect(idempotencyKeys).toEqual([expectedKey, expectedKey]);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("reuses an open pending checkout session for the same plan request", async () => {
    const pendingSubscription = {
      userId: TEST_USER.id,
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_pending",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: new Date(),
    };
    const db = makeDb([[pendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!).mockResolvedValue({
      id: "cs_pending",
      url: "https://checkout.stripe.com/c/pay/cs_pending",
      status: "open",
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
      interval: "month",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "https://checkout.stripe.com/c/pay/cs_pending",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a different pending checkout session already exists", async () => {
    const pendingSubscription = {
      userId: TEST_USER.id,
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_pending",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: new Date(),
    };
    const db = makeDb([[pendingSubscription]]);
    const stripe = makeStripe();
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      checkoutInProgress: true,
      plan: "starter",
      interval: "month",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 409 when same-plan pending checkout cannot be retrieved", async () => {
    const pendingSubscription = {
      userId: TEST_USER.id,
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_pending",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: new Date(),
    };
    const db = makeDb([[pendingSubscription]]);
    const stripe = makeStripe();
    stripe.checkout.sessions.retrieve = undefined;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
      interval: "month",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      checkoutInProgress: true,
      plan: "starter",
      interval: "month",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a same-plan pending checkout has no reusable URL", async () => {
    const pendingSubscription = {
      userId: TEST_USER.id,
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_pending_no_url",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: null,
      pendingCheckoutCreatedAt: new Date(),
    };
    const db = makeDb([[pendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!).mockResolvedValue({
      id: "cs_pending_no_url",
      status: "open",
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      checkoutInProgress: true,
      plan: "starter",
      interval: "month",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("clears stale pending checkout state before creating a new session", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    // First select: checkout guard; second select: ensureStripeCustomer.
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_stale");
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("returns 409 when stale pending sessions cannot be expired safely", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.expire!).mockRejectedValue(
      new Error("unable to expire"),
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      checkoutInProgress: true,
      plan: "starter",
      interval: "month",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("continues stale cleanup when expire throws but refresh shows expired", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!)
      .mockResolvedValueOnce({
        id: "cs_stale",
        status: "open",
      })
      .mockResolvedValueOnce({
        id: "cs_stale",
        status: "expired",
      });
    vi.mocked(stripe.checkout.sessions.expire!).mockRejectedValue(
      new Error("expire raced"),
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
  });

  it("returns 409 when stale pending sessions cannot be expired because expire API is unavailable", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    stripe.checkout.sessions.expire = undefined;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      checkoutInProgress: true,
      plan: "starter",
      interval: "month",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("continues stale cleanup when pending-session retrieval fails before expire", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!).mockRejectedValue(
      new Error("retrieve unavailable"),
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_stale");
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
  });

  it("returns 409 when stale pending session is already complete", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!).mockResolvedValue({
      id: "cs_stale",
      url: "https://checkout.stripe.com/c/pay/cs_stale",
      status: "complete",
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      checkoutInProgress: true,
      plan: "starter",
      interval: "month",
    });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 409 when stale pending session cannot be re-checked after expire failure", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!)
      .mockResolvedValueOnce({
        id: "cs_stale",
        url: "https://checkout.stripe.com/c/pay/cs_stale",
        status: "open",
      })
      .mockRejectedValueOnce(new Error("retrieve unavailable"));
    vi.mocked(stripe.checkout.sessions.expire!).mockRejectedValue(
      new Error("unable to expire"),
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      checkoutInProgress: true,
      plan: "starter",
      interval: "month",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a new session when a stale pending session is already expired", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!).mockResolvedValue({
      id: "cs_stale",
      url: "https://checkout.stripe.com/c/pay/cs_stale",
      status: "expired",
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
  });

  it("returns 409 when stale pending expiration fails and retrieve is unavailable", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    stripe.checkout.sessions.retrieve = undefined;
    vi.mocked(stripe.checkout.sessions.expire!).mockRejectedValue(
      new Error("unable to expire"),
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      checkoutInProgress: true,
      plan: "starter",
      interval: "month",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("continues when expire fails but refreshed stale pending status is expired", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!)
      .mockResolvedValueOnce({
        id: "cs_stale",
        url: "https://checkout.stripe.com/c/pay/cs_stale",
        status: "open",
      })
      .mockResolvedValueOnce({
        id: "cs_stale",
        url: "https://checkout.stripe.com/c/pay/cs_stale",
        status: "expired",
      });
    vi.mocked(stripe.checkout.sessions.expire!).mockRejectedValue(
      new Error("unable to expire"),
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
  });

  it("treats missing stale pending status values as non-expired during cleanup", async () => {
    const stalePendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      plan: "free",
      status: "inactive",
      pendingCheckoutSessionId: "cs_stale",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
      pendingCheckoutCreatedAt: null,
    };
    const db = makeDb([[stalePendingSubscription], [stalePendingSubscription]]);
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.retrieve!).mockResolvedValue({
      id: "cs_stale",
      url: "https://checkout.stripe.com/c/pay/cs_stale",
      status: undefined,
    });
    vi.mocked(stripe.checkout.sessions.expire!).mockResolvedValue({
      id: "cs_stale",
      url: "https://checkout.stripe.com/c/pay/cs_stale",
      status: undefined,
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalled();
  });

  it("creates starter subscription checkout without offer fields", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        payment_method_collection: "always",
      }),
    );
    const callArg = vi.mocked(stripe.checkout.sessions.create).mock
      .calls[0]?.[0];
    expect(callArg).not.toHaveProperty("discounts");
    expect(callArg).not.toHaveProperty("allow_promotion_codes");
    expect(callArg).not.toHaveProperty("subscription_data");
  });

  it("creates pro subscription checkout without offer fields", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        payment_method_collection: "always",
      }),
    );
    const callArg = vi.mocked(stripe.checkout.sessions.create).mock
      .calls[0]?.[0];
    expect(callArg).not.toHaveProperty("discounts");
    expect(callArg).not.toHaveProperty("allow_promotion_codes");
    expect(callArg).not.toHaveProperty("subscription_data");
  });

  it("creates lifetime checkout without offer fields", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "lifetime",
    });

    expect(res.status).toBe(200);
    const createMock = vi.mocked(stripe.checkout.sessions.create);
    const callArg = createMock.mock.calls[0]?.[0];
    expect(callArg).toMatchObject({
      mode: "payment",
    });
    expect(callArg).not.toHaveProperty("discounts");
    expect(callArg).not.toHaveProperty("allow_promotion_codes");
    expect(callArg).not.toHaveProperty("subscription_data");
    expect(callArg).not.toHaveProperty("trial_period_days");
  });

  it("rejects invalid checkout payloads", async () => {
    const { app } = makeApp(makeDb([[]]), makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "free",
    });

    expect(res.status).toBe(400);
  });

  it("rejects malformed checkout JSON before touching Stripe", async () => {
    const { app, stripe } = makeApp(makeDb([[]]), makeAuth());

    const res = await app.request(
      "/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"plan":',
      },
      BASE_ENV,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a lifetime checkout session in payment mode", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "lifetime",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        mode: "payment",
        line_items: [{ price: "price_lifetime", quantity: 1 }],
        success_url:
          "https://my.kaiplan.app/settings?checkout=success&plan=lifetime&interval=month",
        cancel_url:
          "https://my.kaiplan.app/settings?checkout=cancel&plan=lifetime&interval=month",
      }),
    );
  });

  it("reuses an existing Stripe customer during checkout when subscription is inactive", async () => {
    const existingRow = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: "price_pro",
      status: "canceled",
      currentPeriodEnd: new Date("2026-05-01"),
      plan: "pro",
    };
    // Two select calls: 409 guard and ensureStripeCustomer
    const db = makeDb([[existingRow], [existingRow]]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
    });

    expect(res.status).toBe(200);
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        success_url:
          "https://my.kaiplan.app/settings?checkout=success&plan=pro&interval=month",
        cancel_url:
          "https://my.kaiplan.app/settings?checkout=cancel&plan=pro&interval=month",
      }),
    );
  });

  it("creates a replacement customer during checkout when the stored Stripe customer is missing", async () => {
    const subscriptionRow = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_deleted",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    const db = makeDb(
      [[subscriptionRow], [subscriptionRow]],
      [{ stripeCustomerId: "cus_replacement" }],
    );
    const stripe = makeStripe();
    vi.mocked(stripe.customers.retrieve!).mockRejectedValue(
      makeStripeResourceMissingError(),
    );
    vi.mocked(stripe.customers.create).mockResolvedValue({
      id: "cus_replacement",
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", { plan: "pro" });

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_deleted");
    expect(stripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: TEST_USER.email,
        metadata: { userId: TEST_USER.id },
      }),
    );
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_replacement",
      }),
    );
  });

  it("creates a replacement customer during checkout when Stripe marks the stored customer deleted", async () => {
    const subscriptionRow = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_deleted",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    const db = makeDb(
      [[subscriptionRow], [subscriptionRow]],
      [{ stripeCustomerId: "cus_replacement" }],
    );
    const stripe = makeStripe();
    vi.mocked(stripe.customers.retrieve!).mockResolvedValue({
      id: "cus_deleted",
      deleted: true,
      metadata: { userId: TEST_USER.id },
    });
    vi.mocked(stripe.customers.create).mockResolvedValue({
      id: "cus_replacement",
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/checkout", { plan: "pro" });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_replacement",
      }),
    );
  });

  it("does not hide unexpected Stripe customer lookup errors during checkout", async () => {
    const subscriptionRow = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_error",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    const stripe = makeStripe();
    vi.mocked(stripe.customers.retrieve!).mockRejectedValue("stripe down");
    const { app } = makeApp(
      makeDb([[subscriptionRow], [subscriptionRow]]),
      makeAuth(),
      stripe,
    );

    await expect(
      req(app, "POST", "/billing/checkout", { plan: "pro" }),
    ).rejects.toBe("stripe down");
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("stores a trialing subscription immediately for local e2e checkout flows", async () => {
    const existingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    // Two select calls: one for the 409 guard, one inside ensureStripeCustomer
    const db = makeDb([[existingSubscription], [existingSubscription]]);
    const { app } = makeApp(db, makeAuth());

    const res = await app.request(
      "/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      },
      { ...BASE_ENV, E2E_MODE: "true", ENVIRONMENT: "development" },
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(1);
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[0]?.[0]).toMatchObject({
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: "price_starter",
      plan: "starter",
      status: "trialing",
    });
  });

  it("stores an active lifetime subscription immediately for local e2e checkout flows", async () => {
    const existingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    const db = makeDb([[existingSubscription], [existingSubscription]]);
    const { app } = makeApp(db, makeAuth());

    const res = await app.request(
      "/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "lifetime" }),
      },
      { ...BASE_ENV, E2E_MODE: "true", ENVIRONMENT: "development" },
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[0]?.[0]).toMatchObject({
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: "price_lifetime",
      plan: "lifetime",
      status: "active",
      billingGateRequiredAt: null,
    });
    expect(insertBuilder.values.mock.calls[0]?.[0]).not.toHaveProperty(
      "trialStartedAt",
    );
  });

  it("returns gated annual checkouts back to subscribe on both success and cancel", async () => {
    const gatedSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
      billingGateRequiredAt: new Date("2026-04-20T00:00:00.000Z"),
    };
    const db = makeDb([[gatedSubscription], [gatedSubscription]]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url:
          "https://my.kaiplan.app/subscribe?checkout=success&plan=pro&interval=year",
        cancel_url:
          "https://my.kaiplan.app/subscribe?checkout=cancel&plan=pro&interval=year",
      }),
    );
  });

  it("returns payment history from invoices and direct payments", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const { app } = makeApp(makeDb([subscriptionRow]), makeAuth());

    const res = await req(app, "GET", "/billing/history");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ id: "in_123", type: "invoice" }),
        expect.objectContaining({ id: "pi_123", type: "payment_intent" }),
      ]),
    });
  });

  it("maps nullable invoice fields in payment history", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const stripe = makeStripe();
    vi.mocked(stripe.invoices.list).mockResolvedValue({
      data: [
        {
          id: "in_456",
          status: null,
          hosted_invoice_url: null,
          amount_paid: 5000,
          currency: "usd",
          created: 1710000002,
        },
      ],
    });
    const { app } = makeApp(makeDb([subscriptionRow]), makeAuth(), stripe);

    const res = await req(app, "GET", "/billing/history");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: "in_456",
          status: "unknown",
          hostedUrl: null,
        }),
      ]),
    });
  });

  it("deduplicates payment intents already represented by invoices", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const stripe = makeStripe();
    vi.mocked(stripe.invoices.list).mockResolvedValue({
      data: [
        {
          id: "in_123",
          status: "paid",
          hosted_invoice_url: "https://stripe.com/invoice/in_123",
          amount_paid: 2000,
          currency: "usd",
          created: 1710000000,
          payment_intent: "pi_123",
        },
      ],
    });
    const { app } = makeApp(makeDb([subscriptionRow]), makeAuth(), stripe);

    const res = await req(app, "GET", "/billing/history");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: "in_123", type: "invoice" });
  });

  it("returns an empty history when no Stripe customer exists", async () => {
    const { app } = makeApp(makeDb([[]]), makeAuth());

    const res = await req(app, "GET", "/billing/history");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [] });
  });

  it("returns an empty history when Stripe no longer has the stored customer", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_deleted",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const stripe = makeStripe();
    vi.mocked(stripe.invoices.list).mockRejectedValue(
      makeStripeResourceMissingError(),
    );
    const { app } = makeApp(makeDb([subscriptionRow]), makeAuth(), stripe);

    const res = await req(app, "GET", "/billing/history");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ items: [] });
  });

  it("does not hide unexpected Stripe history errors", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const stripe = makeStripe();
    vi.mocked(stripe.invoices.list).mockRejectedValue("invoice service down");
    const { app } = makeApp(makeDb([subscriptionRow]), makeAuth(), stripe);

    await expect(req(app, "GET", "/billing/history")).rejects.toBe(
      "invoice service down",
    );
  });

  it("creates a customer portal session for subscribed users", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const { app, stripe } = makeApp(makeDb([subscriptionRow]), makeAuth());

    const res = await req(app, "POST", "/billing/portal");

    expect(res.status).toBe(200);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: BASE_ENV.STRIPE_PORTAL_RETURN_URL,
    });
  });

  it("returns billing portal sessions back to subscribe when requested", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "trialing",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const { app, stripe } = makeApp(makeDb([subscriptionRow]), makeAuth());

    const res = await req(app, "POST", "/billing/portal", {
      returnTarget: "subscribe",
    });

    expect(res.status).toBe(200);
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://my.kaiplan.app/subscribe",
    });
  });

  it("returns a controlled error when Stripe no longer has the portal customer", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_deleted",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const stripe = makeStripe();
    vi.mocked(stripe.billingPortal.sessions.create).mockRejectedValue(
      makeStripeResourceMissingError(),
    );
    const { app } = makeApp(makeDb([subscriptionRow]), makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/portal");

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Billing profile not found.",
    });
  });

  it("does not hide unexpected Stripe billing portal errors", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const stripe = makeStripe();
    vi.mocked(stripe.billingPortal.sessions.create).mockRejectedValue(
      "portal service down",
    );
    const { app } = makeApp(makeDb([subscriptionRow]), makeAuth(), stripe);

    await expect(req(app, "POST", "/billing/portal")).rejects.toBe(
      "portal service down",
    );
  });

  it("rejects invalid billing portal payloads", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const { app, stripe } = makeApp(makeDb([subscriptionRow]), makeAuth());

    const res = await req(app, "POST", "/billing/portal", {
      returnTarget: "dashboard",
    });

    expect(res.status).toBe(400);
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("rejects malformed billing portal JSON", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const { app, stripe } = makeApp(makeDb([subscriptionRow]), makeAuth());

    const res = await app.request(
      "/billing/portal",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"returnTarget":',
      },
      BASE_ENV,
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("rejects non-object billing portal JSON", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const { app, stripe } = makeApp(makeDb([subscriptionRow]), makeAuth());

    const res = await req(app, "POST", "/billing/portal", null);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "JSON request body must be an object",
    });
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });

  it("returns 502 when Stripe checkout has no redirect url", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValue({
      id: "cs_missing_url",
      url: null,
    });
    const { app } = makeApp(
      makeDb([[]], [{ stripeCustomerId: "cus_123" }]),
      makeAuth(),
      stripe,
    );

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(res.status).toBe(502);
  });

  it("returns 502 when Stripe portal has no redirect url", async () => {
    const subscriptionRow = [
      {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_pro",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        plan: "pro",
      },
    ];
    const stripe = makeStripe();
    vi.mocked(stripe.billingPortal.sessions.create).mockResolvedValue({
      url: null,
    });
    const { app } = makeApp(makeDb([subscriptionRow]), makeAuth(), stripe);

    const res = await req(app, "POST", "/billing/portal");

    expect(res.status).toBe(502);
  });

  it("rejects portal access when there is no billing profile", async () => {
    const { app } = makeApp(makeDb([[]]), makeAuth());

    const res = await req(app, "POST", "/billing/portal");

    expect(res.status).toBe(400);
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is not configured", async () => {
    const { app } = makeApp(makeDb(), makeAuth());
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_no_secret" }),
      },
      { ...BASE_ENV, STRIPE_WEBHOOK_SECRET: "" },
    );

    expect(res.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("rejects webhook requests without a Stripe signature", async () => {
    const { app } = makeApp(makeDb(), makeAuth());

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        body: JSON.stringify({ id: "evt_missing_sig" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(400);
  });

  it("rejects webhook requests with invalid signatures", async () => {
    const { app, stripe } = makeApp(makeDb(), makeAuth());
    vi.mocked(stripe.webhooks.constructEventAsync).mockImplementation(
      async () => {
        throw new Error("Invalid signature");
      },
    );

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "bad-sig" },
        body: JSON.stringify({ id: "evt_bad" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(400);
  });

  it("ignores duplicate webhook deliveries", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_duplicate",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          items: { data: [{ price: { id: "price_pro" } }] },
          status: "active",
          current_period_end: 1710000000,
        },
      },
    });
    const { app } = makeApp(
      makeDb([[{ eventId: "evt_duplicate" }]]),
      makeAuth(),
      stripe,
    );

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_duplicate" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
  });

  it("processes webhook updates inside a transaction", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_starter_annual",
          customer: "cus_123",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER.id,
            plan: "lifetime",
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_checkout" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
  });

  it("records the checkout subscription id as the lifecycle anchor", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_subscription_anchor",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_subscription_anchor",
          customer: "cus_123",
          subscription: "sub_checkout_current",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
            interval: "month",
          },
        },
      },
    });
    const db = makeDb([
      [
        {
          userId: TEST_USER.id,
          stripeCustomerId: "cus_123",
          pendingCheckoutSessionId: "cs_subscription_anchor",
          pendingCheckoutPlan: "pro",
          pendingCheckoutInterval: "month",
        },
      ],
    ]);
    const insertBuilder = {
      values: vi.fn().mockImplementation((values: unknown) => {
        const record = values as Record<string, unknown>;
        if (record.eventId === "evt_checkout_subscription_anchor") {
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([
                  { eventId: "evt_checkout_subscription_anchor" },
                ]),
            }),
          };
        }
        if (record.userId === TEST_USER.id) {
          return {
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  userId: TEST_USER.id,
                  stripeCustomerId: "cus_123",
                  stripeSubscriptionId: "sub_checkout_current",
                  plan: "pro",
                  status: "trialing",
                },
              ]),
            }),
          };
        }
        return {
          returning: vi.fn().mockResolvedValue([record]),
        };
      }),
    };
    db.insert = vi.fn().mockReturnValue(insertBuilder);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_subscription_anchor" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      stripeSubscriptionId: "sub_checkout_current",
      status: "trialing",
    });
  });

  it("updates subscription state from subscription webhooks", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "active",
          current_period_end: 1710000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_subscription" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).toHaveBeenCalled();
  });

  it("records subscription hydration as a no-op when Stripe metadata points to a deleted user", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_deleted_user",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_deleted_user",
          status: "active",
          current_period_end: 1710000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_deleted_user",
      metadata: { userId: "deleted-user" },
    });
    const db = makeDb([[], []], [{ eventId: "evt_subscription_deleted_user" }]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as unknown as Database["update"];
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_deleted_user" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("hydrates subscription deletions for valid Stripe metadata users", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_deleted_missing_row",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_deleted_missing_row",
          customer: "cus_deleted_missing_row",
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_deleted_missing_row",
      metadata: { userId: TEST_USER.id },
    });
    const db = makeDb([[], [], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as unknown as Database["update"];
    const insertBuilder = {
      values: vi.fn().mockImplementation((values: unknown) => {
        const record = values as Record<string, unknown>;
        if (record.eventId === "evt_subscription_deleted_missing_row") {
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([
                  { eventId: "evt_subscription_deleted_missing_row" },
                ]),
            }),
          };
        }
        if (record.userId === TEST_USER.id) {
          return {
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  userId: TEST_USER.id,
                  stripeCustomerId: "cus_deleted_missing_row",
                  plan: "free",
                  status: "canceled",
                },
              ]),
            }),
          };
        }
        return Promise.resolve(undefined);
      }),
    };
    db.insert = vi.fn().mockReturnValue(insertBuilder);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_deleted_missing_row" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insertBuilder.values).toHaveBeenCalledTimes(3);
    expect(insertBuilder.values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER.id,
        stripeCustomerId: "cus_deleted_missing_row",
        stripeSubscriptionId: "sub_deleted_missing_row",
        plan: "free",
        status: "canceled",
      }),
    );
  });

  it("hydrates subscription deletions without a subscription id when Stripe omits it", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_deleted_without_id",
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_deleted_without_id",
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_deleted_without_id",
      metadata: { userId: TEST_USER.id },
    });
    const db = makeDb([[], [], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as unknown as Database["update"];
    const insertBuilder = {
      values: vi.fn().mockImplementation((values: unknown) => {
        const record = values as Record<string, unknown>;
        if (record.eventId === "evt_subscription_deleted_without_id") {
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([
                  { eventId: "evt_subscription_deleted_without_id" },
                ]),
            }),
          };
        }
        if (record.userId === TEST_USER.id) {
          return {
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  userId: TEST_USER.id,
                  stripeCustomerId: "cus_deleted_without_id",
                  plan: "free",
                  status: "canceled",
                },
              ]),
            }),
          };
        }
        return Promise.resolve(undefined);
      }),
    };
    db.insert = vi.fn().mockReturnValue(insertBuilder);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_deleted_without_id" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const subscriptionInsert = insertBuilder.values.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((record) => record.userId === TEST_USER.id);
    expect(subscriptionInsert).toMatchObject({
      stripeCustomerId: "cus_deleted_without_id",
      plan: "free",
      status: "canceled",
    });
    expect(subscriptionInsert).not.toHaveProperty("stripeSubscriptionId");
  });

  it("updates status for failed invoice payments", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_failed",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_123",
        },
      },
    });
    const db = makeDb(
      [],
      [
        {
          eventId: "evt_invoice_failed",
          userId: TEST_USER.id,
          stripeCustomerId: "cus_123",
          plan: "pro",
          status: "past_due",
        },
      ],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failed" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).toHaveBeenCalled();
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(2);
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      actorUserId: null,
      eventType: "billing.plan.changed",
      targetType: "subscription",
      targetId: TEST_USER.id,
      metadata: expect.objectContaining({
        status: "past_due",
        sourceEventType: "invoice.payment_failed",
        stripeEventId: "evt_invoice_failed",
        stripeCustomerId: "cus_123",
      }),
    });
  });

  it("updates status for successful invoice payments", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_paid",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_123",
        },
      },
    });
    const db = makeDb(
      [],
      [
        {
          eventId: "evt_invoice_paid",
          userId: TEST_USER.id,
          stripeCustomerId: "cus_123",
          plan: "pro",
          status: "active",
        },
      ],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_paid" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).toHaveBeenCalled();
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(2);
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      actorUserId: null,
      eventType: "billing.plan.changed",
      targetType: "subscription",
      targetId: TEST_USER.id,
      metadata: expect.objectContaining({
        status: "active",
        sourceEventType: "invoice.payment_succeeded",
        stripeEventId: "evt_invoice_paid",
        stripeCustomerId: "cus_123",
      }),
    });
  });

  it("does not activate a trial from its zero-dollar creation invoice", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_trial_creation_invoice_paid",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_trial",
          billing_reason: "subscription_create",
          amount_due: 0,
          amount_paid: 0,
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: "sub_trial",
            plan: "pro",
            status: "trialing",
          },
        ],
      ],
      [{ eventId: "evt_trial_creation_invoice_paid" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_trial_creation_invoice_paid" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("hydrates missing subscription rows from out-of-order subscription webhooks", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_missing_row",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_missing",
          status: "active",
          current_period_end: 1710000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {
        userId: TEST_USER.id,
      },
    });
    const db = makeDb([[], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ eventId: "evt_subscription_missing_row" }]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { userId: TEST_USER.id, stripeCustomerId: "cus_missing" },
            ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_missing_row" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalled();
  });

  it("does not let stale Stripe customer webhooks replace the active customer", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_stale_customer",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_stale",
          status: "active",
          current_period_end: 1710000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_stale",
      metadata: {
        userId: TEST_USER.id,
      },
    });

    const db = makeDb(
      [[{ userId: TEST_USER.id, stripeCustomerId: "cus_current" }]],
      [{ eventId: "evt_subscription_stale_customer" }],
    );
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_stale_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_stale");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("does not let stale Stripe customer deletion webhooks cancel the active customer", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_deleted_stale_customer",
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_stale_deleted",
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_stale_deleted",
      metadata: {
        userId: TEST_USER.id,
      },
    });

    const db = makeDb(
      [[], [{ userId: TEST_USER.id, stripeCustomerId: "cus_current" }]],
      [{ eventId: "evt_subscription_deleted_stale_customer" }],
    );
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_deleted_stale_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_stale_deleted");
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("does not let stale Stripe customer invoice success webhooks replace the active customer", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_success_stale_customer",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_stale_invoice_success",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_stale_invoice_success",
      metadata: {
        userId: TEST_USER.id,
      },
    });

    const db = makeDb(
      [[{ userId: TEST_USER.id, stripeCustomerId: "cus_current" }]],
      [{ eventId: "evt_invoice_success_stale_customer" }],
    );
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_success_stale_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith(
      "cus_stale_invoice_success",
    );
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("does not let stale Stripe customer invoice failure webhooks mark the active customer past due", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_failure_stale_customer",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_stale_invoice_failure",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_stale_invoice_failure",
      metadata: {
        userId: TEST_USER.id,
      },
    });

    const db = makeDb(
      [[{ userId: TEST_USER.id, stripeCustomerId: "cus_current" }]],
      [{ eventId: "evt_invoice_failure_stale_customer" }],
    );
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failure_stale_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith(
      "cus_stale_invoice_failure",
    );
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("hydrates active subscription webhooks without resetting trial reminders", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_missing_active_row",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_missing_active",
          status: "active",
          current_period_end: 1710000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing_active",
      metadata: {
        userId: TEST_USER.id,
      },
    });
    const db = makeDb([[], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { eventId: "evt_subscription_missing_active_row" },
            ]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { userId: TEST_USER.id, stripeCustomerId: "cus_missing_active" },
            ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_missing_active_row" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const secondInsertArg = insertBuilder.values.mock.calls[1]?.[0] as {
      stripeCustomerId: string;
      stripePriceId: string;
      plan: string;
      status: string;
      billingGateRequiredAt: null;
      trialEndingReminderSentAt?: Date | null;
    };

    expect(secondInsertArg).toMatchObject({
      stripeCustomerId: "cus_missing_active",
      stripePriceId: "price_pro",
      plan: "pro",
      status: "active",
      billingGateRequiredAt: null,
    });
    expect(secondInsertArg).not.toHaveProperty("trialEndingReminderSentAt");
  });

  it("hydrates missing subscription rows from explicit trial_start webhook fields", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_missing_trial_start",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_missing_trial_start",
          trial_start: 1707523200,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing_trial_start",
      metadata: {
        userId: TEST_USER.id,
      },
    });
    const db = makeDb([[], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { eventId: "evt_subscription_missing_trial_start" },
            ]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              userId: TEST_USER.id,
              stripeCustomerId: "cus_missing_trial_start",
            },
          ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_missing_trial_start" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const secondInsertArg = insertBuilder.values.mock.calls[1]?.[0] as {
      status: string;
      trialStartedAt?: Date | null;
      trialEndingReminderSentAt?: Date | null;
    };

    expect(secondInsertArg.status).toBe("inactive");
    expect(secondInsertArg.trialStartedAt).toBeInstanceOf(Date);
    expect(secondInsertArg).not.toHaveProperty("trialEndingReminderSentAt");
  });

  it("hydrates missing subscription rows from invoice webhooks", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_missing_row",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_missing",
          subscription: "sub_invoice_missing_row",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {
        userId: TEST_USER.id,
      },
    });
    const db = makeDb([[], [], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ eventId: "evt_invoice_missing_row" }]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { userId: TEST_USER.id, stripeCustomerId: "cus_missing" },
            ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_missing_row" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalled();
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const upsertCall = insertBuilder.values.mock.calls[1]?.[0] as
      | { stripeSubscriptionId?: string }
      | undefined;
    expect(upsertCall?.stripeSubscriptionId).toBe("sub_invoice_missing_row");
  });

  it("hydrates invoice webhooks using the matching subscription price line", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_missing_row_with_proration",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_missing",
          lines: {
            data: [
              { price: { id: "price_proration" } },
              { price: { id: "price_pro" } },
            ],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {
        userId: TEST_USER.id,
      },
    });
    const db = makeDb([[], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const onConflictDoUpdate = vi.fn().mockReturnValue({
      returning: vi
        .fn()
        .mockResolvedValue([
          { userId: TEST_USER.id, stripeCustomerId: "cus_missing" },
        ]),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { eventId: "evt_invoice_missing_row_with_proration" },
            ]),
        }),
        onConflictDoUpdate,
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_missing_row_with_proration" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(onConflictDoUpdate).toHaveBeenCalled();
    expect(onConflictDoUpdate.mock.calls[0]?.[0]).toMatchObject({
      set: expect.objectContaining({
        stripePriceId: "price_pro",
        plan: "pro",
      }),
    });
  });

  it("hydrates missing subscription rows from failed invoice webhooks", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_failed_missing_row",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_missing",
          subscription: "sub_invoice_failed_missing_row",
          lines: {
            data: [{ price: { id: "price_starter" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {
        userId: TEST_USER.id,
      },
    });
    const db = makeDb([[], [], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ eventId: "evt_invoice_failed_missing_row" }]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { userId: TEST_USER.id, stripeCustomerId: "cus_missing" },
            ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failed_missing_row" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalled();
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const upsertCall = insertBuilder.values.mock.calls[1]?.[0] as
      | { stripeSubscriptionId?: string }
      | undefined;
    expect(upsertCall?.stripeSubscriptionId).toBe(
      "sub_invoice_failed_missing_row",
    );
  });

  it("records invoice payment success as a no-op when Stripe metadata points to a deleted user", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_deleted_user",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_invoice_deleted_user",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_invoice_deleted_user",
      metadata: { userId: "deleted-user" },
    });
    const db = makeDb([[], []], [{ eventId: "evt_invoice_deleted_user" }]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as unknown as Database["update"];
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_deleted_user" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("records invoice payment failure as a no-op when Stripe metadata points to a deleted user", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_failed_deleted_user",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_invoice_failed_deleted_user",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_invoice_failed_deleted_user",
      metadata: { userId: "deleted-user" },
    });
    const db = makeDb(
      [[], []],
      [{ eventId: "evt_invoice_failed_deleted_user" }],
    );
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }) as unknown as Database["update"];
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failed_deleted_user" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("ignores checkout completion events without valid metadata", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_missing_metadata",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_pro_annual",
          customer: "cus_123",
          payment_status: "paid",
          metadata: {},
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_checkout_missing_metadata" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_missing_metadata" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("ignores checkout completion events when metadata is missing entirely", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_no_metadata",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_starter_monthly",
          customer: "cus_123",
          payment_status: "paid",
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_checkout_no_metadata" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_no_metadata" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
  });

  it("stores inactive status for unpaid checkout completion events", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_unpaid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_checkout_unpaid",
          customer: "cus_123",
          payment_status: "unpaid",
          status: "incomplete",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_unpaid" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_unpaid" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      status: "inactive",
    });
  });

  it("stores inactive status when unpaid checkout events omit a session status", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_unpaid_missing_status",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_unpaid_missing_status",
          customer: "cus_123",
          payment_status: "unpaid",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_unpaid_missing_status" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_unpaid_missing_status" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      status: "inactive",
    });
  });

  it("stores active status for pro checkout completion events", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_pro",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_checkout_out_of_order",
          customer: "cus_123",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_checkout_pro" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_pro" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
  });

  it("ignores stale checkout completion events for an old Stripe customer", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_old_customer",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_old",
          customer: "cus_old",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb(
      [[{ userId: TEST_USER.id, stripeCustomerId: "cus_current" }]],
      [{ eventId: "evt_checkout_old_customer" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_old_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("ignores checkout completion events that do not match the pending session", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_wrong_session",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_old",
          customer: "cus_current",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_current",
            pendingCheckoutSessionId: "cs_current",
          },
        ],
      ],
      [{ eventId: "evt_checkout_wrong_session" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_wrong_session" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("uses the pending checkout plan instead of mismatched checkout metadata", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_metadata_mismatch",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_pending",
          customer: "cus_current",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
            interval: "year",
          },
        },
      },
    });
    const pendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_current",
      pendingCheckoutSessionId: "cs_pending",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
    };
    const db = makeDb(
      [[pendingSubscription], [pendingSubscription]],
      [{ eventId: "evt_checkout_metadata_mismatch" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_metadata_mismatch" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      userId: TEST_USER.id,
      stripePriceId: TEST_STRIPE_PRICE_IDS.starter.month,
      plan: "starter",
      status: "trialing",
    });
  });

  it("uses the pending checkout plan when checkout metadata omits a valid plan", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_pending_invalid_plan",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_pending_invalid_plan",
          customer: "cus_current",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "enterprise",
            interval: "year",
          },
        },
      },
    });
    const pendingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_current",
      pendingCheckoutSessionId: "cs_pending_invalid_plan",
      pendingCheckoutPlan: "starter",
      pendingCheckoutInterval: "month",
    };
    const db = makeDb(
      [[pendingSubscription]],
      [{ eventId: "evt_checkout_pending_invalid_plan" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_pending_invalid_plan" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = db.insert as unknown as ReturnType<typeof vi.fn>;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      userId: TEST_USER.id,
      stripePriceId: TEST_STRIPE_PRICE_IDS.starter.month,
      plan: "starter",
      status: "trialing",
    });
  });

  it("ignores checkout completion events without a session id or customer id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_missing_anchor",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: null,
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: null,
            pendingCheckoutSessionId: null,
          },
        ],
      ],
      [{ eventId: "evt_checkout_missing_anchor" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_missing_anchor" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("ignores checkout completion events with a customer but no session id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_missing_session_id",
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_first",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: null,
            pendingCheckoutSessionId: null,
          },
        ],
      ],
      [{ eventId: "evt_checkout_missing_session_id" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_missing_session_id" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("allows first checkout completion when the user has no Stripe customer yet", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_first_customer",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_first",
          customer: "cus_first",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: null,
            pendingCheckoutSessionId: null,
          },
        ],
      ],
      [{ eventId: "evt_checkout_first_customer" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_first_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("hydrates checkout completion when the metadata user has no subscription row yet", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_missing_subscription_row",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_missing_subscription_row",
          customer: "cus_first",
          subscription: "sub_missing_subscription_row",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_missing_subscription_row" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_missing_subscription_row" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("allows checkout completion for an existing same-customer legacy row without a pending session", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_same_customer_legacy",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_same_customer_legacy",
          customer: "cus_existing",
          subscription: "sub_same_customer_legacy",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_existing",
            pendingCheckoutSessionId: null,
            pendingCheckoutPlan: null,
            pendingCheckoutInterval: null,
            plan: "free",
            status: "inactive",
          },
        ],
      ],
      [{ eventId: "evt_checkout_same_customer_legacy" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_same_customer_legacy" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("ignores checkout completion for an already-canceled same-customer row without a pending session", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_same_customer_canceled",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_same_customer_canceled",
          customer: "cus_existing",
          subscription: "sub_same_customer_canceled",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_existing",
            pendingCheckoutSessionId: null,
            pendingCheckoutPlan: null,
            pendingCheckoutInterval: null,
            plan: "free",
            status: "canceled",
          },
        ],
      ],
      [{ eventId: "evt_checkout_same_customer_canceled" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_same_customer_canceled" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("records checkout completion as a no-op when metadata points to a deleted user", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_deleted_user",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_deleted_user",
          customer: "cus_deleted_user",
          mode: "subscription",
          payment_status: "no_payment_required",
          metadata: {
            userId: "deleted-user",
            plan: "pro",
          },
        },
      },
    });
    const db = makeDb([[], []], [{ eventId: "evt_checkout_deleted_user" }]);
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_deleted_user" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("ignores checkout completion events with unsupported plan metadata", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_unknown_plan",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_unknown_plan",
          customer: "cus_unknown_plan",
          mode: "subscription",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER.id,
            plan: "enterprise",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_unknown_plan" }],
    );
    const insert = db.insert as unknown as ReturnType<typeof vi.fn>;
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_unknown_plan" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("stores the annual price ID when checkout session metadata contains interval year", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_starter_annual",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_checkout_lifetime_no_period_end",
          customer: "cus_123",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
            interval: "year",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_starter_annual" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_starter_annual" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    // The shared insertBuilder.values is called twice: first for processedWebhookEvent,
    // second for upsertSubscription. Check the second call (index 1).
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      userId: TEST_USER.id,
      stripePriceId: TEST_STRIPE_PRICE_IDS.starter.year,
      plan: "starter",
      status: "active",
    });
  });

  it("stores the annual pro price ID when checkout session metadata contains plan pro and interval year", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_pro_annual",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_pro_annual",
          customer: "cus_123",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER.id,
            plan: "pro",
            interval: "year",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_pro_annual" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_pro_annual" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    // The shared insertBuilder.values is called twice: first for processedWebhookEvent,
    // second for upsertSubscription. Check the second call (index 1).
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      userId: TEST_USER.id,
      stripePriceId: TEST_STRIPE_PRICE_IDS.pro.year,
      plan: "pro",
      status: "active",
    });
  });

  it("defaults to the monthly price ID when checkout session metadata interval is absent", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_starter_no_interval",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_starter_no_interval",
          customer: "cus_123",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_starter_no_interval" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_starter_no_interval" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    // The shared insertBuilder.values is called twice: first for processedWebhookEvent,
    // second for upsertSubscription. Check the second call (index 1).
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      userId: TEST_USER.id,
      stripePriceId: TEST_STRIPE_PRICE_IDS.starter.month,
      plan: "starter",
      status: "active",
    });
  });

  it("handles subscription deletion webhook payloads without price data", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_123",
          status: "canceled",
          items: { data: [] },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_subscription_deleted" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_deleted" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).toHaveBeenCalled();
  });

  it("handles subscription webhook payloads without status or billing period", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_missing_fields",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          items: { data: [] },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_subscription_missing_fields" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_missing_fields" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
  });

  it("ignores subscription webhooks without a customer id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_missing_customer",
      type: "customer.subscription.updated",
      data: {
        object: {
          status: "active",
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_subscription_missing_customer" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_missing_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it("skips subscription hydration when the customer metadata has no user id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_missing_user",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_missing",
          status: "active",
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {},
    });
    const db = makeDb([], [{ eventId: "evt_subscription_missing_user" }]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_missing_user" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1);
  });

  it("handles invoice webhooks without a customer id", async () => {
    const stripe = makeStripe();
    const db = makeDb([], [{ eventId: "evt_invoice_missing_customer" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValueOnce({
      id: "evt_invoice_paid_missing_customer",
      type: "invoice.payment_succeeded",
      data: {
        object: {},
      },
    });
    const paidRes = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_paid_missing_customer" }),
      },
      BASE_ENV,
    );

    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValueOnce({
      id: "evt_invoice_failed_missing_customer",
      type: "invoice.payment_failed",
      data: {
        object: {},
      },
    });
    const failedRes = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failed_missing_customer" }),
      },
      BASE_ENV,
    );

    expect(paidRes.status).toBe(200);
    expect(failedRes.status).toBe(200);
  });

  it("skips failed invoice hydration when the customer metadata has no user id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_failed_missing_user",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_missing",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {},
    });
    const db = makeDb([], [{ eventId: "evt_invoice_failed_missing_user" }]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failed_missing_user" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1);
  });

  it("skips paid invoice hydration when the customer metadata has no user id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_paid_missing_user",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_missing",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {},
    });
    const db = makeDb([], [{ eventId: "evt_invoice_paid_missing_user" }]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_paid_missing_user" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1);
  });

  it("skips failed invoice hydration when the invoice omits its price id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_failed_missing_price",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_missing",
          lines: {
            data: [{}],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {
        userId: TEST_USER.id,
      },
    });
    const db = makeDb([], [{ eventId: "evt_invoice_failed_missing_price" }]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failed_missing_price" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1);
  });

  it("skips paid invoice hydration when the invoice omits its price id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_paid_missing_price",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_missing",
          lines: {
            data: [{}],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {
        userId: TEST_USER.id,
      },
    });
    const db = makeDb([], [{ eventId: "evt_invoice_paid_missing_price" }]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_paid_missing_price" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1);
  });

  it("creates an annual starter checkout session using the annual price id", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        mode: "subscription",
        line_items: [{ price: "price_starter_annual", quantity: 1 }],
        metadata: expect.objectContaining({ interval: "year" }),
      }),
    );
    const callArg = vi.mocked(stripe.checkout.sessions.create).mock
      .calls[0]?.[0];
    expect(callArg).not.toHaveProperty("discounts");
    expect(callArg).not.toHaveProperty("allow_promotion_codes");
  });

  it("creates an annual pro checkout session using the annual price id", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "pro",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_pro_annual", quantity: 1 }],
        metadata: expect.objectContaining({ interval: "year" }),
      }),
    );
    const callArg = vi.mocked(stripe.checkout.sessions.create).mock
      .calls[0]?.[0];
    expect(callArg).not.toHaveProperty("discounts");
    expect(callArg).not.toHaveProperty("allow_promotion_codes");
  });

  it("uses the lifetime price id even when interval is year", async () => {
    const db = makeDb([[]], [{ stripeCustomerId: "cus_123" }]);
    const { app, stripe } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "lifetime",
      interval: "year",
    });

    expect(res.status).toBe(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        line_items: [{ price: "price_lifetime", quantity: 1 }],
      }),
    );
  });

  it("accepts unrelated webhook events without mutating subscriptions", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_other",
      type: "charge.refunded",
      data: {
        object: {},
      },
    });
    const db = makeDb([], [{ eventId: "evt_other" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_other" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("does not clobber currentPeriodEnd when checkout.session.completed arrives after subscription.updated", async () => {
    // Out-of-order delivery: subscription.updated sets currentPeriodEnd first,
    // then checkout.session.completed arrives. The checkout handler must NOT
    // write currentPeriodEnd: null into the subscription row.
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_out_of_order",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_checkout_out_of_order",
          customer: "cus_123",
          payment_status: "paid",
          mode: "subscription",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_out_of_order" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_out_of_order" }),
      },
      BASE_ENV,
    );

    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    // The second call to values() is for upsertSubscription — it must NOT include currentPeriodEnd
    const upsertCall = insertBuilder.values.mock.calls[1]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(upsertCall).toBeDefined();
    expect(Object.keys(upsertCall ?? {})).not.toContain("currentPeriodEnd");
  });

  it("does not write currentPeriodEnd for lifetime checkout.session.completed", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_lifetime_no_period_end",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_checkout_lifetime_no_period_end",
          customer: "cus_123",
          payment_status: "paid",
          mode: "payment",
          metadata: {
            userId: TEST_USER.id,
            plan: "lifetime",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_lifetime_no_period_end" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_lifetime_no_period_end" }),
      },
      BASE_ENV,
    );

    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const upsertCall = insertBuilder.values.mock.calls[1]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(upsertCall).toBeDefined();
    expect(Object.keys(upsertCall ?? {})).not.toContain("currentPeriodEnd");
  });

  it("downgrades to free when charge.refunded carries lifetime purchase metadata", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_charge_refunded_lifetime",
      type: "charge.refunded",
      data: {
        object: {
          customer: "cus_123",
          metadata: {
            plan: "lifetime",
            userId: TEST_USER.id,
          },
        },
      },
    });
    // Provide the lifetime subscription row so loadSubscriptionByCustomerId
    // returns a lifetime plan (H4 fix: subscription lookup, not charge metadata).
    const lifetimeSubRow = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_123",
      stripePriceId: "price_lifetime",
      plan: "lifetime",
      status: "active",
      currentPeriodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb(
      [[lifetimeSubRow]],
      [{ eventId: "evt_charge_refunded_lifetime" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_charge_refunded_lifetime" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setCall.set.mock.calls[0]?.[0]).toMatchObject({
      plan: "free",
      status: "canceled",
    });
  });

  it("downgrades to free when charge.dispute.created carries lifetime purchase metadata", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_charge_dispute_lifetime",
      type: "charge.dispute.created",
      data: {
        object: {
          customer: "cus_123",
          metadata: {
            plan: "lifetime",
            userId: TEST_USER.id,
          },
        },
      },
    });
    // Provide the lifetime subscription row so loadSubscriptionByCustomerId
    // returns a lifetime plan (H4 fix: subscription lookup, not charge metadata).
    const lifetimeSubRow = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_123",
      stripePriceId: "price_lifetime",
      plan: "lifetime",
      status: "active",
      currentPeriodEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const db = makeDb(
      [[lifetimeSubRow]],
      [{ eventId: "evt_charge_dispute_lifetime" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_charge_dispute_lifetime" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setCall.set.mock.calls[0]?.[0]).toMatchObject({
      plan: "free",
      status: "canceled",
    });
  });

  it("hydrates missing subscription rows from subscription.deleted webhooks", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_deleted_hydrate",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_deleted_hydrate",
          customer: "cus_missing",
          status: "canceled",
          items: { data: [] },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: { userId: TEST_USER.id },
    });
    const db = makeDb([[], [], [{ id: TEST_USER.id }]]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ eventId: "evt_sub_deleted_hydrate" }]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              userId: TEST_USER.id,
              stripeCustomerId: "cus_missing",
              plan: "free",
              status: "canceled",
            },
          ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_deleted_hydrate" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalled();
    const insertCalls = (
      db as unknown as { insert: ReturnType<typeof vi.fn> }
    ).insert.mock.results.flatMap((result) => {
      const insertBuilder = result.value as {
        values?: ReturnType<typeof vi.fn>;
      };
      return insertBuilder.values?.mock.calls.map((call) => call[0]) ?? [];
    });
    expect(insertCalls).toContainEqual(
      expect.objectContaining({
        stripeSubscriptionId: "sub_deleted_hydrate",
        plan: "free",
        status: "canceled",
      }),
    );
  });

  it("skips subscription.deleted hydration when customer metadata has no user id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_deleted_no_user",
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_missing",
          status: "canceled",
          items: { data: [] },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_missing",
      metadata: {},
    });
    const db = makeDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ eventId: "evt_sub_deleted_no_user" }]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_deleted_no_user" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_missing");
  });

  it("ignores subscription.deleted webhook when customer id is missing", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_deleted_no_customer",
      type: "customer.subscription.deleted",
      data: {
        object: {
          status: "canceled",
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_sub_deleted_no_customer" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_deleted_no_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it("ignores charge.refunded when customer id is missing from the charge object", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_refund_no_customer",
      type: "charge.refunded",
      data: {
        object: {
          metadata: { plan: "lifetime" },
          // customer is absent / not a string
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_refund_no_customer" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_refund_no_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("does not mutate subscriptions when charge.refunded lacks lifetime metadata", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_charge_refunded_non_lifetime",
      type: "charge.refunded",
      data: {
        object: {
          customer: "cus_123",
          metadata: {
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_charge_refunded_non_lifetime" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_charge_refunded_non_lifetime" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("returns 409 when an active subscriber attempts checkout", async () => {
    const db = makeDb([
      [
        {
          userId: TEST_USER.id,
          stripeCustomerId: "cus_123",
          stripePriceId: "price_pro",
          status: "active",
          currentPeriodEnd: new Date("2026-05-01"),
          plan: "pro",
        },
      ],
    ]);
    const { app } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", { plan: "pro" });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Already subscribed",
    });
  });

  it("returns 409 when a trialing subscriber attempts checkout", async () => {
    const db = makeDb([
      [
        {
          userId: TEST_USER.id,
          stripeCustomerId: "cus_123",
          stripePriceId: "price_starter",
          status: "trialing",
          currentPeriodEnd: new Date("2026-05-01"),
          plan: "starter",
        },
      ],
    ]);
    const { app } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "Already subscribed",
    });
  });

  it("sets plan to free and status to canceled on subscription.deleted", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_deleted_downgrade",
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_123",
          status: "canceled",
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_sub_deleted_downgrade" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_deleted_downgrade" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setCall.set.mock.calls[0]?.[0]).toMatchObject({
      plan: "free",
      status: "canceled",
    });
  });

  it("sets status to past_due on invoice.payment_failed", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_inv_failed_past_due",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_123",
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_inv_failed_past_due" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_inv_failed_past_due" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    expect(setCall.set.mock.calls[0]?.[0]).toMatchObject({
      status: "past_due",
    });
  });

  it("logs an error when Stripe signature verification fails", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockImplementation(
      async () => {
        throw new Error("Webhook signature verification failed");
      },
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = makeApp(makeDb(), makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "bad-sig" },
        body: JSON.stringify({ id: "evt_bad_sig" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(400);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("reads currentPeriodEnd from items.data[0].current_period_end (not top-level)", async () => {
    const stripe = makeStripe();
    const expectedTimestamp = 1750000000;
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_period_end_nested",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "active",
          // Intentionally absent at top level — only present in the nested path
          items: {
            data: [
              {
                price: { id: "price_pro" },
                current_period_end: expectedTimestamp,
              },
            ],
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_period_end_nested" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_period_end_nested" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    const setArg = setCall.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.currentPeriodEnd).toBeInstanceOf(Date);
    expect((setArg.currentPeriodEnd as Date).getTime()).toBe(
      expectedTimestamp * 1000,
    );
  });

  it("does not perform E2E immediate upsert when ENVIRONMENT is production", async () => {
    const existingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    const db = makeDb([[existingSubscription], [existingSubscription]]);
    const { app } = makeApp(db, makeAuth());

    const res = await app.request(
      "/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      },
      { ...BASE_ENV, E2E_MODE: "true", ENVIRONMENT: "production" },
    );

    expect(res.status).toBe(200);
    // In production the immediate upsert must NOT happen — insert should not
    // have been called (no subscription write outside of the Stripe webhook flow)
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("allows checkout for a user whose subscription is active+free (not blocked by 409)", async () => {
    // An active+free record is a placeholder, not a real paid subscription.
    // The 409 guard must NOT fire for this combination.
    const activeFreeSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_123",
      stripePriceId: null,
      status: "active",
      currentPeriodEnd: null,
      plan: "free",
    };
    const db = makeDb(
      [[activeFreeSubscription], [activeFreeSubscription]],
      [{ stripeCustomerId: "cus_123" }],
    );
    const { app } = makeApp(db, makeAuth());

    const res = await req(app, "POST", "/billing/checkout", {
      plan: "starter",
    });

    // Must proceed to checkout — NOT return 409
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      url: "https://checkout.stripe.com/c/pay/cs_123",
    });
  });

  it("castMetadata: treats null metadata as an empty object (no-op charge.refunded)", async () => {
    // metadata: null → castMetadata returns {} → plan !== "lifetime" → no DB write
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_refund_metadata_null",
      type: "charge.refunded",
      data: {
        object: {
          customer: "cus_123",
          metadata: null,
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_refund_metadata_null" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_refund_metadata_null" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("castMetadata: treats array metadata as an empty object (no-op charge.refunded)", async () => {
    // metadata: [] → castMetadata returns {} → plan !== "lifetime" → no DB write
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_refund_metadata_array",
      type: "charge.refunded",
      data: {
        object: {
          customer: "cus_123",
          metadata: ["lifetime"],
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_refund_metadata_array" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_refund_metadata_array" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("castMetadata: treats non-object (string) metadata as an empty object (no-op charge.refunded)", async () => {
    // metadata: "lifetime" string → castMetadata returns {} → plan !== "lifetime" → no DB write
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_refund_metadata_string",
      type: "charge.refunded",
      data: {
        object: {
          customer: "cus_123",
          metadata: "lifetime",
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_refund_metadata_string" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_refund_metadata_string" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("subscription.created sets plan, status, and currentPeriodEnd from items.data[0].current_period_end", async () => {
    const stripe = makeStripe();
    const expectedTimestamp = 1750000000;
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_created",
      type: "customer.subscription.created",
      data: {
        object: {
          customer: "cus_123",
          status: "trialing",
          items: {
            data: [
              {
                price: { id: "price_pro" },
                current_period_end: expectedTimestamp,
              },
            ],
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_sub_created" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_created" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    const setArg = setCall.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.plan).toBe("pro");
    expect(setArg.status).toBe("trialing");
    expect(setArg.currentPeriodEnd).toBeInstanceOf(Date);
    expect((setArg.currentPeriodEnd as Date).getTime()).toBe(
      expectedTimestamp * 1000,
    );
  });

  it("writes an audit log when a subscription webhook changes the plan", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_created_audit",
      type: "customer.subscription.created",
      data: {
        object: {
          customer: "cus_123",
          status: "trialing",
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_sub_created_audit" }]);
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              userId: TEST_USER.id,
              stripeCustomerId: "cus_123",
              plan: "pro",
              status: "trialing",
            },
          ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_created_audit" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(2);
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
      actorUserId: null,
      eventType: "billing.plan.changed",
      targetType: "subscription",
      targetId: TEST_USER.id,
      metadata: expect.objectContaining({
        plan: "pro",
        status: "trialing",
        sourceEventType: "customer.subscription.created",
        stripeCustomerId: "cus_123",
      }),
    });
  });

  it("subscription.created idempotency: duplicate event id short-circuits processing", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_created_duplicate",
      type: "customer.subscription.created",
      data: {
        object: {
          customer: "cus_123",
          status: "trialing",
          items: { data: [{ price: { id: "price_pro" } }] },
          current_period_end: 1750000000,
        },
      },
    });
    // Simulate the processedWebhookEvent insert returning empty (conflict →
    // duplicate already in the idempotency table).
    const db = makeDb();
    db.transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          select: db.select,
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          update: db.update,
        }),
      );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_created_duplicate" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    // update must NOT be called since the event was already processed
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("subscription.created hydrates a missing row when the customer is not in the DB yet", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_created_hydrate",
      type: "customer.subscription.created",
      data: {
        object: {
          customer: "cus_new",
          status: "trialing",
          items: {
            data: [
              {
                price: { id: "price_starter" },
                current_period_end: 1750000000,
              },
            ],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_new",
      metadata: { userId: TEST_USER.id },
    });
    const db = makeDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ eventId: "evt_sub_created_hydrate" }]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              userId: TEST_USER.id,
              stripeCustomerId: "cus_new",
              plan: "starter",
              status: "trialing",
            },
          ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_created_hydrate" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_new");
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalled();
  });

  it("invoice.payment_failed hydration fallback: upserts a new row when customer is not in the DB yet", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_failed_hydrate",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_new_failed",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_new_failed",
      metadata: { userId: TEST_USER.id },
    });
    const db = makeDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ eventId: "evt_invoice_failed_hydrate" }]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              userId: TEST_USER.id,
              stripeCustomerId: "cus_new_failed",
              plan: "pro",
              status: "past_due",
            },
          ]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failed_hydrate" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(stripe.customers.retrieve).toHaveBeenCalledWith("cus_new_failed");
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalled();
    // The upsert call should persist past_due status and pro plan
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const onConflictDoUpdate =
      insertBuilder.values.mock.results[1]?.value?.onConflictDoUpdate;
    if (onConflictDoUpdate) {
      expect(onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            status: "past_due",
            plan: "pro",
          }),
        }),
      );
    }
  });

  it("is a no-op for the second delivery of the same event id", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_idempotent",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "active",
          items: { data: [{ price: { id: "price_pro" } }] },
          current_period_end: 1710000000,
        },
      },
    });
    // Second delivery: insert returns empty (conflict → duplicate)
    const db = makeDb([], []);
    db.transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          select: db.select,
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          update: db.update,
        }),
      );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_idempotent" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    // update should NOT be called since the event was a duplicate
    expect(
      (db as unknown as { update: ReturnType<typeof vi.fn> }).update,
    ).not.toHaveBeenCalled();
  });

  it("does not perform E2E immediate upsert when ENVIRONMENT is undefined (fail-closed)", async () => {
    // When ENVIRONMENT is not set, the bypass gate must fail-closed — the
    // immediate subscription upsert must NOT happen even if E2E_MODE is true.
    const existingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    const db = makeDb([[existingSubscription], [existingSubscription]]);
    const { app } = makeApp(db, makeAuth());

    const res = await app.request(
      "/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      },
      { ...BASE_ENV, E2E_MODE: "true", ENVIRONMENT: undefined },
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("performs E2E immediate upsert when ENVIRONMENT is development", async () => {
    const existingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    const db = makeDb([[existingSubscription], [existingSubscription]]);
    const { app } = makeApp(db, makeAuth());

    const res = await app.request(
      "/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      },
      { ...BASE_ENV, E2E_MODE: "true", ENVIRONMENT: "development" },
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("performs E2E immediate upsert when ENVIRONMENT is test", async () => {
    const existingSubscription = {
      userId: TEST_USER.id,
      stripeCustomerId: "cus_existing",
      stripePriceId: null,
      status: "inactive",
      currentPeriodEnd: null,
      plan: "free",
    };
    const db = makeDb([[existingSubscription], [existingSubscription]]);
    const { app } = makeApp(db, makeAuth());

    const res = await app.request(
      "/billing/checkout",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      },
      { ...BASE_ENV, E2E_MODE: "true", ENVIRONMENT: "test" },
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  // ─── Fix 1: deleted customer guard ───────────────────────────────────────

  it("returns 200 without error when subscription webhook fires for a deleted customer", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_deleted_customer",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_deleted",
          status: "active",
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    // Stripe returns a DeletedCustomer object
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_deleted",
      deleted: true,
      metadata: {},
    } as Parameters<typeof stripe.customers.retrieve>[0] extends string
      ? never
      : Awaited<ReturnType<typeof stripe.customers.retrieve>>);
    const db = makeDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ eventId: "evt_sub_deleted_customer" }]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_deleted_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    // No upsert should happen for a deleted customer
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1); // only processedWebhookEvent insert
  });

  it("returns 200 without error when subscription.deleted webhook fires for a deleted customer", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_canceled_deleted_customer",
      type: "customer.subscription.deleted",
      data: {
        object: {
          customer: "cus_deleted",
          status: "canceled",
          items: { data: [] },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_deleted",
      deleted: true,
      metadata: {},
    } as Awaited<ReturnType<typeof stripe.customers.retrieve>>);
    const db = makeDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { eventId: "evt_sub_canceled_deleted_customer" },
            ]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_canceled_deleted_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1); // only processedWebhookEvent insert
  });

  it("returns 200 without error when invoice.payment_succeeded fires for a deleted customer", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_paid_deleted_customer",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_deleted",
          lines: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_deleted",
      deleted: true,
      metadata: {},
    } as Awaited<ReturnType<typeof stripe.customers.retrieve>>);
    const db = makeDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { eventId: "evt_invoice_paid_deleted_customer" },
            ]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_paid_deleted_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1);
  });

  it("returns 200 without error when invoice.payment_failed fires for a deleted customer", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_failed_deleted_customer",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_deleted",
          lines: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    });
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({
      id: "cus_deleted",
      deleted: true,
      metadata: {},
    } as Awaited<ReturnType<typeof stripe.customers.retrieve>>);
    const db = makeDb();
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { eventId: "evt_invoice_failed_deleted_customer" },
            ]),
        }),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_invoice_failed_deleted_customer" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(
      (db as unknown as { insert: ReturnType<typeof vi.fn> }).insert,
    ).toHaveBeenCalledTimes(1);
  });

  // ─── Fix 2: trial subscription status from checkout.session ──────────────

  it("does not set subscription status to active for a trial checkout (payment_status: no_payment_required)", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_trial",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_checkout_trial",
          customer: "cus_123",
          mode: "subscription",
          payment_status: "no_payment_required",
          status: "complete",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_trial" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_trial" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const upsertCall = insertBuilder.values.mock.calls[1]?.[0] as
      | Record<string, unknown>
      | undefined;
    // For a trial subscription checkout, status must NOT be "active"
    expect(upsertCall).toBeDefined();
    expect(upsertCall?.status).toBe("trialing");
  });

  it("does not set subscription status to active for a paid subscription checkout (mode: subscription)", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_sub_paid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_checkout_sub_paid",
          customer: "cus_123",
          mode: "subscription",
          payment_status: "paid",
          status: "complete",
          metadata: {
            userId: TEST_USER.id,
            plan: "starter",
          },
        },
      },
    });
    const db = makeDb(
      [[], [{ id: TEST_USER.id }]],
      [{ eventId: "evt_checkout_sub_paid" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_sub_paid" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
      .insert;
    const insertBuilder = insertMock.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    const upsertCall = insertBuilder.values.mock.calls[1]?.[0] as
      | Record<string, unknown>
      | undefined;
    // Subscription status must NOT be set to "active" from checkout event
    expect(upsertCall).toBeDefined();
    expect(upsertCall?.status).toBe("trialing");
  });

  it("sets subscription status to active for a paid lifetime checkout (mode: payment)", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_checkout_lifetime_paid",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_checkout_lifetime_paid",
          customer: "cus_123",
          mode: "payment",
          payment_status: "paid",
          status: "complete",
          metadata: {
            userId: TEST_USER.id,
            plan: "lifetime",
          },
        },
      },
    });
    const db = makeDb([[], [{ id: TEST_USER.id }]]);
    const insertBuilder = {
      values: vi.fn().mockImplementation((values: unknown) => {
        const record = values as Record<string, unknown>;
        if (record.eventId === "evt_checkout_lifetime_paid") {
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockResolvedValue([{ eventId: "evt_checkout_lifetime_paid" }]),
            }),
          };
        }
        if (record.userId === TEST_USER.id) {
          return {
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  userId: TEST_USER.id,
                  stripeCustomerId: "cus_123",
                  plan: "lifetime",
                  status: "active",
                },
              ]),
            }),
          };
        }
        return Promise.resolve(undefined);
      }),
    };
    db.insert = vi.fn().mockReturnValue(insertBuilder);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_checkout_lifetime_paid" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const upsertCall = insertBuilder.values.mock.calls[1]?.[0] as
      | Record<string, unknown>
      | undefined;
    // For a lifetime (payment mode) checkout paid, status SHOULD be "active"
    expect(upsertCall?.status).toBe("active");
    expect(insertBuilder.values.mock.calls[2]?.[0]).toMatchObject({
      actorUserId: TEST_USER.id,
      eventType: "billing.plan.changed",
      targetType: "subscription",
      targetId: TEST_USER.id,
      metadata: expect.objectContaining({
        plan: "lifetime",
        status: "active",
        sourceEventType: "checkout.session.completed",
      }),
    });
  });

  it("customer.subscription.created with status trialing sets subscription to trialing", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_sub_created_trialing",
      type: "customer.subscription.created",
      data: {
        object: {
          customer: "cus_123",
          status: "trialing",
          items: {
            data: [
              {
                price: { id: "price_starter" },
                current_period_end: 1750000000,
              },
            ],
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_sub_created_trialing" }]);
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_sub_created_trialing" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    expect(updateMock).toHaveBeenCalled();
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    const setArg = setCall.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.status).toBe("trialing");
    expect(setArg.plan).toBe("starter");
  });

  it("ignores stale subscription deletion events for a previous Stripe subscription", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_stale_subscription_deleted",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_previous",
          customer: "cus_123",
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: "sub_current",
            plan: "pro",
            status: "active",
          },
        ],
      ],
      [{ eventId: "evt_stale_subscription_deleted" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_stale_subscription_deleted" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it("ignores stale active subscription events for a previous Stripe subscription", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_stale_subscription_active",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_previous",
          customer: "cus_123",
          status: "active",
          current_period_end: 1750000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: "sub_current",
            plan: "pro",
            status: "active",
          },
        ],
      ],
      [{ eventId: "evt_stale_subscription_active" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_stale_subscription_active" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it("ignores invoice success events for a previous Stripe subscription", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_stale_invoice_success_previous_subscription",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_previous",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: "sub_current",
            plan: "pro",
            status: "active",
          },
        ],
      ],
      [{ eventId: "evt_stale_invoice_success_previous_subscription" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({
          id: "evt_stale_invoice_success_previous_subscription",
        }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it("ignores invoice failure events for a previous Stripe subscription", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_stale_invoice_failure_previous_subscription",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_123",
          subscription: "sub_previous",
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: "sub_current",
            plan: "pro",
            status: "active",
          },
        ],
      ],
      [{ eventId: "evt_stale_invoice_failure_previous_subscription" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({
          id: "evt_stale_invoice_failure_previous_subscription",
        }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it("ignores invoice success events for a canceled Stripe subscription", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_invoice_success_canceled_subscription",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_123",
          subscription: { id: "sub_old" },
          lines: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: "sub_old",
            pendingCheckoutSessionId: null,
            plan: "free",
            status: "canceled",
          },
        ],
      ],
      [{ eventId: "evt_invoice_success_canceled_subscription" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({
          id: "evt_invoice_success_canceled_subscription",
        }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it("records the current Stripe subscription id from active lifecycle events when untracked", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_subscription_replaced",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_new",
          customer: "cus_123",
          status: "active",
          current_period_end: 1750000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: null,
            plan: "starter",
            status: "active",
          },
        ],
      ],
      [{ eventId: "evt_subscription_replaced" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_subscription_replaced" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    const setArg = setCall.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toMatchObject({
      stripeSubscriptionId: "sub_new",
      status: "active",
      plan: "pro",
    });
  });

  it("accepts a replacement subscription after the previous subscription was canceled", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_replacement_after_cancel",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_new",
          customer: "cus_123",
          status: "active",
          current_period_end: 1750000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: "sub_old",
            pendingCheckoutSessionId: "cs_new",
            plan: "free",
            status: "canceled",
          },
        ],
      ],
      [{ eventId: "evt_replacement_after_cancel" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_replacement_after_cancel" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
      .update;
    const setCall = updateMock.mock.results[0]?.value as {
      set: ReturnType<typeof vi.fn>;
    };
    const setArg = setCall.set.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg).toMatchObject({
      stripeSubscriptionId: "sub_new",
      status: "active",
      plan: "pro",
      pendingCheckoutSessionId: null,
    });
  });

  it("ignores stale active lifecycle events for a canceled Stripe subscription", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_stale_active_after_cancel",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_old",
          customer: "cus_123",
          status: "active",
          current_period_end: 1750000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb(
      [
        [
          {
            userId: TEST_USER.id,
            stripeCustomerId: "cus_123",
            stripeSubscriptionId: "sub_old",
            pendingCheckoutSessionId: null,
            plan: "free",
            status: "canceled",
          },
        ],
      ],
      [{ eventId: "evt_stale_active_after_cancel" }],
    );
    const { app } = makeApp(db, makeAuth(), stripe);

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_stale_active_after_cancel" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
    expect(stripe.customers.retrieve).not.toHaveBeenCalled();
  });

  it("calls waitUntil with the cleanupOldProcessedEvents promise after webhook processing", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_cleanup_waituntil",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "active",
          current_period_end: 1710000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb([], [{ eventId: "evt_cleanup_waituntil" }]);

    const capturedPromises: Promise<unknown>[] = [];
    const waitUntil = vi.fn((p: Promise<unknown>) => capturedPromises.push(p));

    const app = new Hono<{ Bindings: typeof BASE_ENV }>();
    app.route("/billing", billingRoutes(db, makeAuth(), stripe, waitUntil));

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_cleanup_waituntil" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(capturedPromises[0]).toBeInstanceOf(Promise);
  });

  it("swallows webhook cleanup failures after processing succeeds", async () => {
    const stripe = makeStripe();
    vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
      id: "evt_cleanup_failure",
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "active",
          current_period_end: 1710000000,
          items: {
            data: [{ price: { id: "price_pro" } }],
          },
        },
      },
    });
    const db = makeDb(
      [[{ eventId: "evt_old" }]],
      [{ eventId: "evt_cleanup_failure" }],
    );
    const deleteBuilder = {
      where: vi.fn().mockRejectedValue(new Error("cleanup failed")),
    };
    vi.mocked(db.delete).mockReturnValue(deleteBuilder as never);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const capturedPromises: Promise<unknown>[] = [];
    const waitUntil = vi.fn((p: Promise<unknown>) => capturedPromises.push(p));

    const app = new Hono<{ Bindings: typeof BASE_ENV }>();
    app.route("/billing", billingRoutes(db, makeAuth(), stripe, waitUntil));

    const res = await app.request(
      "/billing/webhook",
      {
        method: "POST",
        headers: { "stripe-signature": "sig" },
        body: JSON.stringify({ id: "evt_cleanup_failure" }),
      },
      BASE_ENV,
    );

    expect(res.status).toBe(200);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(capturedPromises[0]).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "Failed to clean up old Stripe webhook events:",
      { error: "Error: cleanup failed" },
    );
    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // H4 — charge.refunded / charge.dispute.created: use subscription lookup
  //       instead of charge metadata to identify lifetime purchases
  // -------------------------------------------------------------------------
  describe("charge.refunded — H4: subscription-based lifetime detection", () => {
    it("downgrades to free on charge.refunded when subscription record shows lifetime plan (no charge metadata)", async () => {
      // This test verifies that the fix looks up the subscription by customerId
      // rather than relying on charge object metadata (which Stripe doesn't
      // automatically populate from checkout session metadata).
      const stripe = makeStripe();
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
        id: "evt_charge_refunded_no_meta",
        type: "charge.refunded",
        data: {
          object: {
            customer: "cus_123",
            // NOTE: metadata is empty — Stripe charge objects don't inherit
            // checkout session metadata automatically.
            metadata: {},
          },
        },
      });

      // DB returns the idempotency insert, then the subscription row for customerId lookup
      const subRow = {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_lifetime",
        plan: "lifetime",
        status: "active",
        currentPeriodEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = makeDb(
        [[subRow]], // select responses: first select returns the sub row (for loadSubscriptionByCustomerId)
        [{ eventId: "evt_charge_refunded_no_meta" }], // write result (idempotency insert)
      );
      db.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                ...subRow,
                plan: "free",
                status: "canceled",
              },
            ]),
          }),
        }),
      });
      const { app } = makeApp(db, makeAuth(), stripe);

      const res = await app.request(
        "/billing/webhook",
        {
          method: "POST",
          headers: { "stripe-signature": "sig" },
          body: JSON.stringify({ id: "evt_charge_refunded_no_meta" }),
        },
        BASE_ENV,
      );

      expect(res.status).toBe(200);
      const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
        .update;
      expect(updateMock).toHaveBeenCalled();
      const setCall = updateMock.mock.results[0]?.value as {
        set: ReturnType<typeof vi.fn>;
      };
      expect(setCall.set.mock.calls[0]?.[0]).toMatchObject({
        plan: "free",
        status: "canceled",
      });
      const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
        .insert;
      const insertBuilder = insertMock.mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(insertBuilder.values.mock.calls[1]?.[0]).toMatchObject({
        actorUserId: null,
        eventType: "billing.plan.changed",
        targetType: "subscription",
        targetId: TEST_USER.id,
        metadata: expect.objectContaining({
          plan: "free",
          status: "canceled",
          sourceEventType: "charge.refunded",
        }),
      });
    });

    it("does NOT downgrade on charge.refunded when subscription record is not lifetime (no charge metadata)", async () => {
      const stripe = makeStripe();
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
        id: "evt_charge_refunded_starter_no_meta",
        type: "charge.refunded",
        data: {
          object: {
            customer: "cus_123",
            metadata: {},
          },
        },
      });

      // Subscription shows starter plan, not lifetime
      const subRow = {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_starter",
        plan: "starter",
        status: "active",
        currentPeriodEnd: new Date("2026-05-01"),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = makeDb(
        [[subRow]],
        [{ eventId: "evt_charge_refunded_starter_no_meta" }],
      );
      const { app } = makeApp(db, makeAuth(), stripe);

      const res = await app.request(
        "/billing/webhook",
        {
          method: "POST",
          headers: { "stripe-signature": "sig" },
          body: JSON.stringify({ id: "evt_charge_refunded_starter_no_meta" }),
        },
        BASE_ENV,
      );

      expect(res.status).toBe(200);
      const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
        .update;
      // The idempotency insert goes through db.insert, not db.update.
      // db.update should NOT have been called because the subscription is starter.
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("downgrades to free on charge.dispute.created when subscription record shows lifetime (no charge metadata)", async () => {
      const stripe = makeStripe();
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
        id: "evt_dispute_lifetime_no_meta",
        type: "charge.dispute.created",
        data: {
          object: {
            customer: "cus_123",
            metadata: {},
          },
        },
      });

      const subRow = {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_lifetime",
        plan: "lifetime",
        status: "active",
        currentPeriodEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = makeDb(
        [[subRow]],
        [{ eventId: "evt_dispute_lifetime_no_meta" }],
      );
      const { app } = makeApp(db, makeAuth(), stripe);

      const res = await app.request(
        "/billing/webhook",
        {
          method: "POST",
          headers: { "stripe-signature": "sig" },
          body: JSON.stringify({ id: "evt_dispute_lifetime_no_meta" }),
        },
        BASE_ENV,
      );

      expect(res.status).toBe(200);
      const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
        .update;
      expect(updateMock).toHaveBeenCalled();
      const setCall = updateMock.mock.results[0]?.value as {
        set: ReturnType<typeof vi.fn>;
      };
      expect(setCall.set.mock.calls[0]?.[0]).toMatchObject({
        plan: "free",
        status: "canceled",
      });
    });

    it("does not downgrade lifetime access for partial charge.refunded events", async () => {
      const stripe = makeStripe();
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
        id: "evt_charge_refunded_partial_lifetime",
        type: "charge.refunded",
        data: {
          object: {
            customer: "cus_123",
            refunded: false,
            amount: 50_000,
            amount_refunded: 10_000,
          },
        },
      });

      const subRow = {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: "price_lifetime",
        plan: "lifetime",
        status: "active",
        currentPeriodEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = makeDb(
        [[subRow]],
        [{ eventId: "evt_charge_refunded_partial_lifetime" }],
      );
      const { app } = makeApp(db, makeAuth(), stripe);

      const res = await app.request(
        "/billing/webhook",
        {
          method: "POST",
          headers: { "stripe-signature": "sig" },
          body: JSON.stringify({ id: "evt_charge_refunded_partial_lifetime" }),
        },
        BASE_ENV,
      );

      expect(res.status).toBe(200);
      const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
        .update;
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("cancels a pending lifetime checkout when charge.refunded arrives before checkout.session.completed", async () => {
      const stripe = makeStripe();
      vi.mocked(stripe.webhooks.constructEventAsync).mockImplementation(
        async (payload) => {
          const parsed = JSON.parse(String(payload)) as { id: string };
          if (parsed.id === "evt_refund_before_checkout") {
            return {
              id: "evt_refund_before_checkout",
              type: "charge.refunded",
              data: {
                object: {
                  customer: "cus_123",
                  refunded: true,
                  amount: 50_000,
                  amount_refunded: 50_000,
                },
              },
            };
          }

          return {
            id: "evt_checkout_after_refund",
            type: "checkout.session.completed",
            data: {
              object: {
                id: "cs_lifetime_refunded",
                customer: "cus_123",
                mode: "payment",
                payment_status: "paid",
                status: "complete",
                metadata: {
                  userId: TEST_USER.id,
                  plan: "lifetime",
                  interval: "month",
                },
              },
            },
          };
        },
      );

      const subscriptionState = {
        userId: TEST_USER.id,
        stripeCustomerId: "cus_123",
        stripePriceId: null,
        plan: "free",
        status: "inactive",
        pendingCheckoutSessionId: "cs_lifetime_refunded",
        pendingCheckoutPlan: "lifetime",
        pendingCheckoutInterval: "month",
        pendingCheckoutCreatedAt: new Date(),
        currentPeriodEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const db = makeDb(
        [[subscriptionState], [subscriptionState], [subscriptionState]],
        [{ eventId: "evt_refund_before_checkout" }],
      );
      const updateSet = vi.fn().mockImplementation((values: object) => {
        Object.assign(subscriptionState, values);
        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([subscriptionState]),
          }),
        };
      });
      db.update = vi.fn().mockReturnValue({
        set: updateSet,
      });
      const { app } = makeApp(db, makeAuth(), stripe);

      const refundRes = await app.request(
        "/billing/webhook",
        {
          method: "POST",
          headers: { "stripe-signature": "sig" },
          body: JSON.stringify({ id: "evt_refund_before_checkout" }),
        },
        BASE_ENV,
      );
      const checkoutRes = await app.request(
        "/billing/webhook",
        {
          method: "POST",
          headers: { "stripe-signature": "sig" },
          body: JSON.stringify({ id: "evt_checkout_after_refund" }),
        },
        BASE_ENV,
      );

      expect(refundRes.status).toBe(200);
      expect(checkoutRes.status).toBe(200);
      const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
        .update;
      expect(updateMock).toHaveBeenCalledTimes(1);
      const setCall = updateMock.mock.results[0]?.value as {
        set: ReturnType<typeof vi.fn>;
      };
      expect(setCall.set.mock.calls[0]?.[0]).toMatchObject({
        plan: "free",
        status: "canceled",
        pendingCheckoutSessionId: null,
        pendingCheckoutPlan: null,
      });
      const insertMock = (db as unknown as { insert: ReturnType<typeof vi.fn> })
        .insert;
      const insertBuilder = insertMock.mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(
        insertBuilder.values.mock.calls.some(
          ([value]) =>
            typeof value === "object" &&
            value !== null &&
            "plan" in value &&
            value.plan === "lifetime",
        ),
      ).toBe(false);
    });

    it("does not downgrade when no subscription record exists for the customer", async () => {
      const stripe = makeStripe();
      vi.mocked(stripe.webhooks.constructEventAsync).mockResolvedValue({
        id: "evt_charge_refunded_no_sub",
        type: "charge.refunded",
        data: {
          object: {
            customer: "cus_unknown",
            metadata: {},
          },
        },
      });

      // No subscription row found for this customer
      const db = makeDb([[]], [{ eventId: "evt_charge_refunded_no_sub" }]);
      const { app } = makeApp(db, makeAuth(), stripe);

      const res = await app.request(
        "/billing/webhook",
        {
          method: "POST",
          headers: { "stripe-signature": "sig" },
          body: JSON.stringify({ id: "evt_charge_refunded_no_sub" }),
        },
        BASE_ENV,
      );

      expect(res.status).toBe(200);
      const updateMock = (db as unknown as { update: ReturnType<typeof vi.fn> })
        .update;
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
});
