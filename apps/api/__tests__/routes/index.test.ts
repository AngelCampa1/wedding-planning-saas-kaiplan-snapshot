import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { isE2eAllowed } from "../../src/lib/e2e-gate";
import { isMalformedJsonBodyError } from "../../src/lib/json-body";
import type { Database } from "../../src/db/client";
import type { Auth } from "../../src/auth";
import { withDbRetry } from "../../src/index";
import { TEST_STRIPE_PRICE_ENV } from "../helpers/stripe-env";

const TEST_USER = {
  id: "user-1",
  email: "user@example.com",
  name: "Test User",
  emailVerified: true,
};

const WEDDING_ROW = {
  id: "00000000-0000-4000-8000-000000000101",
  name: "My Wedding",
  date: "2025-06-15",
  budgetCents: 500000,
  currency: "USD",
  timezone: "America/New_York",
  createdBy: TEST_USER.id,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

const MEMBER_ROW = {
  id: "member-uuid-1",
  weddingId: WEDDING_ROW.id,
  userId: TEST_USER.id,
  role: "owner" as const,
  invitedEmail: null,
  acceptedAt: new Date("2024-01-01"),
  createdAt: new Date("2024-01-01"),
};

// Minimal env that satisfies the Zod boot validation in src/lib/env-schema.ts.
// Individual tests may spread and override specific fields.
const BASE_ENV = {
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "better-auth-secret-value",
  BETTER_AUTH_URL: "http://localhost:5030",
  EMAIL_FROM_ADDRESS: "hello@kaiplan.test",
  EMAIL_TOKEN_SECRET: "email-secret",
  FEEDBACK_RECIPIENT_EMAIL: "support@kaiplan.test",
  DATABASE_URL: "postgresql://example",
  RESEND_API_KEY: "re_test",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  ...TEST_STRIPE_PRICE_ENV,
  STRIPE_CHECKOUT_SUCCESS_URL:
    "http://localhost:3000/settings?checkout=success",
  STRIPE_CHECKOUT_CANCEL_URL: "http://localhost:3000/settings?checkout=cancel",
  STRIPE_PORTAL_RETURN_URL: "http://localhost:3000/settings",
  CLOUDFLARE_IMAGES_ACCOUNT_ID: "cf-account-123",
  CLOUDFLARE_IMAGES_API_TOKEN: "cf-token-123",
  CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
  SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
  MARKETING_DB: {},
  TURNSTILE_SECRET_KEY: "turnstile-secret",
} as const;

function makeAuth(): Auth {
  return {
    api: {
      getSession: vi.fn().mockResolvedValue({ user: TEST_USER, session: {} }),
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

function makeDb(selectResponses: unknown[][] = [[]]): Database {
  let selectIndex = 0;

  const db: Record<string, unknown> = {};
  db.select = vi.fn().mockImplementation(() => {
    const rows =
      selectIndex < selectResponses.length ? selectResponses[selectIndex] : [];
    selectIndex++;
    return makeSelectBuilder(rows);
  });
  db.insert = vi.fn();
  db.update = vi.fn().mockReturnValue({
    set: vi
      .fn()
      .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  db.delete = vi.fn();
  db.transaction = vi.fn();

  return db as unknown as Database;
}

function makeRateLimiterNamespace(): DurableObjectNamespace {
  const counters = new Map<string, number>();
  const stub = {
    fetch: async (request: Request) => {
      const body = (await request.json()) as {
        key: string;
        limit: number;
        window: number;
      };
      const count = (counters.get(body.key) ?? 0) + 1;
      counters.set(body.key, count);

      return Response.json({
        allowed: count <= body.limit,
        remaining: Math.max(0, body.limit - count),
        resetAt: Date.now() + body.window * 1000,
      });
    },
  } as unknown as DurableObjectStub;

  return {
    idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
    get: (_id: DurableObjectId) => stub,
    newUniqueId: () => ({ toString: () => "unique" }) as DurableObjectId,
    jurisdiction: () => ({}) as DurableObjectNamespace,
  } as unknown as DurableObjectNamespace;
}

describe("api index seating forwarding", () => {
  it("forwards /api/weddings through the top-level app", async () => {
    const db = makeDb([[], [{ ...WEDDING_ROW, role: "owner" }]]);

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));

    const { default: app } = await import("../../src/index");

    const request = new Request("http://localhost/api/weddings", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const res = await app.fetch(request, { ...BASE_ENV } as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([
      expect.objectContaining({
        id: WEDDING_ROW.id,
        name: WEDDING_ROW.name,
        role: "owner",
      }),
    ]);
  }, 30000);

  it("forwards /api/weddings/:weddingId/seating through the top-level app", async () => {
    const db = makeDb([[MEMBER_ROW], []]);

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));

    const { default: app } = await import("../../src/index");

    const request = new Request(
      `http://localhost/api/weddings/${WEDDING_ROW.id}/seating`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await app.fetch(request, {
      ...BASE_ENV,
      APP_URL: "http://localhost:5173",
      HYPERDRIVE: { connectionString: "postgresql://example" },
    } as never);

    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      chart: { width: number; height: number; tables: unknown[] };
      summary: {
        tableCount: number;
        seatCount: number;
        assignedSeatCount: number;
        unassignedSeatCount: number;
      };
    };

    expect(body.chart).toEqual({
      width: 1200,
      height: 800,
      tables: [],
    });
    expect(body.summary).toEqual({
      tableCount: 0,
      seatCount: 0,
      assignedSeatCount: 0,
      unassignedSeatCount: 0,
    });
  }, 30000);

  it("forwards /api/weddings/:weddingId/guests through the top-level app", async () => {
    let selectCount = 0;
    const db = makeDb() as unknown as Record<string, unknown>;

    db.select = vi.fn().mockImplementation(() => {
      selectCount++;
      if (selectCount === 1) {
        return makeSelectBuilder([MEMBER_ROW]);
      }
      return makeSelectBuilder([]);
    });

    const insertBuilder: Record<string, unknown> = {};
    insertBuilder.values = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: "guest-1",
          weddingId: WEDDING_ROW.id,
          firstName: "Ava",
          lastName: "Rivera",
          email: "ava@example.com",
          phone: null,
          side: "mutual",
          groupName: null,
          dietaryTags: [],
          dietaryNotes: null,
          rsvpStatus: "pending",
          primaryGuestId: null,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        },
      ]),
    });
    db.insert = vi.fn().mockReturnValue(insertBuilder);
    db.update = vi.fn();
    db.delete = vi.fn();
    db.transaction = vi.fn();

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));

    const { default: app } = await import("../../src/index");

    const request = new Request(
      `http://localhost/api/weddings/${WEDDING_ROW.id}/guests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          firstName: "Ava",
          lastName: "Rivera",
          email: "ava@example.com",
          phone: null,
          side: "mutual",
          groupName: null,
          dietaryTags: [],
          dietaryNotes: null,
          rsvpStatus: "pending",
          primaryGuestId: null,
        }),
      },
    );

    const res = await app.fetch(request, {
      ...BASE_ENV,
    } as never);

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      id: "guest-1",
      firstName: "Ava",
      lastName: "Rivera",
    });
  });

  it("forwards /api/billing through the top-level app", async () => {
    const db = makeDb([[]]);

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));
    vi.doMock("../../src/lib/stripe", () => ({
      createStripeClient: vi.fn(() => ({
        customers: {
          create: vi.fn(),
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
          list: vi.fn(),
        },
        paymentIntents: {
          list: vi.fn(),
        },
        webhooks: {
          constructEventAsync: vi.fn(),
        },
      })),
    }));

    const { default: app } = await import("../../src/index");

    const request = new Request("http://localhost/api/billing", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const res = await app.fetch(request, {
      ...BASE_ENV,
    } as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      plan: "free",
      status: "inactive",
    });
  });

  it("forwards /api/public/websites/:slug through the top-level app", async () => {
    const db = makeDb([
      [
        {
          id: "website-1",
          weddingId: "00000000-0000-4000-8000-000000000101",
          slug: "anna-and-lee",
          template: "classic",
          draftContent: {
            hero: { title: "Draft" },
            story: { title: "Story" },
            venue: { name: "Venue" },
            registry: { title: "Registry" },
            rsvp: { visible: true },
            heroImage: null,
          },
          publishedSlug: "anna-and-lee",
          publishedTemplate: "classic",
          publishedContent: {
            hero: { title: "Anna & Lee" },
            story: { title: "Our Story" },
            venue: { name: "The Palm House" },
            registry: { title: "Registry" },
            rsvp: { visible: true },
            heroImage: null,
          },
          publishedAt: new Date("2026-04-08T10:00:00.000Z"),
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        },
      ],
    ]);

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));

    const { default: app } = await import("../../src/index");

    const request = new Request(
      "http://localhost/api/public/websites/anna-and-lee",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await app.fetch(request, {
      ...BASE_ENV,
    } as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      slug: "anna-and-lee",
      template: "classic",
      content: expect.objectContaining({
        hero: expect.objectContaining({ title: "Anna & Lee" }),
      }),
    });
  });

  it("forwards /api/public/email/preferences/:token through the top-level app", async () => {
    vi.resetModules();
    vi.doMock("../../src/db/marketing-client", () => ({
      createMarketingDb: vi.fn(() => ({})),
    }));

    const { default: app } = await import("../../src/index");

    const request = new Request(
      "http://localhost/api/public/email/preferences/not-a-real-token",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await app.fetch(request, {
      ...BASE_ENV,
    } as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid email preferences token.",
    });
  });

  it("rate limits public email preferences through the top-level app", async () => {
    vi.resetModules();
    vi.doMock("../../src/db/marketing-client", () => ({
      createMarketingDb: vi.fn(() => ({})),
    }));

    const { default: app } = await import("../../src/index");
    const env = {
      ...BASE_ENV,
      RATE_LIMITER: makeRateLimiterNamespace(),
    } as never;

    for (let i = 0; i < 60; i++) {
      const res = await app.fetch(
        new Request(
          "http://localhost/api/public/email/preferences/not-a-real-token",
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "CF-Connecting-IP": "203.0.113.10",
            },
          },
        ),
        env,
      );
      expect(res.status).toBe(400);
    }

    const res = await app.fetch(
      new Request(
        "http://localhost/api/public/email/preferences/not-a-real-token",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": "203.0.113.10",
          },
        },
      ),
      env,
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).not.toBeNull();
    await expect(res.json()).resolves.toEqual({
      error: "Rate limit exceeded. Please try again later.",
    });
  });

  it("forwards /api/weddings/:weddingId/website through the top-level app", async () => {
    const db = makeDb([
      [MEMBER_ROW],
      [{ userId: TEST_USER.id, plan: "pro", status: "active" }],
      [],
    ]);

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));

    const { default: app } = await import("../../src/index");

    const request = new Request(
      `http://localhost/api/weddings/${WEDDING_ROW.id}/website`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await app.fetch(request, {
      ...BASE_ENV,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/kaiplan_test",
    } as never);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toBeNull();
  });

  it("boots with DATABASE_URL when Hyperdrive is unavailable", async () => {
    const db = makeDb([[]]);
    const createDb = vi.fn(() => db);

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb,
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(new Request("http://localhost/api/billing"), {
      ...BASE_ENV,
      DATABASE_URL: "postgresql://database-url",
    } as never);

    expect(res.status).toBe(200);
    expect(createDb).toHaveBeenCalledWith("postgresql://database-url");
  });

  it("allows the public web origin through CORS for public API routes", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const request = new Request("http://localhost/api/public/rsvp/token", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:4321",
        "Access-Control-Request-Method": "GET",
      },
    });

    const res = await app.fetch(request, {
      ...BASE_ENV,
      PUBLIC_WEB_URL: "http://localhost:4321",
    } as never);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:4321",
    );
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain(
      "X-Kaiplan-Error-Id",
    );
  });

  it("does not allow the public web origin through CORS for authenticated API routes", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const request = new Request("http://localhost/api/weddings", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:4321",
        "Access-Control-Request-Method": "GET",
      },
    });

    const res = await app.fetch(request, {
      ...BASE_ENV,
      PUBLIC_WEB_URL: "http://localhost:4321",
    } as never);

    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("adds defensive security headers to API responses", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(new Request("http://localhost/api/health"), {
      ...BASE_ENV,
    } as never);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(res.headers.get("Permissions-Policy")).toBe(
      "camera=(), geolocation=(), microphone=()",
    );
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("blocks e2e captured-password-resets endpoint when ENVIRONMENT is production", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request(
        "http://localhost/api/e2e/captured-password-resets?email=test@example.com",
      ),
      {
        ...BASE_ENV,
        BETTER_AUTH_URL: "https://api.kaiplan.test",
        E2E_MODE: "true",
        ENVIRONMENT: "production",
      } as never,
    );

    expect(res.status).toBe(404);
  });

  it("allows e2e captured-password-resets endpoint when not in production", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request("http://localhost/api/e2e/captured-password-resets"),
      {
        ...BASE_ENV,
        E2E_MODE: "true",
        ENVIRONMENT: "development",
      } as never,
    );

    expect(res.status).toBe(200);
  });

  it("blocks e2e captured-password-resets endpoint when ENVIRONMENT is undefined (fail-closed)", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request(
        "http://localhost/api/e2e/captured-password-resets?email=test@example.com",
      ),
      {
        ...BASE_ENV,
        E2E_MODE: "true",
        ENVIRONMENT: undefined,
      } as never,
    );

    expect(res.status).toBe(404);
  });

  it("allows e2e captured-password-resets endpoint when ENVIRONMENT is test", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request("http://localhost/api/e2e/captured-password-resets"),
      {
        ...BASE_ENV,
        E2E_MODE: "true",
        ENVIRONMENT: "test",
      } as never,
    );

    expect(res.status).toBe(200);
  });

  it("returns 500 when required env vars are missing", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request("http://localhost/api/health"),
      // Intentionally missing required fields (STRIPE_SECRET_KEY, etc.)
      {
        APP_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "secret",
        BETTER_AUTH_URL: "http://localhost:5030",
        EMAIL_FROM_ADDRESS: "hello@kaiplan.test",
        EMAIL_TOKEN_SECRET: "email-secret",
      } as never,
    );

    expect(res.status).toBe(500);
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Server misconfiguration");
  });

  it("returns a Sentry error id for captured production 5xx env failures", async () => {
    const captureApiException = vi.fn(() => "event-env-123");

    vi.resetModules();
    vi.doMock("../../src/lib/sentry", () => ({
      captureApiException,
      withSentry: <T>(handler: T) => handler,
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(new Request("http://localhost/api/health"), {
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "secret",
      BETTER_AUTH_URL: "http://localhost:5030",
      EMAIL_FROM_ADDRESS: "hello@kaiplan.test",
      EMAIL_TOKEN_SECRET: "email-secret",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    } as never);

    expect(res.status).toBe(500);
    expect(res.headers.get("X-Kaiplan-Error-Id")).toBe("event-env-123");
    await expect(res.json()).resolves.toMatchObject({
      error: "Server misconfiguration",
      errorId: "event-env-123",
    });
    expect(captureApiException).toHaveBeenCalledOnce();
  });

  it("returns 500 with a detail field when env vars are missing in development", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request("http://localhost/api/health"),
      // ENVIRONMENT=development triggers the detail branch; required fields missing
      {
        APP_URL: "http://localhost:3000",
        BETTER_AUTH_SECRET: "secret",
        BETTER_AUTH_URL: "http://localhost:5030",
        EMAIL_FROM_ADDRESS: "hello@kaiplan.test",
        EMAIL_TOKEN_SECRET: "email-secret",
        ENVIRONMENT: "development",
      } as never,
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; detail: string };
    expect(body.error).toBe("Server misconfiguration");
    expect(typeof body.detail).toBe("string");
    expect(body.detail.length).toBeGreaterThan(0);
  });

  it("routes /api/weddings/:weddingId/vendors through the consolidated router (no 404 miss)", async () => {
    // Unauthenticated — we just need to prove routing resolves to the
    // handler (which returns 401 from requireSession), not a 404 routing miss.
    const db = makeDb();

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(
        () =>
          ({
            api: {
              getSession: vi.fn().mockResolvedValue(null),
            },
          }) as never,
      ),
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request(`http://localhost/api/weddings/${WEDDING_ROW.id}/vendors`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }),
      {
        ...BASE_ENV,
      } as never,
    );

    // 401 Unauthorized from requireSession — proves routing landed on the
    // vendor handler rather than 404-ing.
    expect(res.status).toBe(401);
  });

  it("routes /api/weddings/:weddingId/checklist through the consolidated router (no 404 miss)", async () => {
    const db = makeDb();

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(
        () =>
          ({
            api: {
              getSession: vi.fn().mockResolvedValue(null),
            },
          }) as never,
      ),
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request(`http://localhost/api/weddings/${WEDDING_ROW.id}/checklist`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }),
      {
        ...BASE_ENV,
      } as never,
    );

    expect(res.status).toBe(401);
  });

  it("routes /api/weddings/:weddingId/members through the consolidated router (no 404 miss)", async () => {
    const db = makeDb();

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(
        () =>
          ({
            api: {
              getSession: vi.fn().mockResolvedValue(null),
            },
          }) as never,
      ),
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request(`http://localhost/api/weddings/${WEDDING_ROW.id}/members`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }),
      {
        ...BASE_ENV,
      } as never,
    );

    expect(res.status).toBe(401);
  });

  it("routes /api/weddings/:weddingId/budget through the consolidated router (no 404 miss)", async () => {
    const db = makeDb();

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(
        () =>
          ({
            api: {
              getSession: vi.fn().mockResolvedValue(null),
            },
          }) as never,
      ),
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request(
        `http://localhost/api/weddings/${WEDDING_ROW.id}/budget/categories`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      ),
      {
        ...BASE_ENV,
      } as never,
    );

    expect(res.status).toBe(401);
  });

  it("rejects an authenticated state-changing request with no Origin header via CSRF middleware", async () => {
    vi.resetModules();

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request("http://localhost/api/weddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // CSRF only enforces Origin when a Better Auth session cookie is
          // present — an unauthenticated request cannot forge a session.
          Cookie: "better-auth.session_token=fake-session-for-csrf-test",
        },
        body: JSON.stringify({ name: "test" }),
      }),
      {
        ...BASE_ENV,
      } as never,
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/origin/i);
  });

  it("lets public RSVP POST through CSRF even without an Origin header", async () => {
    // Use a token that will fail validation (400) — we just need to prove
    // the CSRF layer didn't short-circuit with a 403 Origin-required.
    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => makeDb()),
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request("http://localhost/api/public/rsvp/not-a-uuid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      {
        ...BASE_ENV,
      } as never,
    );

    // Not 403 Origin-required — it should hit the route handler, which
    // returns 400 for an invalid token.
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(400);
  });

  it("does not capture expected 4xx route responses in Sentry", async () => {
    const captureApiException = vi.fn(() => "event-should-not-exist");

    vi.resetModules();
    vi.doMock("../../src/lib/sentry", () => ({
      captureApiException,
      withSentry: <T>(handler: T) => handler,
    }));
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => makeDb()),
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(
      new Request("http://localhost/api/public/rsvp/not-a-uuid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      {
        ...BASE_ENV,
      } as never,
    );

    expect(res.status).toBe(400);
    expect(res.headers.get("X-Kaiplan-Error-Id")).toBeNull();
    expect(captureApiException).not.toHaveBeenCalled();
  });

  it("uses the noop email service in e2e mode (development)", async () => {
    const db = makeDb([[]]);
    const createEmailService = vi.fn(() => ({
      sendPasswordReset: vi.fn(),
    }));
    const createNoopEmailService = vi.fn(() => ({
      sendPasswordReset: vi.fn(),
      sendMemberInvite: vi.fn(),
      sendRsvpConfirmation: vi.fn(),
      sendRsvpReminder: vi.fn(),
    }));

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));
    vi.doMock("../../src/lib/email", () => ({
      createEmailService,
      createNoopEmailService,
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(new Request("http://localhost/api/billing"), {
      ...BASE_ENV,
      E2E_MODE: "true",
      ENVIRONMENT: "development",
    } as never);

    expect(res.status).toBe(200);
    expect(createNoopEmailService).toHaveBeenCalled();
    expect(createEmailService).not.toHaveBeenCalled();
  });

  it("does NOT use the noop email service when E2E_MODE=true but ENVIRONMENT=production", async () => {
    const db = makeDb([[]]);
    const createEmailService = vi.fn(() => ({
      sendPasswordReset: vi.fn(),
      sendMemberInvite: vi.fn(),
      sendRsvpConfirmation: vi.fn(),
      sendRsvpReminder: vi.fn(),
    }));
    const createNoopEmailService = vi.fn(() => ({
      sendPasswordReset: vi.fn(),
      sendMemberInvite: vi.fn(),
      sendRsvpConfirmation: vi.fn(),
      sendRsvpReminder: vi.fn(),
    }));

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/auth", () => ({
      createAuth: vi.fn(() => makeAuth()),
    }));
    vi.doMock("../../src/lib/email", () => ({
      createEmailService,
      createNoopEmailService,
    }));

    const { default: app } = await import("../../src/index");

    const res = await app.fetch(new Request("http://localhost/api/billing"), {
      ...BASE_ENV,
      BETTER_AUTH_URL: "https://api.kaiplan.test",
      E2E_MODE: "true",
      ENVIRONMENT: "production",
    } as never);

    expect(res.status).toBe(200);
    expect(createNoopEmailService).not.toHaveBeenCalled();
    expect(createEmailService).toHaveBeenCalled();
  });
});

