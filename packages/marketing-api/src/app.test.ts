import { describe, it, expect, vi } from "vitest";
import * as emailService from "./services/email";
import * as apolloService from "./services/apollo";
import { createApi } from "./app";
import type { ApiEnv } from "./app";

type TransactionalDb = {
  transaction: <T>(cb: (tx: TransactionalDb) => Promise<T>) => Promise<T>;
};

function withTransaction<T extends Record<string, unknown>>(
  db: T,
): T & TransactionalDb {
  return {
    ...db,
    transaction: async <R>(cb: (tx: TransactionalDb & T) => Promise<R>) =>
      cb(db as TransactionalDb & T),
  };
}

function createTestEnv(overrides?: Partial<{ _db: unknown }>): ApiEnv {
  // D1-compatible default mock: insert has no .returning(); SELECT echoes back
  // the generated referralCode so isNewSignup check passes.
  let capturedReferralCode: string | null = null;
  let capturedSurveyToken: string | null = null;
  let selectCallCount = 0;
  const mockDb = {
    insert: () => ({
      values: (data: Record<string, unknown>) => {
        if ("referralCode" in data) {
          capturedReferralCode = data.referralCode as string | null;
          capturedSurveyToken = (data.surveyToken as string | null) ?? null;
        }
        return {
          onConflictDoNothing: () => ({
            returning: () => Promise.resolve([{ id: 1 }]),
          }),
          run: async () => {},
        };
      },
    }),
    select: () => ({
      from: () => {
        const node: Record<string, unknown> = {
          where: async () => {
            selectCallCount++;
            if (selectCallCount === 1) {
              return [];
            }
            if (selectCallCount === 2) {
              // Post-insert SELECT: echo back generated referralCode
              return [
                {
                  id: 1,
                  email: "test@example.com",
                  sourcePage: "/",
                  createdAt: "2026-01-01T00:00:00.000Z",
                  referralCode: capturedReferralCode,
                  surveyToken: capturedSurveyToken,
                  emailSentAt: null,
                  queuePosition: null,
                  leadMagnetTitle: null,
                  leadMagnetUrl: null,
                  unsubscribedAt: null,
                },
              ];
            }
            // Subsequent calls: position count
            return [{ maxQueuePosition: 0 }];
          },
        };
        node.then = (resolve: (v: unknown) => void) => resolve([{ count: 0 }]);
        return node;
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({ run: async () => {} }),
      }),
    }),
  };
  return {
    DB: {} as D1Database,
    RESEND_API_KEY: "re_test",
    APOLLO_API_KEY: "apollo_test",
    PRODUCT_NAME: "TestProduct",
    PRODUCT_DOMAIN: "test.app",
    PRODUCT_LOGO_URL: "https://test.app/logo.png",
    PRODUCT_BRAND_COLOR: "#0066FF",
    PRODUCT_ACCENT_COLOR: "#f59e0b",
    CALENDAR_URL: "https://cal.com/test",
    EMAIL_FROM: "hello@test.app",
    STATS_SECRET: "test-secret",
    ALLOWED_ORIGIN: "https://test.app",
    ENVIRONMENT: "test",
    _db: (overrides?._db &&
    typeof (overrides._db as { transaction?: unknown }).transaction ===
      "function"
      ? overrides._db
      : withTransaction(
          (overrides?._db ?? mockDb) as Record<string, unknown>,
        )) as ApiEnv["_db"],
  };
}

function createTestClient() {
  const env = createTestEnv();
  return createApi(env);
}

function createStatsTestClient() {
  const countRows = [{ count: 0 }];
  const env = createTestEnv({
    _db: {
      select: () => ({
        from: () => {
          const node: Record<string, unknown> = {
            where: async () => countRows,
          };
          node.then = (resolve: (v: unknown) => void) => resolve(countRows);
          return node;
        },
      }),
    },
  });
  return createApi(env);
}

