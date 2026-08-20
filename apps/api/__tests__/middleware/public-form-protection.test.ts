import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPublicFormProtectionConfig,
  validatePublicFormSubmission,
  verifyTurnstileToken,
} from "../../src/middleware/public-form-protection";

describe("public-form-protection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("uses the default field names and requires turnstile by default", () => {
    expect(getPublicFormProtectionConfig()).toEqual({
      honeypotField: "website",
      requireTurnstile: true,
      turnstileField: "turnstileToken",
    });
  });

  it("allows turnstile to be disabled through env", () => {
    const config = getPublicFormProtectionConfig({
      PUBLIC_RSVP_HONEYPOT_FIELD: "botField",
      PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
      PUBLIC_RSVP_TURNSTILE_FIELD: "challenge",
    });

    expect(
      validatePublicFormSubmission(
        {
          botField: "",
        },
        config,
      ),
    ).toEqual({ ok: true });
  });

  it("trims configured field names and turnstile flag", () => {
    const config = getPublicFormProtectionConfig({
      PUBLIC_RSVP_HONEYPOT_FIELD: "  botField  ",
      PUBLIC_RSVP_REQUIRE_TURNSTILE: " false ",
      PUBLIC_RSVP_TURNSTILE_FIELD: "  challenge  ",
    });

    expect(config).toEqual({
      honeypotField: "botField",
      requireTurnstile: false,
      turnstileField: "challenge",
    });
  });

  it("rejects colliding honeypot and turnstile field names", () => {
    expect(() =>
      getPublicFormProtectionConfig({
        PUBLIC_RSVP_HONEYPOT_FIELD: "spamField",
        PUBLIC_RSVP_TURNSTILE_FIELD: "spamField",
      }),
    ).toThrow(
      "PUBLIC_RSVP_HONEYPOT_FIELD and PUBLIC_RSVP_TURNSTILE_FIELD must be different.",
    );
  });

  it.each([
    ["PUBLIC_RSVP_HONEYPOT_FIELD", "   "],
    ["PUBLIC_RSVP_TURNSTILE_FIELD", "   "],
  ] as const)("rejects empty configured field name %s", (fieldName, value) => {
    expect(() =>
      getPublicFormProtectionConfig({
        [fieldName]: value,
      }),
    ).toThrow(/must not be empty/);
  });

  it.each([
    ["PUBLIC_RSVP_HONEYPOT_FIELD", "guests"],
    ["PUBLIC_RSVP_HONEYPOT_FIELD", "honeypot"],
    ["PUBLIC_RSVP_HONEYPOT_FIELD", "turnstileToken"],
    ["PUBLIC_RSVP_TURNSTILE_FIELD", "guests"],
    ["PUBLIC_RSVP_TURNSTILE_FIELD", "honeypot"],
    ["PUBLIC_RSVP_HONEYPOT_FIELD", " guests "],
    ["PUBLIC_RSVP_TURNSTILE_FIELD", " honeypot "],
  ] as const)("rejects reserved key %s when set to %s", (fieldName, value) => {
    expect(() =>
      getPublicFormProtectionConfig({
        [fieldName]: value,
      }),
    ).toThrow(/must not use reserved RSVP payload keys/);
  });

  it("rejects submissions that fill the honeypot", () => {
    const config = getPublicFormProtectionConfig();

    expect(
      validatePublicFormSubmission(
        {
          website: "spam",
          turnstileToken: "token",
        },
        config,
      ),
    ).toEqual({ ok: false, error: "Spam check failed." });
  });

  it("rejects submissions that miss the turnstile token when required", () => {
    const config = getPublicFormProtectionConfig();

    expect(
      validatePublicFormSubmission(
        {
          website: "",
        },
        config,
      ),
    ).toEqual({ ok: false, error: "Turnstile verification required." });
  });

  it("verifies a turnstile token server-side", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyTurnstileToken("valid-token", {
        TURNSTILE_SECRET_KEY: "secret-123",
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("returns a configuration error when the turnstile secret is missing", async () => {
    await expect(verifyTurnstileToken("valid-token")).resolves.toEqual({
      ok: false,
      error: "Turnstile verification is not configured.",
      status: 500,
    });
  });

  it("rejects turnstile verification transport failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyTurnstileToken("bad-token", {
        TURNSTILE_SECRET_KEY: "secret-123",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Turnstile verification failed.",
      status: 400,
    });
  });

  it("rejects invalid turnstile tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyTurnstileToken("bad-token", {
        TURNSTILE_SECRET_KEY: "secret-123",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Turnstile verification failed.",
      status: 400,
    });
  });

  it("trims the turnstile secret and token before siteverify", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyTurnstileToken("  valid-token  ", {
        TURNSTILE_SECRET_KEY: "  secret-123  ",
      }),
    ).resolves.toEqual({ ok: true });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe("secret=secret-123&response=valid-token");
  });
});
