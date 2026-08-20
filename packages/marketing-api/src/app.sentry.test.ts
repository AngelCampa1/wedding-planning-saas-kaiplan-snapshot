import { describe, it, expect, vi, beforeEach } from "vitest";
import { createApi } from "./app";
import type { ApiEnv } from "./app";

// Mock @sentry/cloudflare so tests don't need a real DSN or network
vi.mock("@sentry/cloudflare", () => ({
  captureException: vi.fn(() => "event-marketing-123"),
  withSentry: vi.fn(
    (
      _configFn: () => unknown,
      app: { fetch: (...args: unknown[]) => unknown },
    ) => app,
  ),
  withScope: vi.fn(
    (callback: (scope: { setTags: ReturnType<typeof vi.fn> }) => void) =>
      callback({ setTags: vi.fn() }),
  ),
  instrumentD1WithSentry: vi.fn((db: unknown) => db),
}));

import * as SentryCloudflare from "@sentry/cloudflare";

function buildMockDb() {
  return {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => Promise.resolve(undefined),
        run: async () => {},
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => [{ count: 0 }],
        then: (resolve: (v: unknown) => void) => resolve([{ count: 0 }]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({ run: async () => {} }),
      }),
    }),
  };
}

function buildBaseEnv(extra: Partial<ApiEnv> = {}): ApiEnv {
  return {
    DB: {} as D1Database,
    RESEND_API_KEY: "re_test",
    APOLLO_API_KEY: "apollo_test",
    PRODUCT_NAME: "SentryTest",
    PRODUCT_DOMAIN: "sentrytest.app",
    PRODUCT_LOGO_URL: "https://sentrytest.app/logo.png",
    PRODUCT_BRAND_COLOR: "#0066FF",
    PRODUCT_ACCENT_COLOR: "#f59e0b",
    CALENDAR_URL: "https://cal.com/test",
    EMAIL_FROM: "hello@sentrytest.app",
    STATS_SECRET: "test-secret",
    ALLOWED_ORIGIN: "https://sentrytest.app",
    _db: buildMockDb() as unknown as ApiEnv["_db"],
    ...extra,
  };
}