describe("GET /api/health", () => {
  it("returns ok for embedded marketing API health checks", async () => {
    const app = createTestClient();

    const res = await app.request("/api/health");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("returns ok with a trailing slash", async () => {
    const app = createTestClient();

    const res = await app.request("/api/health/");

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe("POST /api/signup", () => {
  it("returns 200 with valid email and includes referralCode, position, and surveyToken", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();
    const app = createTestClient();
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", sourcePage: "/" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      referralCode: string;
      position: number;
      surveyToken: string;
    };
    expect(data.success).toBe(true);
    expect(data.referralCode).toBeDefined();
    expect(typeof data.referralCode).toBe("string");
    expect(data.referralCode.length).toBe(8);
    expect(data.position).toBeDefined();
    expect(typeof data.position).toBe("number");
    expect(data.surveyToken).toBeDefined();
    expect(typeof data.surveyToken).toBe("string");
  });

  it("returns 400 with missing email", async () => {
    const app = createTestClient();
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 with invalid email", async () => {
    const app = createTestClient();
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "notanemail", sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });

  it("calls email and apollo services for new signups", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const addToProductListSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();

    // D1-compatible: insert without .returning(); SELECT echoes back the
    // generated referralCode so isNewSignup check passes.
    let capturedCode5: string | null = null;
    let selectCount5 = 0;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: (data: Record<string, unknown>) => {
            if ("referralCode" in data)
              capturedCode5 = data.referralCode as string | null;
            return {
              onConflictDoNothing: () => ({
                returning: () => Promise.resolve([{ id: 5 }]),
              }),
              run: async () => {},
            };
          },
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCount5++;
                if (selectCount5 === 1) return [];
                if (selectCount5 === 2)
                  return [
                    {
                      id: 5,
                      email: "new@example.com",
                      sourcePage: "/",
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: capturedCode5,
                      surveyToken: null,
                      emailSentAt: null,
                      queuePosition: null,
                      leadMagnetTitle: null,
                      leadMagnetUrl: null,
                      unsubscribedAt: null,
                    },
                  ];
                return [{ maxQueuePosition: 4 }];
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ maxQueuePosition: 4 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    expect(sendConfirmationSpy).toHaveBeenCalled();
    expect(addToProductListSpy).toHaveBeenCalled();

    sendConfirmationSpy.mockRestore();
    addToProductListSpy.mockRestore();
  });

  it("includes referralCode and referralUrl in confirmation email", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    // D1-compatible: insert without .returning(); SELECT echoes back generated referralCode.
    let capturedRefUrl: string | null = null;
    let selectCountRefUrl = 0;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: (data: Record<string, unknown>) => {
            if ("referralCode" in data)
              capturedRefUrl = data.referralCode as string | null;
            return {
              onConflictDoNothing: () => ({
                returning: () => Promise.resolve([{ id: 6 }]),
              }),
              run: async () => {},
            };
          },
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCountRefUrl++;
                if (selectCountRefUrl === 1) return [];
                if (selectCountRefUrl === 2)
                  return [
                    {
                      id: 1,
                      email: "ref-test@example.com",
                      sourcePage: "/",
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: capturedRefUrl,
                      surveyToken: null,
                      emailSentAt: null,
                      queuePosition: null,
                      leadMagnetTitle: null,
                      leadMagnetUrl: null,
                      unsubscribedAt: null,
                    },
                  ];
                return [{ maxQueuePosition: 0 }];
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ maxQueuePosition: 0 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    await app.request("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ref-test@example.com", sourcePage: "/" }),
    });

    expect(sendConfirmationSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        referralCode: expect.any(String),
        referralUrl: expect.stringContaining("?ref="),
      }),
    );

    vi.restoreAllMocks();
  });
});

describe("POST /api/signup duplicate handling", () => {
  it("returns 200 for duplicate email with existing referralCode", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const addToProductListSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();

    let selectCallCount = 0;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([]),
            }),
            run: async () => {},
          }),
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                if (selectCallCount === 1)
                  return [
                    {
                      id: 1,
                    },
                  ];
                if (selectCallCount === 2)
                  return [
                    {
                      id: 1,
                      email: "dup@example.com",
                      sourcePage: "/",
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: "abc12345",
                      surveyToken: "mock-survey-token-409",
                      emailSentAt: "2025-01-01T00:00:00.000Z",
                      queuePosition: 1,
                      leadMagnetTitle: null,
                      leadMagnetUrl: null,
                      unsubscribedAt: null,
                    },
                  ];
                return [{ maxQueuePosition: 0 }];
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ maxQueuePosition: 0 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "100.0.0.5",
      },
      body: JSON.stringify({ email: "dup@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      position: number;
    };
    expect(data.success).toBe(true);
    // position must be the lte-based rank (1), not total count
    expect(data.position).toBe(1);
    expect((data as Record<string, unknown>).referralCode).toBeUndefined();
    expect((data as Record<string, unknown>).surveyToken).toBeUndefined();
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
    expect(addToProductListSpy).not.toHaveBeenCalled();

    sendConfirmationSpy.mockRestore();
    addToProductListSpy.mockRestore();
  });
});

