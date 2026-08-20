import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const embeddedFetchMock = vi.fn(() => new Response("embedded-ok"));
  const createApiMock = vi.fn(() => ({
    fetch: embeddedFetchMock,
  }));
  const resolveMarketingApiBaseUrlMock = vi.fn(() => "http://127.0.0.1:8788");
  const proxyMarketingApiRequestMock = vi.fn(async () => {
    return new Response("local-ok", { status: 201 });
  });
  const hasConfiguredPublicMarketingApiUrlMock = vi.fn(() => false);
  const localFetchMock = vi.fn(
    () =>
      new Response("local-embedded-ok", {
        status: 201,
      }),
  );
  const getLocalMarketingApiRuntimeMock = vi.fn(async () => ({
    api: {
      fetch: localFetchMock,
    },
    env: { LOCAL: true },
  }));

  return {
    embeddedFetchMock,
    createApiMock,
    resolveMarketingApiBaseUrlMock,
    proxyMarketingApiRequestMock,
    hasConfiguredPublicMarketingApiUrlMock,
    localFetchMock,
    getLocalMarketingApiRuntimeMock,
  };
});

vi.mock("@kaiplan/marketing-api", () => ({
  createApi: mocks.createApiMock,
}));

vi.mock("../../lib/marketing-api-url", () => ({
  hasConfiguredPublicMarketingApiUrl:
    mocks.hasConfiguredPublicMarketingApiUrlMock,
  resolveMarketingApiBaseUrl: mocks.resolveMarketingApiBaseUrlMock,
  proxyMarketingApiRequest: mocks.proxyMarketingApiRequestMock,
}));

vi.mock("../../lib/local-marketing-api", () => ({
  getLocalMarketingApiRuntime: mocks.getLocalMarketingApiRuntimeMock,
}));

import { ALL } from "./[...route]";

function expectApiRobotsHeader(response: Response) {
  expect(response.headers.get("X-Robots-Tag")).toBe(
    "noindex, nofollow, noarchive",
  );
}

