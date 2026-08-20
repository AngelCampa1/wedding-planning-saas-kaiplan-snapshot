import { describe, expect, it, vi } from "vitest";
import { captureMarketingApiException, scrubSentryEvent } from "./sentry";

const sentryMocks = vi.hoisted(() => {
  type MockScope = { setTags: ReturnType<typeof vi.fn> };
  const captureException = vi.fn(() => "event-123");
  const scope = { setTags: vi.fn() };
  const withScope = vi.fn((callback: (scope: MockScope) => void) =>
    callback(scope),
  );
  return { captureException, scope, withScope };
});

vi.mock("@sentry/cloudflare", () => ({
  captureException: sentryMocks.captureException,
  withScope: sentryMocks.withScope,
}));

describe("marketing-api Sentry helper", () => {
  it("scrubs sensitive request data", () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {
          Cookie: "session=secret",
          Referer:
            "https://kaiplan.app/payments/payment-token-value-123?t=survey-secret",
          "X-Trace": "trace",
        },
        url: "https://kaiplan.app/api/signup?surveyToken=secret&t=survey-secret&ok=1",
      },
    });

    expect(event.request?.headers?.Cookie).toBe("[Filtered]");
    expect(event.request?.headers?.Referer).toContain("/payments/[Filtered]");
    expect(event.request?.headers?.Referer).toContain("t=%5BFiltered%5D");
    expect(event.request?.headers?.Referer).not.toContain("survey-secret");
    expect(event.request?.headers?.["X-Trace"]).toBe("trace");
    expect(event.request?.url).toContain("surveyToken=%5BFiltered%5D");
    expect(event.request?.url).toContain("t=%5BFiltered%5D");
    expect(event.request?.url).not.toContain("survey-secret");
  });

  it("scrubs sensitive path segments from request URLs", () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {},
        url: "https://kaiplan.app/api/payments/payment-token-value-123?ok=1",
      },
    });

    expect(event.request?.url).toContain("/api/payments/[Filtered]");
    expect(event.request?.url).not.toContain("payment-token-value-123");
  });

  it("scrubs referral codes from request URLs and URL-valued headers", () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {
          Referer: "https://kaiplan.app/api/referral/ABC12345",
        },
        url: "https://kaiplan.app/api/referral/ABC12345?ref=ABC12345&ok=1",
      },
    });

    expect(event.request?.headers?.Referer).toContain(
      "/api/referral/[Filtered]",
    );
    expect(event.request?.headers?.Referer).not.toContain("ABC12345");
    expect(event.request?.url).toContain("/api/referral/[Filtered]");
    expect(event.request?.url).toContain("ref=%5BFiltered%5D");
    expect(event.request?.url).not.toContain("ABC12345");
  });

  it("scrubs sensitive values from malformed URLs", () => {
    const event = scrubSentryEvent({
      type: undefined,
      request: {
        headers: {
          Referer: "http://[bad]/invite/invite-token-value-123?token=secret",
        },
        url: "http://[bad]/payments/payment-token-value-123?inviteCode=secret&rsvpToken=token&t=survey-secret&ok=1",
      },
    });

    expect(event.request?.headers?.Referer).toContain("/invite/[Filtered]");
    expect(event.request?.headers?.Referer).not.toContain(
      "invite-token-value-123",
    );
    expect(event.request?.url).toContain("/payments/[Filtered]");
    expect(event.request?.url).not.toContain("payment-token-value-123");
    expect(event.request?.url).toContain("inviteCode=[Filtered]");
    expect(event.request?.url).toContain("rsvpToken=[Filtered]");
    expect(event.request?.url).toContain("t=[Filtered]");
    expect(event.request?.url).not.toContain("survey-secret");
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

  it("captures exceptions with tags and returns the Sentry event id", () => {
    const error = new Error("boom");

    const eventId = captureMarketingApiException(error, { source: "test" });

    expect(sentryMocks.scope.setTags).toHaveBeenCalledWith({ source: "test" });
    expect(sentryMocks.captureException).toHaveBeenCalledWith(error);
    expect(eventId).toBe("event-123");
  });
});
