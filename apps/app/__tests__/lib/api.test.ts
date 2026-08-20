import { describe, expect, it, vi, beforeEach } from "vitest";
import { z, ZodError } from "zod";
import { ApiError, apiFetch } from "../../src/lib/api";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined for empty successful responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn().mockRejectedValue(new Error("No body")),
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch("/api/weddings/wedding-1/guests/guest-1", {
        method: "DELETE",
      }),
    ).resolves.toBeUndefined();
  });

  it("surfaces the first field validation message from flattened API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: {
          formErrors: [],
          fieldErrors: {
            slug: ["Slug must use lowercase letters, numbers, and hyphens."],
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch("/api/weddings/wedding-1/website", {
        method: "POST",
      }),
    ).rejects.toMatchObject<ApiError>({
      name: "ApiError",
      status: 400,
      message: "Slug must use lowercase letters, numbers, and hyphens.",
    });
  });

  it("merges caller headers without wiping Content-Type or credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/test", {
      method: "GET",
      headers: { "X-Custom-Header": "custom-value" },
    });

    const [, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(calledInit.credentials).toBe("include");
    expect(calledInit.headers.get("Content-Type")).toBe("application/json");
    expect(calledInit.headers.get("X-Custom-Header")).toBe("custom-value");
  });

  it("merges headers from a Headers-instance caller correctly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    const callerHeaders = new Headers();
    callerHeaders.set("X-Request-Id", "req-abc-123");

    await apiFetch("/api/test", {
      method: "GET",
      headers: callerHeaders,
    });

    const [, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(calledInit.credentials).toBe("include");
    expect(calledInit.headers.get("Content-Type")).toBe("application/json");
    expect(calledInit.headers.get("X-Request-Id")).toBe("req-abc-123");
  });

  it("caller headers cannot wipe Content-Type default", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/test", {
      headers: { Authorization: "Bearer token" },
    });

    const [, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(calledInit.headers.get("Content-Type")).toBe("application/json");
    expect(calledInit.headers.get("Authorization")).toBe("Bearer token");
  });

  it("credentials is always include even when options are passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue("null"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/test", { method: "POST", body: '{"x":1}' });

    const [, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(calledInit.credentials).toBe("include");
  });

  it("throws ApiError with correct status and message on failed request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: "Internal server error" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/fail")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Internal server error",
    });
  });

  it("preserves backend error ids on failed requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({
        error: "Internal server error",
        errorId: "event-abc123",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/fail")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
      message: "Internal server error",
      errorId: "event-abc123",
    });
  });

  it("uses the error id response header when the error body is unreadable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers({ "X-Kaiplan-Error-Id": "event-header-502" }),
      json: vi.fn().mockRejectedValue(new Error("invalid json")),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/fail")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "Request failed",
      errorId: "event-header-502",
    });
  });

  it("falls back to 'Request failed' when error body is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/fail")).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      message: "Request failed",
    });
  });

  it("falls back to 'Request failed' when json() rejects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockRejectedValue(new Error("parse error")),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/fail")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "Request failed",
    });
  });

  it("returns undefined for 205 status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 205,
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/reset")).resolves.toBeUndefined();
  });

  it("returns undefined when response body is whitespace only", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue("   "),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/empty")).resolves.toBeUndefined();
  });

  it("returns raw text for non-JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockResolvedValue("Hello World"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<string>("/api/text")).resolves.toBe("Hello World");
  });

  it("surfaces formErrors from array error shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue({
        error: {
          formErrors: ["Form is invalid"],
          fieldErrors: {},
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/form")).rejects.toMatchObject({
      message: "Form is invalid",
    });
  });

  it("surfaces error from array body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: ["First error", "Second error"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/multi-error")).rejects.toMatchObject({
      message: "First error",
    });
  });

  it("falls back to 'Request failed' when array entries all return 'Request failed'", async () => {
    // An array of nulls — each extractApiErrorMessage(null) returns "Request failed"
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: [null, null],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/null-array-error")).rejects.toMatchObject({
      message: "Request failed",
    });
  });

  it("extracts message from object with message key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({
        error: { message: "Unauthorized" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/auth")).rejects.toMatchObject({
      message: "Unauthorized",
    });
  });

  it("falls back when formErrors all return 'Request failed' and fieldErrors also fails", async () => {
    // formErrors: [null] — extractApiErrorMessage(null) returns "Request failed"
    // fieldErrors: {} — values is [], extractApiErrorMessage([]) returns "Request failed"
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: {
          formErrors: [null],
          fieldErrors: {},
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/zod-fail")).rejects.toMatchObject({
      message: "Request failed",
    });
  });

  it("returns parsed JSON for JSON content-type response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json; charset=utf-8" },
      text: vi.fn().mockResolvedValue('{"id":"abc","name":"Test"}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch<{ id: string; name: string }>("/api/resource"),
    ).resolves.toEqual({ id: "abc", name: "Test" });
  });

  it("uses no options when called without second arg", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "http://localhost:5030");
    const { apiFetch: freshApiFetch } = await import("../../src/lib/api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(freshApiFetch("/api/bare")).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(url).toBe("http://localhost:5030/api/bare");
    expect(init.credentials).toBe("include");
    expect(init.headers.get("Content-Type")).toBe("application/json");
  });

  it("uses same-origin relative URLs when VITE_API_URL is absent", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "");
    const { apiFetch: relativeApiFetch } = await import("../../src/lib/api");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(relativeApiFetch("/api/proxy")).resolves.toBeUndefined();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/proxy");
  });

  it("does not set Content-Type when body is FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["csv data"], { type: "text/csv" }),
      "guests.csv",
    );

    await apiFetch("/api/import", { method: "POST", body: formData });

    const [, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(calledInit.headers.get("Content-Type")).toBeNull();
  });

  it("sets Content-Type application/json when body is a string", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/test", { method: "POST", body: '{"x":1}' });

    const [, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Headers },
    ];
    expect(calledInit.headers.get("Content-Type")).toBe("application/json");
  });

  it("falls back when fieldErrors is a non-object value", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: {
          formErrors: [],
          fieldErrors: "invalid-shape",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/fail")).rejects.toMatchObject({
      message: "Request failed",
    });
  });

  it("handles null content-type header by returning raw text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: vi.fn().mockResolvedValue("plain text"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<string>("/api/plain")).resolves.toBe("plain text");
  });
});