describe("api route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("normalizes trailing slashes without reusing a cached embedded api instance", async () => {
    const runtime = {
      env: { DB: {} },
      ctx: {},
    };

    const firstResponse = await ALL({
      request: new Request("https://kaiplan.app/api/signup/"),
      locals: { runtime },
    } as never);
    const secondResponse = await ALL({
      request: new Request("https://kaiplan.app/api/signup"),
      locals: { runtime },
    } as never);

    expectApiRobotsHeader(firstResponse);
    expectApiRobotsHeader(secondResponse);

    expect(mocks.createApiMock).toHaveBeenCalledTimes(2);
    expect(mocks.embeddedFetchMock).toHaveBeenCalledTimes(2);

    const firstCall = mocks.embeddedFetchMock.mock.calls.at(0) as
      | [Request]
      | undefined;
    const secondCall = mocks.embeddedFetchMock.mock.calls.at(1) as
      | [Request]
      | undefined;

    expect(firstCall?.[0].url).toBe("https://kaiplan.app/api/signup");
    expect(secondCall?.[0].url).toBe("https://kaiplan.app/api/signup");
  });

  it("serves local requests with the in-process marketing api when runtime bindings are absent", async () => {
    const response = await ALL({
      request: new Request("http://localhost:4321/api/signup/"),
      locals: {},
    } as never);

    expect(response.status).toBe(201);
    expectApiRobotsHeader(response);
    expect(await response.text()).toBe("local-embedded-ok");
    expect(mocks.getLocalMarketingApiRuntimeMock).toHaveBeenCalledWith(
      "http://localhost:4321/api/signup/",
    );
    expect(mocks.createApiMock).not.toHaveBeenCalled();
    expect(mocks.resolveMarketingApiBaseUrlMock).not.toHaveBeenCalled();
    expect(mocks.proxyMarketingApiRequestMock).not.toHaveBeenCalled();
    const localCall = mocks.localFetchMock.mock.calls.at(0) as
      | [Request, unknown]
      | undefined;
    expect(localCall?.[0].url).toBe("http://localhost:4321/api/signup");
    expect(localCall?.[1]).toEqual({ LOCAL: true });
  });

  it("serves 127.0.0.1 requests without runtime bindings in process", async () => {
    const response = await ALL({
      request: new Request("http://127.0.0.1:4321/api/feedback"),
      locals: {},
    } as never);

    expectApiRobotsHeader(response);
    const localCall = mocks.localFetchMock.mock.calls.at(-1) as
      | [Request, unknown]
      | undefined;
    expect(localCall?.[0].url).toBe("http://127.0.0.1:4321/api/feedback");
    expect(mocks.proxyMarketingApiRequestMock).not.toHaveBeenCalled();
  });

  it("falls back to the in-process local API when legacy runtime env is empty", async () => {
    const response = await ALL({
      request: new Request("http://localhost:4321/api/feedback"),
      locals: { runtime: { env: {} } },
    } as never);

    expect(response.status).toBe(201);
    expectApiRobotsHeader(response);
    expect(mocks.createApiMock).not.toHaveBeenCalled();
    expect(mocks.getLocalMarketingApiRuntimeMock).toHaveBeenCalledWith(
      "http://localhost:4321/api/feedback",
    );
    const localCall = mocks.localFetchMock.mock.calls.at(-1) as
      | [Request, unknown]
      | undefined;
    expect(localCall?.[0].url).toBe("http://localhost:4321/api/feedback");
  });

  it("falls back to the in-process local API when locals.runtime is present but missing env", async () => {
    const response = await ALL({
      request: new Request("http://localhost:4321/api/signup"),
      locals: { runtime: {} },
    } as never);

    expectApiRobotsHeader(response);
    const localCall = mocks.localFetchMock.mock.calls.at(-1) as
      | [Request, unknown]
      | undefined;
    expect(localCall?.[0].url).toBe("http://localhost:4321/api/signup");
    expect(mocks.proxyMarketingApiRequestMock).not.toHaveBeenCalled();
  });

  it("supports legacy locals.runtime.env bindings without a ctx property", async () => {
    const response = await ALL({
      request: new Request("https://kaiplan.app/api/feedback"),
      locals: { runtime: { env: { DB: {} } } },
    } as never);

    expectApiRobotsHeader(response);
    expect(mocks.createApiMock).toHaveBeenCalledTimes(1);
    const fetchCall = mocks.embeddedFetchMock.mock.calls.at(-1) as
      | [Request, unknown, unknown]
      | undefined;
    expect(fetchCall?.[2]).toBeUndefined();
  });

  it("loads runtime bindings from the cloudflare:workers module when locals.runtime is missing", async () => {
    vi.resetModules();
    vi.doMock("../../lib/cloudflare-workers-env", () => ({
      readCloudflareWorkersEnv: async () => ({
        DB: { query: () => null },
        PUBLIC_API_URL: "https://api",
      }),
    }));
    const { ALL: runtimeRoute } = await import("./[...route]");
    const ctx = Symbol("exec-ctx");

    const response = await runtimeRoute({
      request: new Request("https://kaiplan.app/api/signup/"),
      locals: { runtime: { ctx } },
    } as never);

    expect(await response.text()).toBe("embedded-ok");
    expectApiRobotsHeader(response);
    expect(mocks.createApiMock).toHaveBeenCalledTimes(1);
    const fetchCall = mocks.embeddedFetchMock.mock.calls.at(0) as
      | [Request, unknown, unknown]
      | undefined;
    expect(fetchCall?.[0].url).toBe("https://kaiplan.app/api/signup");
    expect(fetchCall?.[2]).toBe(ctx);
    vi.doUnmock("../../lib/cloudflare-workers-env");
  });

  it("prefers an explicitly configured standalone marketing API over runtime bindings", async () => {
    vi.resetModules();
    vi.stubEnv("PUBLIC_MARKETING_API_URL", "http://127.0.0.1:8788");
    mocks.hasConfiguredPublicMarketingApiUrlMock.mockReturnValueOnce(true);
    vi.doMock("../../lib/cloudflare-workers-env", () => ({
      readCloudflareWorkersEnv: async () => ({
        DB: { query: () => null },
      }),
    }));
    const { ALL: configuredProxyRoute } = await import("./[...route]");

    const response = await configuredProxyRoute({
      request: new Request("http://127.0.0.1:4321/api/health/"),
      locals: {},
    } as never);

    expect(response.status).toBe(201);
    expectApiRobotsHeader(response);
    expect(mocks.createApiMock).not.toHaveBeenCalled();
    expect(mocks.proxyMarketingApiRequestMock).toHaveBeenCalledTimes(1);
    const proxiedCall = mocks.proxyMarketingApiRequestMock.mock.calls.at(0) as
      | [Request, string]
      | undefined;
    expect(proxiedCall?.[0].url).toBe("http://127.0.0.1:4321/api/health");
    expect(proxiedCall?.[1]).toBe("http://127.0.0.1:8788");
    vi.doUnmock("../../lib/cloudflare-workers-env");
  });

  it("uses the standalone marketing API URL from runtime bindings when present", async () => {
    vi.resetModules();
    mocks.hasConfiguredPublicMarketingApiUrlMock.mockImplementationOnce(
      (configuredUrl?: string) => configuredUrl === "http://127.0.0.1:29088",
    );
    vi.doMock("../../lib/cloudflare-workers-env", () => ({
      readCloudflareWorkersEnv: async () => ({
        DB: { query: () => null },
        PUBLIC_MARKETING_API_URL: "http://127.0.0.1:29088",
      }),
    }));
    const { ALL: runtimeConfiguredProxyRoute } = await import("./[...route]");

    const response = await runtimeConfiguredProxyRoute({
      request: new Request("http://127.0.0.1:4321/api/health/"),
      locals: {},
    } as never);

    expect(response.status).toBe(201);
    expect(mocks.createApiMock).not.toHaveBeenCalled();
    expect(mocks.resolveMarketingApiBaseUrlMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4321/api/health/",
      "http://127.0.0.1:29088",
    );
    vi.doUnmock("../../lib/cloudflare-workers-env");
  });

  it("uses cloudflare:workers env even when locals has no runtime property", async () => {
    vi.resetModules();
    const ctx = { waitUntil: vi.fn() };
    vi.doMock("cloudflare:workers", () => ({
      ctx,
      env: { DB: {}, PUBLIC_API_URL: "https://api" },
    }));
    const { ALL: runtimeRoute } = await import("./[...route]");

    const response = await runtimeRoute({
      request: new Request("https://kaiplan.app/api/signup"),
      locals: {},
    } as never);

    expect(await response.text()).toBe("embedded-ok");
    expectApiRobotsHeader(response);
    const fetchCall = mocks.embeddedFetchMock.mock.calls.at(-1) as
      | [Request, unknown, unknown]
      | undefined;
    expect(fetchCall?.[2]).toBe(ctx);
    vi.doUnmock("cloudflare:workers");
  });

  it("uses cloudflare:workers env when legacy runtime env is empty", async () => {
    vi.resetModules();
    vi.doMock("../../lib/cloudflare-workers-env", () => ({
      readCloudflareWorkersEnv: async () => ({
        DB: { query: () => null },
        PUBLIC_API_URL: "https://api",
      }),
    }));
    const { ALL: runtimeRoute } = await import("./[...route]");

    const response = await runtimeRoute({
      request: new Request("https://kaiplan.app/api/signup"),
      locals: { runtime: { env: {} } },
    } as never);

    expect(await response.text()).toBe("embedded-ok");
    expectApiRobotsHeader(response);
    expect(mocks.createApiMock).toHaveBeenCalledTimes(1);
    vi.doUnmock("../../lib/cloudflare-workers-env");
  });

  it("ignores an empty cloudflare:workers env and falls through to local in-process mode", async () => {
    vi.resetModules();
    vi.doMock("../../lib/cloudflare-workers-env", () => ({
      readCloudflareWorkersEnv: async () => ({}),
    }));
    const { ALL: emptyEnvRoute } = await import("./[...route]");

    const response = await emptyEnvRoute({
      request: new Request("http://localhost:4321/api/feedback"),
      locals: {},
    } as never);

    expectApiRobotsHeader(response);
    expect(mocks.createApiMock).not.toHaveBeenCalled();
    expect(mocks.getLocalMarketingApiRuntimeMock).toHaveBeenCalledWith(
      "http://localhost:4321/api/feedback",
    );
    expect(mocks.proxyMarketingApiRequestMock).not.toHaveBeenCalled();
    vi.doUnmock("../../lib/cloudflare-workers-env");
  });

  it("returns a controlled error for production requests when runtime bindings are unavailable and no standalone api is configured", async () => {
    vi.doUnmock("../../lib/cloudflare-workers-env");
    vi.doUnmock("cloudflare:workers");
    vi.resetModules();
    vi.stubEnv("PROD", true);
    vi.stubEnv("PUBLIC_MARKETING_API_URL", "");
    const { ALL: productionRoute } = await import("./[...route]");

    const response = await productionRoute({
      request: new Request("https://kaiplan.app/api/signup"),
      locals: {},
    } as never);

    expect(response.status).toBe(503);
    expectApiRobotsHeader(response);
    await expect(response.json()).resolves.toMatchObject({
      error: "Marketing API runtime bindings are unavailable.",
    });
    expect(mocks.proxyMarketingApiRequestMock).not.toHaveBeenCalled();
    expect(mocks.resolveMarketingApiBaseUrlMock).not.toHaveBeenCalled();
  });
});
