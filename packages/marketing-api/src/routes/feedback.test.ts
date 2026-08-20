import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { feedbackRoute } from "./feedback";
import { createApi } from "../app";
import type { ApiEnv, DrizzleD1Database } from "../app";

// Mock the email service
vi.mock("../services/email", () => ({
  sendFeedbackNotification: vi.fn().mockResolvedValue(undefined),
}));

import { sendFeedbackNotification } from "../services/email";
import { identifierBuckets } from "../middleware/rate-limit";
import { HONEYPOT_FIELD, TURNSTILE_FIELD } from "../lib/public-form-protection";

const mockInsert = vi.fn().mockReturnValue({
  values: vi.fn().mockResolvedValue(undefined),
});

function buildApp(
  dbOverrides?: Partial<DrizzleD1Database>,
  envOverrides?: Partial<ApiEnv>,
) {
  const db = {
    insert: mockInsert,
    ...dbOverrides,
  } as unknown as DrizzleD1Database;

  const env: Partial<ApiEnv> = {
    PRODUCT_NAME: "TestProduct",
    EMAIL_FROM: "test@example.com",
    RESEND_API_KEY: "re_test_key",
    ENVIRONMENT: "test",
    ...envOverrides,
  };

  const app = new Hono();
  app.use("*", async (c, next) => {
    (c as unknown as { set: (key: string, val: unknown) => void }).set(
      "db",
      db,
    );
    if (!c.env) (c as unknown as { env: Partial<ApiEnv> }).env = {};
    Object.assign(c.env as object, env);
    await next();
  });
  app.route("/", feedbackRoute());
  return app;
}

function buildCorsApp(envOverrides?: Partial<ApiEnv>) {
  return createApi({
    DB: {} as D1Database,
    PRODUCT_NAME: "TestProduct",
    PRODUCT_DOMAIN: "test.app",
    PRODUCT_LOGO_URL: "https://test.app/logo.png",
    PRODUCT_BRAND_COLOR: "#0066FF",
    PRODUCT_ACCENT_COLOR: "#f59e0b",
    CALENDAR_URL: "https://cal.com/test",
    EMAIL_FROM: "test@example.com",
    ALLOWED_ORIGIN: "https://test.app",
    ENVIRONMENT: "test",
    RESEND_API_KEY: "re_test_key",
    _db: {
      insert: mockInsert,
    } as unknown as ApiEnv["_db"],
    ...envOverrides,
  });
}

const validBody = {
  category: "bug",
  message: "The page is broken",
  pageUrl: "https://crewroute.com/pricing",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  identifierBuckets.clear();
  mockInsert.mockReturnValue({
    values: vi.fn().mockResolvedValue(undefined),
  });
});

