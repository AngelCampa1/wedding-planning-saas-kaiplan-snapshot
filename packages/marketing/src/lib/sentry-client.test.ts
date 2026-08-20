import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DSN = "https://public@example.ingest.sentry.io/1";

vi.mock("@sentry/browser", () => ({
  captureException: vi.fn(),
  init: vi.fn(),
}));

import * as Sentry from "@sentry/browser";

async function importClient(dsn = TEST_DSN) {
  vi.resetModules();
  vi.stubEnv("MODE", "production");
  vi.stubEnv("PROD", true);
  vi.stubEnv("PUBLIC_SENTRY_DSN", dsn);
  vi.stubEnv("PUBLIC_SENTRY_RELEASE", "release-123");
  return import("./sentry-client");
}

async function initAndGetOptions() {
  const { initSentry } = await importClient();
  initSentry("crewroute");
  return (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<
    string,
    unknown
  >;
}

describe("sentry-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("SENTRY_DSN", () => {
    it("reads from PUBLIC_SENTRY_DSN", async () => {
      const { SENTRY_DSN } = await importClient();

      expect(SENTRY_DSN).toBe(TEST_DSN);
    });
  });

  describe("initSentry", () => {
    it("does not initialize Sentry outside production", async () => {
      const { initSentry } = await importClient();
      vi.stubEnv("MODE", "development");
      vi.stubEnv("PROD", false);

      initSentry("crewroute");

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("does not initialize Sentry when the DSN is missing", async () => {
      const { initSentry } = await importClient("");

      initSentry("crewroute");

      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("calls Sentry.init with the correct DSN", async () => {
      const { SENTRY_DSN, initSentry } = await importClient();

      initSentry("crewroute");

      expect(Sentry.init).toHaveBeenCalledOnce();
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({ dsn: SENTRY_DSN }),
      );
    });

    it("does not set tracesSampleRate", async () => {
      const call = await initAndGetOptions();

      expect(call).not.toHaveProperty("tracesSampleRate");
    });

    it("sets environment, release, and PII options", async () => {
      const call = await initAndGetOptions();

      expect(call).toEqual(
        expect.objectContaining({
          environment: "production",
          release: "release-123",
          sendDefaultPii: false,
        }),
      );
    });

    it("scrubs sensitive request data before sending browser events", async () => {
      const call = await initAndGetOptions();
      const beforeSend = call.beforeSend as (event: {
        type?: undefined;
        request: { headers: Record<string, string>; url: string };
      }) => unknown;

      const event = beforeSend({
        type: undefined,
        request: {
          headers: {
            Cookie: "session=secret",
            Referer:
              "https://example.com/payments/payment-token-value-123?t=survey-secret",
            "X-Invite-Token": "secret",
            "X-Trace": "trace",
          },
          url: "https://example.com/rsvp?token=secret&t=survey-secret&ok=1",
        },
      }) as { request: { headers: Record<string, string>; url: string } };

      expect(event.request.headers.Cookie).toBe("[Filtered]");
      expect(event.request.headers.Referer).toContain("/payments/[Filtered]");
      expect(event.request.headers.Referer).toContain("t=%5BFiltered%5D");
      expect(event.request.headers.Referer).not.toContain("survey-secret");
      expect(event.request.headers["X-Invite-Token"]).toBe("[Filtered]");
      expect(event.request.headers["X-Trace"]).toBe("trace");
      expect(event.request.url).toContain("token=%5BFiltered%5D");
      expect(event.request.url).toContain("t=%5BFiltered%5D");
      expect(event.request.url).not.toContain("survey-secret");
    });

    it("scrubs sensitive path segments before sending browser events", async () => {
      const call = await initAndGetOptions();
      const beforeSend = call.beforeSend as (event: {
        type?: undefined;
        request: { url: string };
      }) => unknown;

      const event = beforeSend({
        type: undefined,
        request: {
          url: "https://example.com/payments/payment-token-value-123?ok=1",
        },
      }) as { request: { url: string } };

      expect(event.request.url).toContain("/payments/[Filtered]");
      expect(event.request.url).not.toContain("payment-token-value-123");
    });

    it("leaves safe path segments and browser events without headers intact", async () => {
      const call = await initAndGetOptions();
      const beforeSend = call.beforeSend as (event: {
        type?: undefined;
        request: { url: string };
      }) => unknown;

      const event = beforeSend({
        type: undefined,
        request: {
          url: "https://example.com/resources/wedding-rsvp-guide?ok=1",
        },
      }) as { request: { url: string } };

      expect(event.request.url).toContain("/resources/wedding-rsvp-guide");
    });

    it("leaves browser events without request data intact", async () => {
      const call = await initAndGetOptions();
      const beforeSend = call.beforeSend as (event: {
        type?: undefined;
      }) => unknown;
      const event = { type: undefined };

      expect(beforeSend(event)).toBe(event);
    });

    it("scrubs sensitive first path segments", async () => {
      const { scrubSentryPath } = await importClient();

      expect(scrubSentryPath("token/short")).toBe("[Filtered]/short");
    });

    it("scrubs exact sensitive path segments but leaves short values intact", async () => {
      const call = await initAndGetOptions();
      const beforeSend = call.beforeSend as (event: {
        type?: undefined;
        request: { url: string };
      }) => unknown;

      const event = beforeSend({
        type: undefined,
        request: {
          url: "https://example.com/token/short/rsvp/no",
        },
      }) as { request: { url: string } };

      expect(event.request.url).toContain("/[Filtered]/short/rsvp/no");
    });

    it("scrubs sensitive values from malformed browser URLs", async () => {
      const call = await initAndGetOptions();
      const beforeSend = call.beforeSend as (event: {
        type?: undefined;
        request: { headers: Record<string, string>; url: string };
      }) => unknown;

      const event = beforeSend({
        type: undefined,
        request: {
          headers: {
            Referer:
              "http://[bad]/payments/payment-token-value-123?token=secret",
          },
          url: "::::/invite/invite-token-value-123?inviteToken=secret&sessionId=session&t=survey-secret&ok=1",
        },
      }) as { request: { headers: Record<string, string>; url: string } };

      expect(event.request.headers.Referer).toContain("/payments/[Filtered]");
      expect(event.request.headers.Referer).not.toContain(
        "payment-token-value-123",
      );
      expect(event.request.url).toContain("/invite/[Filtered]");
      expect(event.request.url).not.toContain("invite-token-value-123");
      expect(event.request.url).toContain("inviteToken=[Filtered]");
      expect(event.request.url).toContain("sessionId=[Filtered]");
      expect(event.request.url).toContain("t=[Filtered]");
      expect(event.request.url).not.toContain("survey-secret");
    });

    it("scrubs malformed browser URL paths without query strings", async () => {
      const call = await initAndGetOptions();
      const beforeSend = call.beforeSend as (event: {
        type?: undefined;
        request: { headers: Record<string, unknown>; url: string };
      }) => unknown;

      const event = beforeSend({
        type: undefined,
        request: {
          headers: { "X-Retry-Count": 2 },
          url: "http://[bad]/rsvp/rsvp-token-value-123#section",
        },
      }) as { request: { headers: Record<string, unknown>; url: string } };

      expect(event.request.headers["X-Retry-Count"]).toBe(2);
      expect(event.request.url).toBe("http://[bad]/rsvp/[Filtered]#section");
    });

    it("tags the scope with the given site name", async () => {
      const { initSentry } = await importClient();

      initSentry("birvix");

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          initialScope: { tags: { site: "birvix" } },
        }),
      );
    });

    it("passes the site name through to the tag for a different site", async () => {
      const { initSentry } = await importClient();

      initSentry("sweepops");

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          initialScope: { tags: { site: "sweepops" } },
        }),
      );
    });

    it("filters out dynamic import chunk-load failures via ignoreErrors", async () => {
      const call = await initAndGetOptions();
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      const hasChunkPattern = ignoreErrors.some((pattern) => {
        if (pattern instanceof RegExp) {
          return pattern.test(
            "Failed to fetch dynamically imported module: https://kaiplan.app/_astro/widget.js",
          );
        }
        return false;
      });
      expect(hasChunkPattern).toBe(true);
    });

    it("also filters ChunkLoadError and Loading chunk failed patterns", async () => {
      const call = await initAndGetOptions();
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      expect(ignoreErrors.some((pattern) => pattern === "ChunkLoadError")).toBe(
        true,
      );
      expect(
        ignoreErrors.some(
          (pattern) =>
            pattern instanceof RegExp &&
            pattern.test("Loading chunk 123 failed"),
        ),
      ).toBe(true);
    });

    it("filters Safari 'Load failed' TypeError variant", async () => {
      const call = await initAndGetOptions();
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      expect(
        ignoreErrors.some(
          (pattern) => pattern instanceof RegExp && pattern.test("Load failed"),
        ),
      ).toBe(true);
    });

    it("filters stale React runtime mismatch signatures", async () => {
      const call = await initAndGetOptions();
      const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

      expect(
        ignoreErrors.some(
          (pattern) =>
            pattern instanceof RegExp &&
            pattern.test("TypeError: jsxDEV is not a function"),
        ),
      ).toBe(true);
    });
  });

  describe("captureException", () => {
    it("forwards an Error to Sentry.captureException", async () => {
      const { captureException } = await importClient();
      const err = new Error("boom");

      captureException(err);

      expect(Sentry.captureException).toHaveBeenCalledOnce();
      expect(Sentry.captureException).toHaveBeenCalledWith(err);
    });

    it("forwards unknown values to Sentry.captureException", async () => {
      const { captureException } = await importClient();

      captureException("string error");
      captureException(null);
      captureException(undefined);

      expect(Sentry.captureException).toHaveBeenNthCalledWith(
        1,
        "string error",
      );
      expect(Sentry.captureException).toHaveBeenNthCalledWith(2, null);
      expect(Sentry.captureException).toHaveBeenNthCalledWith(3, undefined);
    });
  });
});
