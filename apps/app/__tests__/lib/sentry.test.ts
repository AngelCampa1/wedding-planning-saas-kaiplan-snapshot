import { beforeEach, describe, expect, it, vi } from "vitest";

const sentryMocks = vi.hoisted(() => {
  type MockScope = { setTags: ReturnType<typeof vi.fn> };
  const captureException = vi.fn(() => "event-123");
  const init = vi.fn();
  const reactErrorHandler = vi.fn(() => vi.fn());
  const scope = { setTags: vi.fn() };
  const setUser = vi.fn();
  const withScope = vi.fn((callback: (scope: MockScope) => void) =>
    callback(scope),
  );

  return {
    captureException,
    init,
    reactErrorHandler,
    scope,
    setUser,
    withScope,
  };
});

vi.mock("@sentry/react", () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  reactErrorHandler: sentryMocks.reactErrorHandler,
  setUser: sentryMocks.setUser,
  withScope: sentryMocks.withScope,
}));

describe("app Sentry helper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("initializes Sentry when VITE_SENTRY_DSN is present", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    vi.stubEnv("VITE_SENTRY_RELEASE", "release-123");
    vi.stubEnv("MODE", "production");

    await import("../../src/lib/sentry");

    expect(sentryMocks.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.ingest.sentry.io/1",
        environment: "production",
        release: "release-123",
        sendDefaultPii: false,
      }),
    );
  });

  it("does not initialize Sentry without a DSN", async () => {
    await import("../../src/lib/sentry");

    expect(sentryMocks.init).not.toHaveBeenCalled();
  });

  it("scrubs sensitive request data before sending an event", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    const { init } = sentryMocks;

    await import("../../src/lib/sentry");

    const options = init.mock.calls[0]?.[0] as {
      beforeSend: (event: {
        type?: undefined;
        request: { headers: Record<string, string>; url: string };
      }) => unknown;
    };
    const event = options.beforeSend({
      type: undefined,
      request: {
        headers: {
          Authorization: "Bearer secret",
          Cookie: "session=secret",
          Referer:
            "https://my.kaiplan.app/payments/payment-token-value-123?token=secret&t=survey-secret",
          "X-Request-ID": "request-id",
        },
        url: "https://my.kaiplan.app/invite?token=secret&ok=1",
      },
    }) as { request: { headers: Record<string, string>; url: string } };

    expect(event.request.headers.Authorization).toBe("[Filtered]");
    expect(event.request.headers.Cookie).toBe("[Filtered]");
    expect(event.request.headers.Referer).toContain("/payments/[Filtered]");
    expect(event.request.headers.Referer).toContain("token=%5BFiltered%5D");
    expect(event.request.headers.Referer).toContain("t=%5BFiltered%5D");
    expect(event.request.headers.Referer).not.toContain("survey-secret");
    expect(event.request.headers["X-Request-ID"]).toBe("request-id");
    expect(event.request.url).toContain("token=%5BFiltered%5D");
  });

  it("scrubs sensitive path segments before sending an event", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");

    await import("../../src/lib/sentry");

    const options = sentryMocks.init.mock.calls[0]?.[0] as {
      beforeSend: (event: {
        type?: undefined;
        request: { headers: Record<string, string>; url: string };
      }) => unknown;
    };
    const event = options.beforeSend({
      type: undefined,
      request: {
        headers: {},
        url: "https://my.kaiplan.app/payments/payment-token-value-123?ok=1",
      },
    }) as { request: { url: string } };

    expect(event.request.url).toContain("/payments/[Filtered]");
    expect(event.request.url).not.toContain("payment-token-value-123");
  });

  it("scrubs exact sensitive first path segments", async () => {
    const { scrubPath } = await import("../../src/lib/sentry");

    expect(scrubPath("token/short")).toBe("[Filtered]/short");
  });

  it("falls back to regex URL scrubbing for malformed URLs", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");

    await import("../../src/lib/sentry");

    const options = sentryMocks.init.mock.calls[0]?.[0] as {
      beforeSend: (event: {
        type?: undefined;
        request: { headers: Record<string, string>; url: string };
      }) => unknown;
    };
    const event = options.beforeSend({
      type: undefined,
      request: {
        headers: {
          "X-Token": "secret",
          Referer: "http://[bad]/referral/ABC12345?ref=ABC12345",
          Safe: "ok",
        },
        url: "::::/referral/ABC12345?inviteToken=secret&t=survey-secret&ref=ABC12345&ok=1#section",
      },
    }) as { request: { headers: Record<string, string>; url: string } };

    expect(event.request.headers["X-Token"]).toBe("[Filtered]");
    expect(event.request.headers.Referer).toContain("/referral/[Filtered]");
    expect(event.request.headers.Referer).not.toContain("ABC12345");
    expect(event.request.headers.Safe).toBe("ok");
    expect(event.request.url).toContain("/referral/[Filtered]");
    expect(event.request.url).toContain("inviteToken=[Filtered]");
    expect(event.request.url).toContain("t=[Filtered]");
    expect(event.request.url).toContain("ref=[Filtered]");
    expect(event.request.url).not.toContain("survey-secret");
    expect(event.request.url).not.toContain("ABC12345");
  });

  it("scrubs malformed URLs without query strings and non-string headers", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");

    await import("../../src/lib/sentry");

    const options = sentryMocks.init.mock.calls[0]?.[0] as {
      beforeSend: (event: {
        type?: undefined;
        request: { headers: Record<string, unknown>; url: string };
      }) => unknown;
    };
    const event = options.beforeSend({
      type: undefined,
      request: {
        headers: { "X-Retry-Count": 2 },
        url: "http://[bad]/referral/ABC12345#section",
      },
    }) as { request: { headers: Record<string, unknown>; url: string } };

    expect(event.request.headers["X-Retry-Count"]).toBe(2);
    expect(event.request.url).toBe("http://[bad]/referral/[Filtered]#section");
  });

  it("leaves events without request data unchanged", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");

    await import("../../src/lib/sentry");

    const options = sentryMocks.init.mock.calls[0]?.[0] as {
      beforeSend: (event: { type?: undefined }) => unknown;
    };
    const event = { type: undefined };

    expect(options.beforeSend(event)).toBe(event);
  });

  it("returns React root error handlers from Sentry", async () => {
    const { getReactRootErrorHandlers } = await import("../../src/lib/sentry");

    expect(getReactRootErrorHandlers()).toEqual({
      onUncaughtError: expect.any(Function),
      onCaughtError: expect.any(Function),
      onRecoverableError: expect.any(Function),
    });
    expect(sentryMocks.reactErrorHandler).toHaveBeenCalledTimes(3);
  });

  it("reports route errors only once per error object", async () => {
    const { captureRouteErrorOnce } = await import("../../src/lib/sentry");
    const error = new Error("route exploded");

    const firstEventId = captureRouteErrorOnce(error);
    const secondEventId = captureRouteErrorOnce(error);

    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(firstEventId).toBe("event-123");
    expect(secondEventId).toBe("event-123");
  });

  it("captures exceptions without tags and returns the Sentry event id", async () => {
    const { captureException } = await import("../../src/lib/sentry");
    const error = new Error("plain failure");

    const eventId = captureException(error);

    expect(sentryMocks.scope.setTags).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
    expect(eventId).toBe("event-123");
  });

  it("reports primitive route errors only once per message", async () => {
    const { captureRouteErrorOnce } = await import("../../src/lib/sentry");

    const firstEventId = captureRouteErrorOnce("route exploded");
    const secondEventId = captureRouteErrorOnce("route exploded");

    expect(sentryMocks.captureException).toHaveBeenCalledTimes(1);
    expect(firstEventId).toBe("event-123");
    expect(secondEventId).toBe("event-123");
    expect(sentryMocks.scope.setTags).toHaveBeenCalledWith({
      source: "tanstack-router",
    });
  });

  it("skips expected ApiError statuses below 500", async () => {
    const [{ captureQueryError }, { ApiError }] = await Promise.all([
      import("../../src/lib/sentry"),
      import("../../src/lib/api"),
    ]);

    captureQueryError(new ApiError(403, "Forbidden"));

    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });

  it("captures 5xx ApiError statuses and sets user ids", async () => {
    const [{ captureQueryError, setSentryUser }, { ApiError }] =
      await Promise.all([
        import("../../src/lib/sentry"),
        import("../../src/lib/api"),
      ]);

    captureQueryError(new ApiError(503, "Unavailable"));
    setSentryUser("user-123");
    setSentryUser(null);

    expect(sentryMocks.captureException).toHaveBeenCalledOnce();
    expect(sentryMocks.setUser).toHaveBeenNthCalledWith(1, { id: "user-123" });
    expect(sentryMocks.setUser).toHaveBeenNthCalledWith(2, null);
  });

  it("returns the event id from query error capture", async () => {
    const { captureQueryError } = await import("../../src/lib/sentry");

    const eventId = captureQueryError(new Error("query exploded"));

    expect(eventId).toBe("event-123");
  });
});