describe("POST /api/signup referral tracking", () => {
  it("tracks referral when referredBy is provided", async () => {
    vi.spyOn(emailService, "sendConfirmation").mockResolvedValue();
    vi.spyOn(apolloService, "addToProductList").mockResolvedValue();

    let insertedReferral = false;
    let capturedReferralCode3: string | null = null;
    let selectCallCount = 0;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: (data: Record<string, unknown>) => {
            if (data.referrerEmail) {
              insertedReferral = true;
            }
            if ("referralCode" in data) {
              capturedReferralCode3 = data.referralCode as string | null;
            }
            return {
              onConflictDoNothing: () => ({
                returning: () => Promise.resolve([{ id: 3 }]),
              }),
              run: async () => {},
            };
          },
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                // First call is the duplicate preselect; second loads the row.
                if (selectCallCount === 1) return [];
                if (selectCallCount === 2)
                  return [
                    {
                      id: 3,
                      email: "referred@example.com",
                      sourcePage: "/",
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: capturedReferralCode3,
                      surveyToken: null,
                      emailSentAt: null,
                      queuePosition: null,
                      leadMagnetTitle: null,
                      leadMagnetUrl: null,
                      unsubscribedAt: null,
                    },
                  ];
                // Second call: next immutable queue position
                if (selectCallCount === 3) return [{ maxQueuePosition: 2 }];
                // Third call: referrer lookup by referralCode
                if (selectCallCount === 4)
                  return [{ email: "referrer@example.com" }];
                return [];
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ maxQueuePosition: 2 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "100.0.0.99",
      },
      body: JSON.stringify({
        email: "referred@example.com",
        sourcePage: "/",
        referredBy: "REF12345",
      }),
    });

    expect(res.status).toBe(200);
    expect(insertedReferral).toBe(true);

    vi.restoreAllMocks();
  });
});