describe("api scheduled entrypoint", () => {
  it("schedules every maintenance job through waitUntil", async () => {
    const db = { id: "db" };
    const marketingDb = { id: "marketing-db" };
    const emailService = { id: "email-service" };
    const stripe = { id: "stripe" };
    const waitUntil = vi.fn();
    const cleanupOldProcessedEvents = vi.fn().mockResolvedValue(undefined);
    const cleanupOldEmailOperationalData = vi.fn().mockResolvedValue(undefined);
    const dispatchTrialEndingReminders = vi.fn().mockResolvedValue(undefined);
    const dispatchSignupLifecycleEmails = vi.fn().mockResolvedValue(undefined);
    const expireElapsedFreeTrials = vi.fn().mockResolvedValue(2);

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => db),
    }));
    vi.doMock("../../src/db/marketing-client", () => ({
      createMarketingDb: vi.fn(() => marketingDb),
    }));
    vi.doMock("../../src/lib/email", () => ({
      cleanupOldEmailOperationalData,
      createEmailService: vi.fn(() => emailService),
      createNoopEmailService: vi.fn(),
      getCapturedPasswordResets: vi.fn(() => []),
    }));
    vi.doMock("../../src/lib/billing", () => ({
      cleanupOldProcessedEvents,
      dispatchTrialEndingReminders,
      expireElapsedFreeTrials,
    }));
    vi.doMock("../../src/lib/lifecycle-emails", () => ({
      dispatchSignupLifecycleEmails,
    }));
    vi.doMock("../../src/lib/stripe", () => ({
      createStripeClient: vi.fn(() => stripe),
    }));

    const { default: worker } = await import("../../src/index");

    worker.scheduled?.(
      {} as ScheduledController,
      BASE_ENV as never,
      {
        waitUntil,
      } as unknown as ExecutionContext,
    );

    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]![0];
    expect(cleanupOldProcessedEvents).toHaveBeenCalledWith(db);
    expect(cleanupOldEmailOperationalData).toHaveBeenCalledWith(marketingDb);
    expect(dispatchTrialEndingReminders).toHaveBeenCalledWith(
      db,
      BASE_ENV,
      stripe,
      emailService,
    );
    expect(dispatchSignupLifecycleEmails).toHaveBeenCalledWith(
      db,
      marketingDb,
      BASE_ENV,
      emailService,
    );
    expect(expireElapsedFreeTrials).toHaveBeenCalledWith(db);
  });

  it("runs maintenance jobs sequentially to avoid sharing the pg pool", async () => {
    const waitUntil = vi.fn();
    let inflight = 0;
    let maxInflight = 0;
    const trackingJob = (resolveValue: unknown) =>
      vi.fn().mockImplementation(async () => {
        inflight += 1;
        if (inflight > maxInflight) maxInflight = inflight;
        await Promise.resolve();
        inflight -= 1;
        return resolveValue;
      });

    const cleanupOldProcessedEvents = trackingJob(undefined);
    const cleanupOldEmailOperationalData = trackingJob(undefined);
    const dispatchTrialEndingReminders = trackingJob(undefined);
    const dispatchSignupLifecycleEmails = trackingJob(undefined);
    const expireElapsedFreeTrials = trackingJob(0);

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => ({ id: "db" })),
    }));
    vi.doMock("../../src/db/marketing-client", () => ({
      createMarketingDb: vi.fn(() => ({ id: "marketing-db" })),
    }));
    vi.doMock("../../src/lib/email", () => ({
      cleanupOldEmailOperationalData,
      createEmailService: vi.fn(() => ({ id: "email-service" })),
      createNoopEmailService: vi.fn(),
      getCapturedPasswordResets: vi.fn(() => []),
    }));
    vi.doMock("../../src/lib/billing", () => ({
      cleanupOldProcessedEvents,
      dispatchTrialEndingReminders,
      expireElapsedFreeTrials,
    }));
    vi.doMock("../../src/lib/lifecycle-emails", () => ({
      dispatchSignupLifecycleEmails,
    }));
    vi.doMock("../../src/lib/stripe", () => ({
      createStripeClient: vi.fn(() => ({ id: "stripe" })),
    }));

    const { default: worker } = await import("../../src/index");

    worker.scheduled?.(
      {} as ScheduledController,
      BASE_ENV as never,
      {
        waitUntil,
      } as unknown as ExecutionContext,
    );

    await waitUntil.mock.calls[0]![0];

    expect(maxInflight).toBe(1);
  });

  it("captures rejected maintenance jobs without rejecting waitUntil", async () => {
    const scheduledError = new Error("cleanup failed");
    const captureApiException = vi.fn();
    const waitUntil = vi.fn();

    vi.resetModules();
    vi.doMock("../../src/db/client", () => ({
      createDb: vi.fn(() => ({})),
    }));
    vi.doMock("../../src/db/marketing-client", () => ({
      createMarketingDb: vi.fn(() => ({})),
    }));
    vi.doMock("../../src/lib/email", () => ({
      cleanupOldEmailOperationalData: vi.fn().mockResolvedValue(undefined),
      createEmailService: vi.fn(() => ({})),
      createNoopEmailService: vi.fn(),
      getCapturedPasswordResets: vi.fn(() => []),
    }));
    vi.doMock("../../src/lib/billing", () => ({
      cleanupOldProcessedEvents: vi.fn().mockRejectedValue(scheduledError),
      dispatchTrialEndingReminders: vi.fn().mockResolvedValue(undefined),
      expireElapsedFreeTrials: vi.fn().mockResolvedValue(0),
    }));
    vi.doMock("../../src/lib/lifecycle-emails", () => ({
      dispatchSignupLifecycleEmails: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("../../src/lib/stripe", () => ({
      createStripeClient: vi.fn(() => ({})),
    }));
    vi.doMock("../../src/lib/sentry", () => ({
      captureApiException,
      withSentry: <T>(handler: T) => handler,
    }));

    const { default: worker } = await import("../../src/index");

    worker.scheduled?.(
      {} as ScheduledController,
      BASE_ENV as never,
      {
        waitUntil,
      } as unknown as ExecutionContext,
    );

    await expect(waitUntil.mock.calls[0]![0]).resolves.toBeUndefined();
    expect(captureApiException).toHaveBeenCalledWith(scheduledError, {
      source: "scheduled",
    });
  });
});

// ---------------------------------------------------------------------------
// withDbRetry
// ---------------------------------------------------------------------------
describe("withDbRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("succeeds on first attempt without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withDbRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient 'timed out' error and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection timed out"))
      .mockResolvedValueOnce("ok");

    const promise = withDbRetry(fn, 2, 3000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on transient 'connection' error and succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce("ok");

    const promise = withDbRetry(fn, 2, 3000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after all retries and re-throws the last error", async () => {
    const err = new Error("timed out after 15000ms");
    const fn = vi.fn().mockRejectedValue(err);

    const assertion = expect(withDbRetry(fn, 2, 3000)).rejects.toThrow(
      "timed out after 15000ms",
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does NOT retry on non-connection errors", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new TypeError("unexpected null"));

    const assertion = expect(withDbRetry(fn, 2, 3000)).rejects.toThrow(
      "unexpected null",
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("throws immediately on first non-transient error (no delay)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("syntax error in query"));
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const assertion = expect(withDbRetry(fn, 2, 3000)).rejects.toThrow(
      "syntax error in query",
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 'timeout exceeded' error (Hyperdrive cold-start pattern)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("timeout exceeded when trying to connect"),
      )
      .mockResolvedValueOnce("ok");

    const promise = withDbRetry(fn, 2, 3000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on bare 'timeout exceeded' error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout exceeded"))
      .mockResolvedValueOnce("ok");

    const promise = withDbRetry(fn, 2, 3000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("inspects err.cause for transient signals (Drizzle wraps the real error)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("Failed query: select 1"), {
          cause: new Error("timeout exceeded when trying to connect"),
        }),
      )
      .mockResolvedValueOnce("ok");

    const promise = withDbRetry(fn, 2, 3000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 'connect' fragment without 'connection' (e.g. failed to connect)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed to connect to database"))
      .mockResolvedValueOnce("ok");

    const promise = withDbRetry(fn, 2, 3000);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("exhausts retries and re-throws exact Hyperdrive connection timeout error", async () => {
    const err = new Error("timeout exceeded when trying to connect");
    const fn = vi.fn().mockRejectedValue(err);

    const assertion = expect(withDbRetry(fn, 2, 3000)).rejects.toThrow(
      "timeout exceeded when trying to connect",
    );
    await vi.runAllTimersAsync();
    await assertion;

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

// ---------------------------------------------------------------------------
// Task 19: Global onError handler — tested via standalone Hono app with
// the same error-handling logic extracted from index.ts.
// ---------------------------------------------------------------------------
describe("app.onError — global error handler", () => {
  // Build a minimal Hono app that mirrors the onError registration in
  // index.ts, so we can test the handler logic without the full app startup.
  function makeErrorApp(
    _env: { E2E_MODE?: string; ENVIRONMENT?: string },
    throwFn: () => never,
  ) {
    type TestEnv = { Bindings: { E2E_MODE?: string; ENVIRONMENT?: string } };
    const app = new Hono<TestEnv>();

    app.onError((err, c) => {
      console.error("[API error]", err.message, err.stack);

      const isMalformedJson = isMalformedJsonBodyError(err);
      const status = isMalformedJson
        ? 400
        : "status" in err &&
            typeof (err as { status: unknown }).status === "number"
          ? (err as { status: number }).status
          : 500;

      const isDev = isE2eAllowed(c.env) || c.env.ENVIRONMENT === "development";

      const body = isMalformedJson
        ? { error: "Malformed JSON request body" }
        : isDev
          ? { error: err.message }
          : { error: "Internal server error" };

      return c.json(body, status as Parameters<typeof c.json>[1]);
    });

    app.get("/test", () => {
      throwFn();
    });

    return app;
  }

  it("returns 500 with generic message in production when a route throws", async () => {
    const app = makeErrorApp({ ENVIRONMENT: "production" }, () => {
      throw new Error("database connection lost");
    });

    const res = await app.fetch(new Request("http://localhost/test"), {
      ENVIRONMENT: "production",
    } as never);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal server error");
    // Stack trace / original message must not be leaked in production
    expect(JSON.stringify(body)).not.toContain("database connection lost");
  });

  it("returns 500 with error message in development when a route throws", async () => {
    const app = makeErrorApp({ ENVIRONMENT: "development" }, () => {
      throw new Error("dev error detail");
    });

    const res = await app.fetch(new Request("http://localhost/test"), {
      ENVIRONMENT: "development",
    } as never);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("dev error detail");
  });

  it("uses the status code from an HTTPException", async () => {
    const app = makeErrorApp({ ENVIRONMENT: "production" }, () => {
      throw new HTTPException(403, { message: "Forbidden resource" });
    });

    const res = await app.fetch(new Request("http://localhost/test"), {
      ENVIRONMENT: "production",
    } as never);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal server error");
  });

  it("returns dev error message when E2E mode is active (isE2eAllowed)", async () => {
    const app = makeErrorApp({ ENVIRONMENT: "test", E2E_MODE: "true" }, () => {
      throw new Error("e2e visible error");
    });

    const res = await app.fetch(new Request("http://localhost/test"), {
      ENVIRONMENT: "test",
      E2E_MODE: "true",
    } as never);

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("e2e visible error");
  });

  it("returns 400 for malformed JSON parse errors", async () => {
    const app = makeErrorApp({ ENVIRONMENT: "production" }, () => {
      const error = new SyntaxError("Expected property name or '}' in JSON");
      error.stack = "SyntaxError: Expected property name\n    at JSON.parse";
      throw error;
    });

    const res = await app.fetch(new Request("http://localhost/test"), {
      ENVIRONMENT: "production",
    } as never);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Malformed JSON request body",
    });
  });

  it("returns 500 for unrelated server-side syntax errors", async () => {
    const app = makeErrorApp({ ENVIRONMENT: "production" }, () => {
      throw new SyntaxError("Bug in generated function");
    });

    const res = await app.fetch(new Request("http://localhost/test"), {
      ENVIRONMENT: "production",
    } as never);

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Internal server error",
    });
  });

  it("logs the error to console.error with message and stack", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const app = makeErrorApp({ ENVIRONMENT: "production" }, () => {
      throw new Error("logged error");
    });

    await app.fetch(new Request("http://localhost/test"), {
      ENVIRONMENT: "production",
    } as never);

    expect(consoleSpy).toHaveBeenCalledWith(
      "[API error]",
      "logged error",
      expect.any(String),
    );

    consoleSpy.mockRestore();
  });

  it("suppresses stack trace in production (no stack in response body)", async () => {
    const app = makeErrorApp({ ENVIRONMENT: "production" }, () => {
      const err = new Error("secret implementation detail");
      throw err;
    });

    const res = await app.fetch(new Request("http://localhost/test"), {
      ENVIRONMENT: "production",
    } as never);

    const text = await res.text();
    expect(text).not.toContain("secret implementation detail");
    expect(text).not.toContain("stack");
  });
});
