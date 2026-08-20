import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ApiEnv } from "../app";
import {
  HONEYPOT_FIELD,
  TURNSTILE_FIELD,
  isHoneypotTripped,
  shouldEnforceTurnstile,
  verifyTurnstile,
  guardPublicForm,
  __resetTurnstileWarning,
} from "./public-form-protection";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function env(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return {
    DB: {} as D1Database,
    PRODUCT_NAME: "TestProduct",
    PRODUCT_DOMAIN: "test.app",
    PRODUCT_LOGO_URL: "https://test.app/logo.png",
    PRODUCT_BRAND_COLOR: "#000000",
    PRODUCT_ACCENT_COLOR: "#ffffff",
    CALENDAR_URL: "https://cal.com/test",
    EMAIL_FROM: "hello@test.app",
    ALLOWED_ORIGIN: "https://test.app",
    ...overrides,
  };
}

describe("constants", () => {
  it("exposes the wire-contract field names", () => {
    expect(HONEYPOT_FIELD).toBe("company_website");
    expect(TURNSTILE_FIELD).toBe("turnstileToken");
  });
});

describe("isHoneypotTripped", () => {
  it("returns false when field is absent", () => {
    expect(isHoneypotTripped({})).toBe(false);
  });

  it("returns false when field is empty or whitespace", () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: "" })).toBe(false);
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: "   " })).toBe(false);
  });

  it("returns false when field is not a string", () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: 123 })).toBe(false);
  });

  it("returns true when field has a non-empty trimmed value", () => {
    expect(isHoneypotTripped({ [HONEYPOT_FIELD]: "bot.example.com" })).toBe(
      true,
    );
  });
});

describe("shouldEnforceTurnstile", () => {
  it("is true when a secret is configured", () => {
    expect(shouldEnforceTurnstile(env({ TURNSTILE_SECRET_KEY: "sk" }))).toBe(
      true,
    );
  });

  it("is true in production even without a secret", () => {
    expect(shouldEnforceTurnstile(env({ ENVIRONMENT: "production" }))).toBe(
      true,
    );
  });

  it("is true when environment is unset or unknown", () => {
    expect(shouldEnforceTurnstile(env())).toBe(true);
    expect(shouldEnforceTurnstile(env({ ENVIRONMENT: "staging" }))).toBe(true);
  });

  it("is false only in explicit dev/test without a secret", () => {
    expect(shouldEnforceTurnstile(env({ ENVIRONMENT: "development" }))).toBe(
      false,
    );
    expect(shouldEnforceTurnstile(env({ ENVIRONMENT: "test" }))).toBe(false);
  });

  it("treats a whitespace-only secret as missing", () => {
    expect(
      shouldEnforceTurnstile(
        env({ ENVIRONMENT: "test", TURNSTILE_SECRET_KEY: "   " }),
      ),
    ).toBe(false);
  });
});

describe("verifyTurnstile", () => {
  beforeEach(() => {
    __resetTurnstileWarning();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed and warns once when secret is unset", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await verifyTurnstile("tok", env());
    expect(result).toEqual({ ok: false });
    const second = await verifyTurnstile("tok", env());
    expect(second).toEqual({ ok: false });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("fails closed when token is missing or empty", async () => {
    expect(
      await verifyTurnstile(undefined, env({ TURNSTILE_SECRET_KEY: "sk" })),
    ).toEqual({ ok: false });
    expect(
      await verifyTurnstile("   ", env({ TURNSTILE_SECRET_KEY: "sk" })),
    ).toEqual({ ok: false });
  });

  it("fails closed on network throw", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const result = await verifyTurnstile(
      "tok",
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ ok: false });
  });

  it("fails closed on non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    const result = await verifyTurnstile(
      "tok",
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ ok: false });
  });

  it("fails closed on JSON parse error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const result = await verifyTurnstile(
      "tok",
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ ok: false });
  });

  it("fails closed when payload success is not true", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: false }),
    );
    const result = await verifyTurnstile(
      "tok",
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ ok: false });
  });

  it("succeeds when payload success is true and posts to siteverify", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true }));
    const result = await verifyTurnstile(
      "tok",
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      SITEVERIFY_URL,
      expect.objectContaining({ method: "POST" }),
    );
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toContain("secret=sk");
    expect(init.body).toContain("response=tok");
  });

  it("trims secret and token before posting to siteverify", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true }));
    const result = await verifyTurnstile(
      "  tok  ",
      env({ TURNSTILE_SECRET_KEY: "  sk  " }),
    );

    expect(result).toEqual({ ok: true });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toContain("secret=sk");
    expect(init.body).toContain("response=tok");
    expect(init.body).not.toContain("%20%20");
  });
});

describe("guardPublicForm", () => {
  beforeEach(() => {
    __resetTurnstileWarning();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns honeypot outcome when honeypot tripped", async () => {
    const result = await guardPublicForm(
      { [HONEYPOT_FIELD]: "spam" },
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ outcome: "honeypot" });
  });

  it("returns ok when turnstile not enforced", async () => {
    const result = await guardPublicForm({}, env({ ENVIRONMENT: "test" }));
    expect(result).toEqual({ outcome: "ok" });
  });

  it("returns reject when turnstile enforced and token invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: false }),
    );
    const result = await guardPublicForm(
      { [TURNSTILE_FIELD]: "bad" },
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ outcome: "reject" });
  });

  it("returns reject when turnstile token is not a string", async () => {
    const result = await guardPublicForm(
      { [TURNSTILE_FIELD]: 123 },
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ outcome: "reject" });
  });

  it("returns ok when turnstile enforced and token valid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true }),
    );
    const result = await guardPublicForm(
      { [TURNSTILE_FIELD]: "good" },
      env({ TURNSTILE_SECRET_KEY: "sk" }),
    );
    expect(result).toEqual({ outcome: "ok" });
  });
});