describe("GET /api/referral/:code", () => {
  it("returns referral count and position for valid code", async () => {
    let selectCallCount = 0;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ run: async () => {} }),
            run: async () => {},
          }),
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                if (selectCallCount === 1)
                  return [{ id: 42, queuePosition: 15 }]; // referrer found by code
                return [{ count: 3 }]; // referral count
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ count: 3 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/referral/abc12345", {
      headers: { "CF-Connecting-IP": "10.50.1.1" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    expect(data).toHaveProperty("referralCount");
    expect(data).toHaveProperty("position");
    // position must be the stored durable queue rank, not raw DB id
    expect(data.position).toBe(15);
    expect(data.referralCount).toBe(3);
  });

  it("returns 404 for invalid referral code", async () => {
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ run: async () => {} }),
            run: async () => {},
          }),
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => [],
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ count: 0 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/referral/nonexistent", {
      headers: { "CF-Connecting-IP": "10.50.1.2" },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/pricing-click", () => {
  it("returns 200 with valid click data", async () => {
    const app = createTestClient();
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: "pro",
        sourcePage: "/",
        sessionId: "abc123",
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 with missing tier", async () => {
    const app = createTestClient();
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourcePage: "/", sessionId: "abc123" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 with missing sourcePage", async () => {
    const app = createTestClient();
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "100.0.0.1",
      },
      body: JSON.stringify({ tier: "pro", sessionId: "abc123" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 with missing sessionId", async () => {
    const app = createTestClient();
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "100.0.0.2",
      },
      body: JSON.stringify({ tier: "pro", sourcePage: "/" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/survey", () => {
  it("returns 200 with valid batch survey data", async () => {
    // Provide a db mock that returns a found signup so the token-lookup check passes
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({ run: async () => {} }),
        }),
        select: () => ({
          from: () => ({
            where: async () => [
              { id: 1, email: "test@example.com", surveyCompleted: 0 },
            ],
          }),
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.8.1",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [
          { questionId: "role", answer: "1-2" },
          { questionId: "current_tool", answer: "Spreadsheets" },
          { questionId: "pain", answer: "Scheduling" },
        ],
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 with missing answers", async () => {
    const app = createTestClient();
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surveyToken: "valid-token" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 with empty answers array", async () => {
    const app = createTestClient();
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "100.0.0.3",
      },
      body: JSON.stringify({ surveyToken: "valid-token", answers: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 with missing surveyToken", async () => {
    const app = createTestClient();
    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "100.0.0.4",
      },
      body: JSON.stringify({ answers: [{ questionId: "role", answer: "PM" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("sets surveyCompleted flag on signups table", async () => {
    const updateCalled = { value: false };
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({ run: async () => {} }),
        }),
        update: () => ({
          set: () => ({
            where: () => {
              updateCalled.value = true;
              return { run: async () => {} };
            },
          }),
        }),
        // Token-lookup must find the signup
        select: () => ({
          from: () => ({
            where: async () => [
              { id: 1, email: "test@example.com", surveyCompleted: 0 },
            ],
          }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.8.2",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "role", answer: "PM" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(updateCalled.value).toBe(true);
  });
});

describe("GET /api/stats", () => {
  it("returns 401 without authorization header", async () => {
    const app = createTestClient();
    const res = await app.request("/api/stats");
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong Bearer token", async () => {
    const app = createTestClient();
    const res = await app.request("/api/stats", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with valid Bearer token", async () => {
    const app = createStatsTestClient();
    const res = await app.request("/api/stats", {
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      signups: number;
      pricingClicks: number;
      surveyResponses: number;
    };
    expect(data).toHaveProperty("signups");
    expect(data).toHaveProperty("pricingClicks");
    expect(data).toHaveProperty("surveyResponses");
  });
});

describe("CORS behavior", () => {
  it("M2 — CORS middleware is always applied; a mismatched Origin is rejected with 403", async () => {
    // ALLOWED_ORIGIN is now required and cors() is always applied.
    // A request with a mismatched Origin must be rejected even on the stats endpoint.
    const app = createTestClient();
    const res = await app.request("/api/stats", {
      headers: {
        Origin: "https://evil.com",
        Authorization: "Bearer test-secret",
      },
    });
    expect(res.status).toBe(403);
  });

  it("M2 — request with matching Origin passes through CORS", async () => {
    const app = createStatsTestClient();
    const res = await app.request("/api/stats", {
      headers: {
        Origin: "https://test.app",
        Authorization: "Bearer test-secret",
      },
    });
    expect(res.status).toBe(200);
  });
});

describe("app.ts — drizzle(env.DB) fallback branch", () => {
  it("uses drizzle(env.DB) when _db is not provided", async () => {
    // Create env without _db so the drizzle(env.DB) branch executes.
    // DB is a minimal stub — drizzle wraps it without calling methods at construction time.
    const env = createTestEnv();
    delete (env as unknown as Record<string, unknown>)._db;
    // The 400 response from a bad request body exercises the middleware path without DB calls
    const app = createApi(env);
    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.20.1",
      },
      body: JSON.stringify({ sourcePage: "/" }), // missing email — returns 400 before DB hit
    });
    expect(res.status).toBe(400);
  });
});

// Bug #2 — stats.ts + app.ts: Auth disabled when STATS_SECRET not set
describe("GET /api/stats — STATS_SECRET not configured", () => {
  it("returns 401 for all requests when STATS_SECRET is absent", async () => {
    const env = createTestEnv();
    delete (env as unknown as Record<string, unknown>).STATS_SECRET;
    const app = createApi(env);
    const res = await app.request("/api/stats", {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 even with no Authorization header when STATS_SECRET is absent", async () => {
    const env = createTestEnv();
    delete (env as unknown as Record<string, unknown>).STATS_SECRET;
    const app = createApi(env);
    const res = await app.request("/api/stats");
    expect(res.status).toBe(401);
  });

  it("returns 401 when STATS_SECRET is empty string", async () => {
    const env = createTestEnv();
    (env as unknown as Record<string, unknown>).STATS_SECRET = "";
    const app = createApi(env);
    const res = await app.request("/api/stats", {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status).toBe(401);
  });
});

// Bug #4 — referral.ts: Returns durable queue position instead of DB row ID
describe("GET /api/referral/:code — signup position", () => {
  it("returns stored queuePosition, not raw DB id", async () => {
    let selectCallCount = 0;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ run: async () => {} }),
            run: async () => {},
          }),
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                if (selectCallCount === 1)
                  return [{ id: 99, queuePosition: 7 }]; // referrer found, DB id is 99
                return [{ count: 2 }]; // referral count
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ count: 7 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/referral/mycode", {
      headers: { "CF-Connecting-IP": "10.50.1.3" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      referralCount: number;
      position: number;
    };
    // position must be the durable queue rank (7), NOT the raw DB id (99)
    expect(data.position).toBe(7);
    expect(data.position).not.toBe(99);
  });
});

// Bug #5 — signup.ts: Returns 200 for duplicate emails instead of 409
describe("POST /api/signup — duplicate email returns 200", () => {
  it("returns referralCode as null in 200 response when existing signup has null referralCode", async () => {
    // D1-compatible duplicate path:
    //   insert resolves (conflict fires silently)
    //   1st SELECT → existing row with null referralCode (differs from generated) → conflict
    //   2nd SELECT → lte position query → rank
    let selectCallCount = 0;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([]),
            }),
            run: async () => {},
          }),
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                if (selectCallCount === 1)
                  return [
                    {
                      id: 2,
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: null,
                      surveyToken: null,
                      emailSentAt: "2025-01-01T00:00:00.000Z",
                    },
                  ]; // null referralCode → conflict
                return [{ count: 2 }]; // lte position query
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ count: 2 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.7.2",
      },
      body: JSON.stringify({ email: "nullref@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.referralCode).toBeUndefined();
    expect(data.surveyToken).toBeUndefined();
  });

  it("returns 200 (not 409) when email already exists", async () => {
    const sendConfirmationSpy = vi
      .spyOn(emailService, "sendConfirmation")
      .mockResolvedValue();
    const addToProductListSpy = vi
      .spyOn(apolloService, "addToProductList")
      .mockResolvedValue();

    // D1-compatible duplicate path:
    //   insert resolves (conflict fires silently)
    //   1st SELECT → existing row with pre-existing referralCode → conflict
    //   2nd SELECT → lte position query → actual rank
    let selectCallCount = 0;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: () => Promise.resolve([]),
            }),
            run: async () => {},
          }),
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => {
                selectCallCount++;
                if (selectCallCount === 1)
                  return [
                    {
                      id: 3,
                      createdAt: "2026-01-01T00:00:00.000Z",
                      referralCode: "existing1", // differs from generated → conflict
                      surveyToken: "tok-existing1",
                      emailSentAt: "2025-01-01T00:00:00.000Z",
                      queuePosition: 3,
                    },
                  ];
                return [{ maxQueuePosition: 2 }];
              },
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ count: 3 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.7.1",
      },
      body: JSON.stringify({ email: "already@example.com", sourcePage: "/" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      position: number;
    };
    expect(data.success).toBe(true);
    expect(data.position).toBe(3);
    expect((data as Record<string, unknown>).referralCode).toBeUndefined();
    expect((data as Record<string, unknown>).surveyToken).toBeUndefined();
    // No emails or Apollo calls for duplicates
    expect(sendConfirmationSpy).not.toHaveBeenCalled();
    expect(addToProductListSpy).not.toHaveBeenCalled();

    sendConfirmationSpy.mockRestore();
    addToProductListSpy.mockRestore();
  });
});

