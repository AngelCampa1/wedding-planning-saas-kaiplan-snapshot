import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureApiException,
  getSentryOptions,
  shouldCaptureApiException,
  scrubSentryPath,
  scrubSentryEvent,
  withSentry,
} from "../../src/lib/sentry";
import type { Env } from "../../src/lib/env";
import { HTTPException } from "hono/http-exception";
import { TEST_STRIPE_PRICE_ENV } from "../helpers/stripe-env";

const sentryMocks = vi.hoisted(() => {
  type MockScope = { setTags: ReturnType<typeof vi.fn> };
  const captureException = vi.fn(() => "event-123");
  const scope = { setTags: vi.fn() };
  const withScope = vi.fn((callback: (scope: MockScope) => void) =>
    callback(scope),
  );
  const withSentry = vi.fn((_config: unknown, handler: unknown) => handler);
  return { captureException, scope, withScope, withSentry };
});

vi.mock("@sentry/cloudflare", () => ({
  captureException: sentryMocks.captureException,
  withScope: sentryMocks.withScope,
  withSentry: sentryMocks.withSentry,
}));

function env(overrides: Partial<Env> = {}): Env {
  return {
    APP_URL: "https://my.kaiplan.app",
    BETTER_AUTH_SECRET: "secret",
    BETTER_AUTH_URL: "https://api.kaiplan.app",
    CLOUDFLARE_IMAGES_ACCOUNT_ID: "account",
    CLOUDFLARE_IMAGES_API_TOKEN: "token",
    EMAIL_FROM_ADDRESS: "Angel Campa <angel.campa@kaiplan.app>",
    EMAIL_TOKEN_SECRET: "email-secret",
    STRIPE_CHECKOUT_CANCEL_URL: "https://my.kaiplan.app/cancel",
    STRIPE_CHECKOUT_SUCCESS_URL: "https://my.kaiplan.app/success",
    STRIPE_PORTAL_RETURN_URL: "https://my.kaiplan.app/settings",
    STRIPE_SECRET_KEY: "sk_live",
    STRIPE_WEBHOOK_SECRET: "whsec",
    ...TEST_STRIPE_PRICE_ENV,
    ...overrides,
  };
}