describe("ApiError", () => {
  it("has the correct name and status", () => {
    const err = new ApiError(404, "Not found");
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.message).toBe("Not found");
    expect(err.errorId).toBeUndefined();
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ApiError).toBe(true);
  });

  it("stores optional Sentry error ids", () => {
    const err = new ApiError(500, "Internal server error", "event-abc123");

    expect(err.errorId).toBe("event-abc123");
  });
});

describe("apiFetch with schema validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns validated data when schema matches response", async () => {
    const schema = z.object({ id: z.string(), name: z.string() });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue('{"id":"abc","name":"Test"}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("/api/resource", { schema });
    expect(result).toEqual({ id: "abc", name: "Test" });
  });

  it("throws ZodError when schema rejects malformed response", async () => {
    const schema = z.object({ id: z.string(), name: z.string() });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue('{"id":123,"name":"Test"}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/resource", { schema })).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it("works as before (no validation) when no schema is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: vi.fn().mockResolvedValue('{"id":"abc","name":"Test"}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ id: string; name: string }>(
      "/api/resource",
    );
    expect(result).toEqual({ id: "abc", name: "Test" });
  });

  it("throws an error when schema is provided but response is not JSON", async () => {
    const schema = z.object({ id: z.string() });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "text/plain" },
      text: vi.fn().mockResolvedValue("not json at all"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/api/resource", { schema })).rejects.toThrow(
      "Schema validation requested but response is not JSON (status 200)",
    );
  });
});