describe("createApi — without SENTRY_DSN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with a .fetch() method", () => {
    const api = createApi(buildBaseEnv());
    expect(typeof api.fetch).toBe("function");
  });

  it("does NOT call Sentry.withSentry when SENTRY_DSN is absent", () => {
    createApi(buildBaseEnv());
    expect(SentryCloudflare.withSentry).not.toHaveBeenCalled();
  });

  it("does NOT call instrumentD1WithSentry when SENTRY_DSN is absent", () => {
    createApi(buildBaseEnv());
    expect(SentryCloudflare.instrumentD1WithSentry).not.toHaveBeenCalled();
  });

  it("handles GET /api/stats correctly (404 for unknown, 401 for stats without auth)", async () => {
    const api = createApi(buildBaseEnv());
    const res = await api.request("/api/stats");
    // No auth header → should be 401
    expect(res.status).toBe(401);
    expect(SentryCloudflare.captureException).not.toHaveBeenCalled();
  });

  it("handles unknown routes with 404", async () => {
    const api = createApi(buildBaseEnv());
    const res = await api.request("/api/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("createApi — with SENTRY_DSN", () => {
  const TEST_DSN = "https://abc123@o0.ingest.sentry.io/0";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an object with a .fetch() method", () => {
    const api = createApi(buildBaseEnv({ SENTRY_DSN: TEST_DSN }));
    expect(typeof api.fetch).toBe("function");
  });

  it("calls Sentry.withSentry when SENTRY_DSN is present", () => {
    createApi(buildBaseEnv({ SENTRY_DSN: TEST_DSN }));
    expect(SentryCloudflare.withSentry).toHaveBeenCalledOnce();
  });

  it("passes a config function that includes DSN, release, environment, and tags", () => {
    const env = buildBaseEnv({
      SENTRY_DSN: TEST_DSN,
      ENVIRONMENT: "production",
      CF_VERSION_METADATA: {
        id: "version-123",
        tag: "v1",
        timestamp: "2026-04-23T00:00:00.000Z",
      },
    });
    createApi(env);

    const [configFn] = (SentryCloudflare.withSentry as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [
      () => {
        dsn: string;
        environment: string;
        release: string;
        initialScope: { tags: { service: string; site: string } };
      },
    ];
    const config = configFn();
    expect(config.dsn).toBe(TEST_DSN);
    expect(config.environment).toBe("production");
    expect(config.release).toBe("version-123");
    expect(config.initialScope.tags.site).toBe(env.PRODUCT_NAME);
    expect(config.initialScope.tags.service).toBe("kaiplan-marketing-api");
  });

  it("calls instrumentD1WithSentry with env.DB when SENTRY_DSN is present", () => {
    const mockDb = {} as D1Database;
    const env = buildBaseEnv({ SENTRY_DSN: TEST_DSN, DB: mockDb });
    // instrumentD1WithSentry is called at createApi setup scope, not per-request
    createApi(env);
    expect(SentryCloudflare.instrumentD1WithSentry).toHaveBeenCalledWith(
      mockDb,
    );
  });

  it("still handles GET /api/stats correctly when Sentry is enabled", async () => {
    const api = createApi(buildBaseEnv({ SENTRY_DSN: TEST_DSN }));
    const res = await api.request("/api/stats");
    // No auth header → should be 401
    expect(res.status).toBe(401);
  });

  it("still handles GET /api/stats with correct auth when Sentry is enabled", async () => {
    const api = createApi(buildBaseEnv({ SENTRY_DSN: TEST_DSN }));
    const res = await api.request("/api/stats", {
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(res.status).toBe(200);
  });

  it("withSentry config sets tracesSampleRate to 1.0", () => {
    createApi(buildBaseEnv({ SENTRY_DSN: TEST_DSN }));
    const [configFn] = (SentryCloudflare.withSentry as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [() => { tracesSampleRate: number }];
    const config = configFn();
    expect(config.tracesSampleRate).toBe(1.0);
  });

  it("withSentry config disables default PII and sets beforeSend", () => {
    createApi(buildBaseEnv({ SENTRY_DSN: TEST_DSN }));
    const [configFn] = (SentryCloudflare.withSentry as ReturnType<typeof vi.fn>)
      .mock.calls[0] as [
      () => { beforeSend: unknown; sendDefaultPii: boolean },
    ];
    const config = configFn();
    expect(config.sendDefaultPii).toBe(false);
    expect(typeof config.beforeSend).toBe("function");
  });

  it("_db override causes drizzle to use _db directly instead of the instrumented binding", async () => {
    // instrumentD1WithSentry IS called at createApi setup (the binding is still instrumented),
    // but drizzle() receives _db when provided — so queries go through the test mock, not D1.
    const api = createApi(buildBaseEnv({ SENTRY_DSN: TEST_DSN }));
    const res = await api.request("/api/stats", {
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(res.status).toBe(200);
  });

  it("returns a Sentry error id for captured stats 5xx failures", async () => {
    const api = createApi(
      buildBaseEnv({
        SENTRY_DSN: TEST_DSN,
        _db: {
          select: () => {
            throw new Error("database offline");
          },
        } as unknown as ApiEnv["_db"],
      }),
    );

    const res = await api.request("/api/stats", {
      headers: { Authorization: "Bearer test-secret" },
    });

    expect(res.status).toBe(500);
    expect(res.headers.get("X-Kaiplan-Error-Id")).toBe("event-marketing-123");
    expect(res.headers.get("Access-Control-Expose-Headers")).toBe(
      "X-Kaiplan-Error-Id",
    );
    await expect(res.json()).resolves.toMatchObject({
      error: "Internal server error",
      errorId: "event-marketing-123",
    });
    expect(SentryCloudflare.captureException).toHaveBeenCalledOnce();
  });
});