describe("api Sentry helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when no DSN is configured", () => {
    expect(getSentryOptions(env())).toBeUndefined();
  });

  it("builds scrubbed production options with release metadata", () => {
    const options = getSentryOptions(
      env({
        ENVIRONMENT: "production",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        CF_VERSION_METADATA: {
          id: "version-123",
          tag: "v1",
          timestamp: "2026-04-23T00:00:00.000Z",
        },
      }),
    );

    expect(options).toMatchObject({
      dsn: "https://public@example.ingest.sentry.io/1",
      environment: "production",
      release: "version-123",
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it("scrubs sensitive headers and URL parameters", () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {
          Authorization: "Bearer secret",
          Cookie: "session=secret",
          Referer:
            "https://kaiplan.app/rsvp/invite-token-value-123?t=survey-secret",
          "X-Safe-URL": "not-a-url-with-token=secret",
          "X-Request-ID": "request-id",
        },
        url: "https://api.kaiplan.app/path?stripeToken=secret&t=survey-secret&ok=1",
      },
    });

    expect(event.request?.headers?.Authorization).toBe("[Filtered]");
    expect(event.request?.headers?.Cookie).toBe("[Filtered]");
    expect(event.request?.headers?.Referer).toContain("/rsvp/[Filtered]");
    expect(event.request?.headers?.Referer).toContain("t=%5BFiltered%5D");
    expect(event.request?.headers?.Referer).not.toContain("survey-secret");
    expect(event.request?.headers?.["X-Safe-URL"]).toBe(
      "not-a-url-with-token=secret",
    );
    expect(event.request?.headers?.["X-Request-ID"]).toBe("request-id");
    expect(event.request?.url).toContain("stripeToken=%5BFiltered%5D");
    expect(event.request?.url).toContain("t=%5BFiltered%5D");
  });

  it("scrubs sensitive path segments from Sentry URLs and tags", () => {
    expect(scrubSentryPath("/api/public/rsvp/invite-token-value-123")).toBe(
      "/api/public/rsvp/[Filtered]",
    );
    expect(
      scrubSentryPath("/api/public/email/preferences/email-token-value-123"),
    ).toBe("/api/public/email/preferences/[Filtered]");
    expect(scrubSentryPath("/api/payments/payment-token-value-123")).toBe(
      "/api/payments/[Filtered]",
    );
    expect(scrubSentryPath("/api/token/short")).toBe("/api/[Filtered]/short");
    expect(scrubSentryPath("/api/public/rsvp/short")).toBe(
      "/api/public/rsvp/short",
    );
    expect(scrubSentryPath("public")).toBe("public");

    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {},
        url: "https://api.kaiplan.app/api/payments/payment-token-value-123?ok=1",
      },
    });

    expect(event.request?.url).toContain("/api/payments/[Filtered]");
    expect(event.request?.url).not.toContain("payment-token-value-123");
  });

  it("scrubs sensitive values from malformed URLs", () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {
          Referer: "http://[bad]/payments/payment-token-value-123?token=secret",
        },
        url: "http://[bad]/invite/invite-token-value-123?token=secret&sessionId=session&stripeAccount=stripe&ok=1",
      },
    });

    expect(event.request?.headers?.Referer).toContain("/payments/[Filtered]");
    expect(event.request?.headers?.Referer).not.toContain(
      "payment-token-value-123",
    );
    expect(event.request?.url).toContain("/invite/[Filtered]");
    expect(event.request?.url).not.toContain("invite-token-value-123");
    expect(event.request?.url).toContain("token=[Filtered]");
    expect(event.request?.url).toContain("sessionId=[Filtered]");
    expect(event.request?.url).toContain("stripeAccount=[Filtered]");
  });

  it("scrubs malformed URL paths without query strings", () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {},
        url: "http://[bad]/rsvp/rsvp-token-value-123#section",
      },
    });

    expect(event.request?.url).toBe("http://[bad]/rsvp/[Filtered]#section");
  });

  it("leaves events without request data intact", () => {
    const event = { type: undefined };

    expect(scrubSentryEvent(event)).toBe(event);
  });

  it("captures exceptions with tags and returns the Sentry event id", () => {
    const error = new Error("boom");

    const eventId = captureApiException(error, { source: "test" });

    expect(sentryMocks.scope.setTags).toHaveBeenCalledWith({ source: "test" });
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
    expect(eventId).toBe("event-123");
  });

  it("captures exceptions without tags", () => {
    const error = new Error("boom");

    captureApiException(error);

    expect(sentryMocks.scope.setTags).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
  });

  it("wraps exported handlers with Sentry", () => {
    const handler = { fetch: vi.fn() } as unknown as ExportedHandler<Env>;

    expect(withSentry(handler)).toBe(handler);
    expect(sentryMocks.withSentry).toHaveBeenCalled();
    const [buildOptions] = sentryMocks.withSentry.mock.calls[0]!;
    expect(
      (buildOptions as (env: Env) => unknown)(
        env({ SENTRY_DSN: "https://public@example.ingest.sentry.io/1" }),
      ),
    ).toMatchObject({
      dsn: "https://public@example.ingest.sentry.io/1",
    });
  });

  it("captures 5xx and unexpected thrown 4xx but skips expected HTTPException 4xx", () => {
    expect(shouldCaptureApiException(new Error("boom"), 500)).toBe(true);
    expect(
      shouldCaptureApiException(
        Object.assign(new Error("custom forbidden"), { status: 403 }),
        403,
      ),
    ).toBe(true);
    expect(
      shouldCaptureApiException(new HTTPException(403, { message: "No" }), 403),
    ).toBe(false);
  });
});