describe("POST /api/feedback", () => {
  it("returns 201 with valid body", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns 201 with optional email", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, email: "visitor@test.com" }),
    });
    expect(res.status).toBe(201);
  });

  it("inserts correct values into DB", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const app = buildApp();
    await app.request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "TestBrowser/1.0",
      },
      body: JSON.stringify({ ...validBody, email: "v@test.com" }),
    });
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "bug",
        message: "The page is broken",
        email: "v@test.com",
        pageUrl: "https://crewroute.com/pricing",
        userAgent: "TestBrowser/1.0",
      }),
    );
  });

  it("calls sendFeedbackNotification", async () => {
    const app = buildApp();
    await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(sendFeedbackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        productName: "TestProduct",
        category: "bug",
        message: "The page is broken",
        pageUrl: "https://crewroute.com/pricing",
        emailFrom: "test@example.com",
        resendApiKey: "re_test_key",
      }),
    );
  });

  it("does not enable e2e email mode in production when E2E_MODE is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true }), { status: 200 }),
        ),
    );
    const app = buildApp(undefined, {
      E2E_MODE: "true",
      ENVIRONMENT: "production",
      TURNSTILE_SECRET_KEY: "test-turnstile-secret",
    });

    await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody,
        turnstileToken: "valid-token",
      }),
    });

    expect(sendFeedbackNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        e2eMode: false,
      }),
    );
  });

  it("email failure does not break response", async () => {
    (
      sendFeedbackNotification as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("email failed"));
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
  });

  it("does not block an embedded response on slow notification when waitUntil is unavailable", async () => {
    let resolveNotification: (() => void) | undefined;
    (
      sendFeedbackNotification as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveNotification = resolve;
        }),
    );
    const app = buildApp();

    const responseOrTimeout = await Promise.race([
      app.fetch(
        new Request("https://test.app/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validBody),
        }),
        {},
        {} as ExecutionContext,
      ),
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 100),
      ),
    ]);

    expect(responseOrTimeout).not.toBe("timeout");
    expect((responseOrTimeout as Response).status).toBe(201);
    expect(sendFeedbackNotification).toHaveBeenCalledOnce();
    resolveNotification?.();
  });

  it("returns 400 for missing category", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test", pageUrl: "https://test.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid category", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, category: "invalid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing message", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "bug", pageUrl: "https://test.com" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty message", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, message: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for whitespace-only message", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, message: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("trims message, email, and pageUrl before persistence", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const app = buildApp();

    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody,
        message: "  The page is broken  ",
        email: "  visitor@test.com  ",
        pageUrl: "  https://crewroute.com/pricing  ",
      }),
    });

    expect(res.status).toBe(201);
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "The page is broken",
        email: "visitor@test.com",
        pageUrl: "https://crewroute.com/pricing",
      }),
    );
  });

  it("normalizes blank optional email to null", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const app = buildApp();

    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, email: "   " }),
    });

    expect(res.status).toBe(201);
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: null }),
    );
  });

  it("returns 400 for message exceeding 2000 chars", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, message: "x".repeat(2001) }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email format", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, email: "not-email" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid pageUrl", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, pageUrl: "not-a-url" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON", async () => {
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects scalar JSON before Turnstile verification or DB writes", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true }));
    const app = buildApp(undefined, { TURNSTILE_SECRET_KEY: "sk" });

    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify("not-an-object"),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid request body",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(valuesSpy).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
  });

  it("validates object bodies before Turnstile verification", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: false }));
    const app = buildApp(undefined, { TURNSTILE_SECRET_KEY: "sk" });

    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [TURNSTILE_FIELD]: "bad-token" }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid request body",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(valuesSpy).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
  });

  it("returns 500 when DB insert throws", async () => {
    mockInsert.mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error("D1 error")),
    });
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(500);
  });

  it("accepts all three valid categories", async () => {
    const app = buildApp();
    for (const category of ["bug", "idea", "other"]) {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validBody, category }),
      });
      expect(res.status).toBe(201);
    }
  });

  it("honeypot tripped returns 201 ok-shaped with no DB write or email", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const app = buildApp();
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, [HONEYPOT_FIELD]: "bot.com" }),
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    expect(valuesSpy).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
  });

  it("keeps honeypot short-circuit before schema and Turnstile validation", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: false }));
    const app = buildApp(undefined, { TURNSTILE_SECRET_KEY: "sk" });

    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [HONEYPOT_FIELD]: "bot.com" }),
    });

    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(valuesSpy).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
  });

  it("rejects with 403 when turnstile enforced and token missing", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const app = buildApp(undefined, { TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Verification failed.");
    expect(valuesSpy).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
  });

  it("preserves CORS headers on turnstile rejection", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const app = buildCorsApp({ TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://test.app",
      },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://test.app",
    );
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(valuesSpy).not.toHaveBeenCalled();
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
  });

  it("rejects with 403 when turnstile token is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: false }),
    );
    const app = buildApp(undefined, { TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, [TURNSTILE_FIELD]: "bad" }),
    });
    expect(res.status).toBe(403);
  });

  it("succeeds with valid turnstile token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true }),
    );
    const app = buildApp(undefined, { TURNSTILE_SECRET_KEY: "sk" });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, [TURNSTILE_FIELD]: "good" }),
    });
    expect(res.status).toBe(201);
    expect(sendFeedbackNotification).toHaveBeenCalledTimes(1);
  });

  it("returns 429 after exceeding the per-email throttle", async () => {
    const app = buildApp();
    const body = JSON.stringify({ ...validBody, email: "spammer@test.com" });
    for (let i = 0; i < 3; i++) {
      const ok = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(ok.status).toBe(201);
    }
    const blocked = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(blocked.status).toBe(429);
    const json = (await blocked.json()) as { error: string };
    expect(json.error).toBe("Too many requests");
  });

  it("preserves CORS headers on per-email throttling", async () => {
    const app = buildCorsApp();
    const body = JSON.stringify({ ...validBody, email: "cors@test.com" });
    for (let i = 0; i < 3; i++) {
      const ok = await app.request("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://test.app",
        },
        body,
      });
      expect(ok.status).toBe(201);
    }

    (sendFeedbackNotification as ReturnType<typeof vi.fn>).mockClear();

    const blocked = await app.request("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://test.app",
      },
      body,
    });

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://test.app",
    );
    expect(blocked.headers.get("Vary")).toBe("Origin");
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
  });

  it("throttles emailless feedback by client IP and skips the notification when blocked", async () => {
    const app = buildApp();
    const ip = "203.0.113.7";
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": ip,
        },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(201);
    }

    (sendFeedbackNotification as ReturnType<typeof vi.fn>).mockClear();

    const blocked = await app.request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": ip,
      },
      body: JSON.stringify(validBody),
    });
    expect(blocked.status).toBe(429);
    const json = (await blocked.json()) as { error: string };
    expect(json.error).toBe("Too many requests");
    expect(sendFeedbackNotification).not.toHaveBeenCalled();
  });

  it("isolates emailless feedback throttle per client IP", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      await app.request("/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "198.51.100.1",
        },
        body: JSON.stringify(validBody),
      });
    }
    const otherIp = await app.request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "198.51.100.2",
      },
      body: JSON.stringify(validBody),
    });
    expect(otherIp.status).toBe(201);
  });

  it("falls back to a shared anon identity when no IP header is present", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      });
      expect(res.status).toBe(201);
    }
    const blocked = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(blocked.status).toBe(429);
  });

  it("stores null email when not provided", async () => {
    const valuesSpy = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesSpy });
    const app = buildApp();
    await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(valuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: null }),
    );
  });
});
