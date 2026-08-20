import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { captureServerEvent } from "./analytics";

const captureMarketingApiExceptionMock = vi.hoisted(() => vi.fn());

vi.mock("./sentry", () => ({
  captureMarketingApiException: (
    error: unknown,
    tags?: Record<string, string>,
  ) => captureMarketingApiExceptionMock(error, tags),
}));

describe("captureServerEvent", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    captureMarketingApiExceptionMock.mockClear();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("is a no-op when apiKey is undefined", async () => {
    await captureServerEvent({
      apiKey: undefined,
      distinctId: "user-1",
      event: "lead_magnet_pdf_downloaded",
      properties: { slug: "budget-template" },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("is a no-op when apiKey is an empty string", async () => {
    await captureServerEvent({
      apiKey: "",
      distinctId: "user-1",
      event: "lead_magnet_pdf_downloaded",
      properties: { slug: "budget-template" },
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("posts a capture payload to PostHog when apiKey is set", async () => {
    await captureServerEvent({
      apiKey: "phc_test",
      distinctId: "hash-abc",
      event: "lead_magnet_pdf_downloaded",
      properties: { slug: "budget-template", downloadCount: 2, expired: false },
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    if (!call) throw new Error("fetch was not called");
    expect(call[0]).toBe("https://us.i.posthog.com/capture/");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body as string) as {
      api_key: string;
      distinct_id: string;
      event: string;
      properties: Record<string, unknown>;
    };
    expect(body.api_key).toBe("phc_test");
    expect(body.distinct_id).toBe("hash-abc");
    expect(body.event).toBe("lead_magnet_pdf_downloaded");
    expect(body.properties).toEqual({
      slug: "budget-template",
      downloadCount: 2,
      expired: false,
    });
  });

  it("swallows fetch errors so callers can fire-and-forget", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      captureServerEvent({
        apiKey: "phc_test",
        distinctId: "hash-abc",
        event: "lead_magnet_pdf_downloaded",
        properties: {},
      }),
    ).resolves.toBeUndefined();
  });

  it("logs non-2xx PostHog responses as capture failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("bad token", { status: 401 }));

    await expect(
      captureServerEvent({
        apiKey: "phc_test",
        distinctId: "hash-abc",
        event: "lead_magnet_pdf_downloaded",
        properties: {},
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[analytics] captureServerEvent failed",
      expect.objectContaining({
        message: expect.stringContaining("PostHog capture failed: 401"),
      }),
    );
    expect(captureMarketingApiExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("PostHog capture failed: 401"),
      }),
      { source: "posthog-capture" },
    );
  });

  it("logs non-2xx PostHog responses without a response body", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("", { status: 500, statusText: "Server Error" }),
      );

    await expect(
      captureServerEvent({
        apiKey: "phc_test",
        distinctId: "hash-abc",
        event: "lead_magnet_pdf_downloaded",
        properties: {},
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[analytics] captureServerEvent failed",
      expect.objectContaining({
        message: "PostHog capture failed: 500 Server Error",
      }),
    );
    expect(captureMarketingApiExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "PostHog capture failed: 500 Server Error",
      }),
      { source: "posthog-capture" },
    );
  });

  it("logs non-2xx PostHog responses when the body cannot be read", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: () => Promise.reject(new Error("body unavailable")),
    } satisfies Pick<Response, "ok" | "status" | "statusText" | "text">);

    await expect(
      captureServerEvent({
        apiKey: "phc_test",
        distinctId: "hash-abc",
        event: "lead_magnet_pdf_downloaded",
        properties: {},
      }),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith(
      "[analytics] captureServerEvent failed",
      expect.objectContaining({
        message: "PostHog capture failed: 502 Bad Gateway",
      }),
    );
    expect(captureMarketingApiExceptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "PostHog capture failed: 502 Bad Gateway",
      }),
      { source: "posthog-capture" },
    );
  });
});
