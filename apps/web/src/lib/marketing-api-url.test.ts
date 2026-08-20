import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCAL_MARKETING_API_PORT,
  buildMarketingApiProxyRequest,
  hasConfiguredPublicMarketingApiUrl,
  proxyMarketingApiRequest,
} from "./marketing-api-url";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveMarketingApiBaseUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses the configured public marketing api url when provided", async () => {
    vi.stubEnv("PUBLIC_MARKETING_API_URL", "http://127.0.0.1:9999/");

    const { resolveMarketingApiBaseUrl } = await import("./marketing-api-url");

    expect(resolveMarketingApiBaseUrl("http://localhost:4321/api/signup")).toBe(
      "http://127.0.0.1:9999",
    );
  });

  it("uses an explicit runtime configured URL before build-time env", async () => {
    vi.stubEnv("PUBLIC_MARKETING_API_URL", "http://127.0.0.1:9999/");

    const { resolveMarketingApiBaseUrl } = await import("./marketing-api-url");

    expect(
      resolveMarketingApiBaseUrl(
        "http://localhost:4321/api/signup",
        "http://127.0.0.1:7777/",
      ),
    ).toBe("http://127.0.0.1:7777");
  });

  it("falls back to the local marketing api port on localhost", async () => {
    vi.stubEnv("PUBLIC_MARKETING_API_URL", "");

    const { resolveMarketingApiBaseUrl } = await import("./marketing-api-url");

    expect(resolveMarketingApiBaseUrl("http://localhost:4321/api/signup")).toBe(
      `http://localhost:${DEFAULT_LOCAL_MARKETING_API_PORT}`,
    );
  });

  it("falls back to the local marketing api port on 127.0.0.1", async () => {
    vi.stubEnv("PUBLIC_MARKETING_API_URL", "");

    const { resolveMarketingApiBaseUrl } = await import("./marketing-api-url");

    expect(
      resolveMarketingApiBaseUrl("http://127.0.0.1:4321/api/feedback"),
    ).toBe(`http://127.0.0.1:${DEFAULT_LOCAL_MARKETING_API_PORT}`);
  });

  it("derives the fallback base url from non-local request hosts too", async () => {
    vi.stubEnv("PUBLIC_MARKETING_API_URL", "");

    const { resolveMarketingApiBaseUrl } = await import("./marketing-api-url");

    expect(
      resolveMarketingApiBaseUrl("https://preview.kaiplan.app/api/signup"),
    ).toBe(`https://preview.kaiplan.app:${DEFAULT_LOCAL_MARKETING_API_PORT}`);
  });
});

describe("hasConfiguredPublicMarketingApiUrl", () => {
  it("reflects explicit runtime configured URLs", () => {
    expect(hasConfiguredPublicMarketingApiUrl("http://127.0.0.1:8788")).toBe(
      true,
    );
    expect(hasConfiguredPublicMarketingApiUrl("   ")).toBe(false);
  });
});

describe("buildMarketingApiProxyRequest", () => {
  it("normalizes trailing slashes without changing the request payload", async () => {
    const request = new Request(
      "https://kaiplan.app/api/signup/?utm_source=test",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Trace-Id": "abc123",
        },
        body: JSON.stringify({
          email: "test@example.com",
          sourcePage: "/",
        }),
      },
    );

    const proxied = buildMarketingApiProxyRequest(
      request,
      "http://localhost:8788",
    );

    expect(proxied.url).toBe(
      "http://localhost:8788/api/signup?utm_source=test",
    );
    expect(proxied.method).toBe("POST");
    expect(proxied.headers.get("content-type")).toBe("application/json");
    expect(proxied.headers.get("x-trace-id")).toBe("abc123");
    expect(await proxied.text()).toContain("test@example.com");
  });

  it("leaves already-normalized request paths unchanged", () => {
    const proxied = buildMarketingApiProxyRequest(
      new Request("http://localhost:4321/api/feedback?source=smoke"),
      "http://localhost:8788/",
    );

    expect(proxied.url).toBe("http://localhost:8788/api/feedback?source=smoke");
  });
});

describe("proxyMarketingApiRequest", () => {
  it("proxies requests through fetch using the normalized standalone base", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("proxied", { status: 201 }));

    const response = await proxyMarketingApiRequest(
      new Request("http://localhost:4321/api/feedback/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "idea",
          message: "Local proxy smoke test",
          pageUrl: "http://localhost:4321/",
        }),
      }),
      "http://localhost:8788",
    );

    expect(response.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const proxiedRequest = fetchSpy.mock.calls[0]?.[0] as Request | undefined;
    expect(proxiedRequest?.url).toBe("http://localhost:8788/api/feedback");
    expect(proxiedRequest?.method).toBe("POST");
  });
});