// Bug #9 — survey.ts: No token existence check before inserting responses
describe("POST /api/survey — token existence check", () => {
  it("returns 404 when surveyToken does not match any signup", async () => {
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({ run: async () => {} }),
        }),
        select: () => ({
          from: () => ({
            where: async () => [], // token not found
          }),
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.9.1",
      },
      body: JSON.stringify({
        surveyToken: "invalid-or-expired-token",
        answers: [{ questionId: "role", answer: "Dev" }],
      }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 and inserts responses when surveyToken exists", async () => {
    let insertCalled = false;
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => {
            insertCalled = true;
            return { run: async () => {} };
          },
        }),
        select: () => ({
          from: () => ({
            where: async () => [
              { id: 1, email: "real@example.com", surveyCompleted: 0 },
            ], // found
          }),
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/survey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.9.2",
      },
      body: JSON.stringify({
        surveyToken: "valid-token",
        answers: [{ questionId: "role", answer: "Dev" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(insertCalled).toBe(true);
  });
});

// Bug #10 — pricing-click.ts: Tier field accepts arbitrary strings
describe("POST /api/pricing-click — tier sanitization", () => {
  it("returns 400 when tier becomes empty after sanitization", async () => {
    const app = createTestClient();
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.10.1",
      },
      body: JSON.stringify({
        tier: "!@#$%^&*()",
        sourcePage: "/",
        sessionId: "abc123",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 with descriptive error when tier contains special characters like angle brackets", async () => {
    const app = createTestClient();

    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.10.2",
      },
      body: JSON.stringify({
        tier: "pro<script>alert(1)</script>",
        sourcePage: "/",
        sessionId: "abc123",
      }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("tier contains invalid characters");
  });

  it("returns 400 when tier is not a string (e.g. a number)", async () => {
    const app = createTestClient();
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.10.4",
      },
      body: JSON.stringify({
        tier: 42,
        sourcePage: "/",
        sessionId: "abc123",
      }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("tier must be a string");
  });

  it("returns 400 when tier is an object", async () => {
    const app = createTestClient();
    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.10.5",
      },
      body: JSON.stringify({
        tier: { name: "pro" },
        sourcePage: "/",
        sessionId: "abc123",
      }),
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("tier must be a string");
  });

  it("accepts valid alphanumeric-and-hyphen tier unchanged", async () => {
    let storedTier = "";
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: (data: Record<string, unknown>) => {
            storedTier = data.tier as string;
            return { run: async () => {} };
          },
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => [],
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ count: 0 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    const res = await app.request("/api/pricing-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "10.0.10.3",
      },
      body: JSON.stringify({
        tier: "pro-annual",
        sourcePage: "/",
        sessionId: "abc123",
      }),
    });

    expect(res.status).toBe(200);
    expect(storedTier).toBe("pro-annual");
  });
});

// 2c — Rate limit on /api/stats
describe("GET /api/stats — rate limiting", () => {
  it("2c — returns 429 after 10 requests from the same IP within the window", async () => {
    // Bug: /api/stats had no rate limiting, allowing brute-force on STATS_SECRET.
    // Fix: app.use("/api/stats", rateLimit(10)) before app.route("/api/stats", ...)
    const ip = "10.77.66.55";
    const app = createTestClient();

    // First 10 requests should succeed (stats is protected by auth — wrong token
    // returns 401, but the rate limiter must still count them)
    for (let i = 0; i < 10; i++) {
      await app.request("/api/stats", {
        headers: { "CF-Connecting-IP": ip },
      });
    }

    // 11th request must be rate-limited (429) regardless of auth header
    const res = await app.request("/api/stats", {
      headers: { "CF-Connecting-IP": ip },
    });
    expect(res.status).toBe(429);
  });
});

// H1 — Rate limit on /api/referral
describe("GET /api/referral/:code — rate limiting", () => {
  it("returns 429 on the 6th request from the same IP within the window", async () => {
    // Use a unique IP so this test does not collide with other test counters
    const ip = "10.99.88.77";
    const env = createTestEnv({
      _db: {
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ run: async () => {} }),
            run: async () => {},
          }),
        }),
        select: () => ({
          from: () => {
            const node: Record<string, unknown> = {
              where: async () => [{ id: 1 }],
            };
            node.then = (resolve: (v: unknown) => void) =>
              resolve([{ count: 1 }]);
            return node;
          },
        }),
        update: () => ({
          set: () => ({ where: () => ({ run: async () => {} }) }),
        }),
      },
    });
    const app = createApi(env);

    // First 5 requests should succeed (rate limit is 5)
    for (let i = 0; i < 5; i++) {
      const r = await app.request("/api/referral/testcode", {
        headers: { "CF-Connecting-IP": ip },
      });
      expect(r.status).not.toBe(429);
    }

    // 6th request in the same window must be rejected
    const res = await app.request("/api/referral/testcode", {
      headers: { "CF-Connecting-IP": ip },
    });
    expect(res.status).toBe(429);
  });
});
