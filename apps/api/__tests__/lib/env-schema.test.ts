import { describe, expect, it } from "vitest";
import { validateEnv } from "../../src/lib/env-schema";
import { TEST_STRIPE_PRICE_ENV } from "../helpers/stripe-env";

const VALID_ENV = {
  BETTER_AUTH_SECRET: "secret-32-chars-minimum-value-ok",
  BETTER_AUTH_URL: "https://api.kaiplan.app",
  APP_URL: "https://my.kaiplan.app",
  EMAIL_FROM_ADDRESS: "Angel Campa <angel.campa@kaiplan.app>",
  EMAIL_TOKEN_SECRET: "token-secret-value",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  ...TEST_STRIPE_PRICE_ENV,
  STRIPE_CHECKOUT_SUCCESS_URL:
    "https://my.kaiplan.app/settings?checkout=success",
  STRIPE_CHECKOUT_CANCEL_URL: "https://my.kaiplan.app/settings?checkout=cancel",
  STRIPE_PORTAL_RETURN_URL: "https://my.kaiplan.app/settings",
  CLOUDFLARE_IMAGES_ACCOUNT_ID: "cf-account-123",
  CLOUDFLARE_IMAGES_API_TOKEN: "cf-token-123",
  CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: "https://imagedelivery.net/hash",
  FEEDBACK_RECIPIENT_EMAIL: "angel.campa@kaiplan.app",
  RESEND_API_KEY: "re_live_123",
};

describe("validateEnv", () => {
  it("returns success for a fully valid environment", () => {
    const result = validateEnv(VALID_ENV);
    expect(result.success).toBe(true);
  });

  it("returns failure when BETTER_AUTH_SECRET is missing", () => {
    const env = { ...VALID_ENV, BETTER_AUTH_SECRET: undefined };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("returns failure when BETTER_AUTH_URL is malformed", () => {
    const env = { ...VALID_ENV, BETTER_AUTH_URL: "not-a-url" };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("returns failure when BETTER_AUTH_URL uses a non-http scheme", () => {
    const env = { ...VALID_ENV, BETTER_AUTH_URL: "ftp://api.kaiplan.app" };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("returns failure when STRIPE_SECRET_KEY is missing", () => {
    const env = { ...VALID_ENV, STRIPE_SECRET_KEY: undefined };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("returns failure when STRIPE_WEBHOOK_SECRET is missing", () => {
    const env = { ...VALID_ENV, STRIPE_WEBHOOK_SECRET: undefined };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("passes when CLOUDFLARE_IMAGES_ACCOUNT_ID is omitted (optional)", () => {
    const env = { ...VALID_ENV, CLOUDFLARE_IMAGES_ACCOUNT_ID: undefined };
    const result = validateEnv(env);
    expect(result.success).toBe(true);
  });

  it("passes when CLOUDFLARE_IMAGES_API_TOKEN is omitted (optional)", () => {
    const env = { ...VALID_ENV, CLOUDFLARE_IMAGES_API_TOKEN: undefined };
    const result = validateEnv(env);
    expect(result.success).toBe(true);
  });

  it("passes when CLOUDFLARE_IMAGES_DELIVERY_BASE_URL is omitted outside production", () => {
    const env = {
      ...VALID_ENV,
      CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: undefined,
    };
    const result = validateEnv(env);
    expect(result.success).toBe(true);
  });

  it("returns failure when APP_URL is missing", () => {
    const env = { ...VALID_ENV, APP_URL: undefined };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("returns failure when EMAIL_FROM_ADDRESS is missing", () => {
    const env = { ...VALID_ENV, EMAIL_FROM_ADDRESS: undefined };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("returns failure when EMAIL_TOKEN_SECRET is missing", () => {
    const env = { ...VALID_ENV, EMAIL_TOKEN_SECRET: undefined };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("includes a message in the failure result", () => {
    const env = { ...VALID_ENV, STRIPE_SECRET_KEY: undefined };
    const result = validateEnv(env);
    if (result.success) throw new Error("expected failure");
    expect(typeof result.message).toBe("string");
    expect(result.message.length).toBeGreaterThan(0);
  });

  it("passes validation when optional fields are omitted", () => {
    // Optional fields: HYPERDRIVE, DATABASE_URL, GOOGLE_CLIENT_ID, etc.
    const env = { ...VALID_ENV };
    const result = validateEnv(env);
    expect(result.success).toBe(true);
  });

  it("requires SENTRY_DSN in production", () => {
    const result = validateEnv({ ...VALID_ENV, ENVIRONMENT: "production" });
    expect(result).toEqual({
      success: false,
      message: "SENTRY_DSN is required in production",
    });
  });

  it("requires HTTPS BETTER_AUTH_URL in production", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      BETTER_AUTH_URL: "http://api.kaiplan.app",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      DATABASE_URL: "postgres://database-url",
      TURNSTILE_SECRET_KEY: "turnstile-secret",
    });

    expect(result).toEqual({
      success: false,
      message: "BETTER_AUTH_URL must use HTTPS in production",
    });
  });

  it("passes production validation when SENTRY_DSN is configured", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      DATABASE_URL: "postgres://database-url",
      TURNSTILE_SECRET_KEY: "turnstile-secret",
    });
    expect(result.success).toBe(true);
  });

  it("passes production validation when all CLOUDFLARE_IMAGES_* values are omitted (optional)", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      DATABASE_URL: "postgres://database-url",
      TURNSTILE_SECRET_KEY: "turnstile-secret",
      CLOUDFLARE_IMAGES_ACCOUNT_ID: undefined,
      CLOUDFLARE_IMAGES_API_TOKEN: undefined,
      CLOUDFLARE_IMAGES_DELIVERY_BASE_URL: undefined,
      RESEND_API_KEY: "re_live_123",
      FEEDBACK_RECIPIENT_EMAIL: "angel.campa@kaiplan.app",
    });

    expect(result).toEqual({ success: true });
  });

  it("requires RESEND_API_KEY in production", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      DATABASE_URL: "postgres://database-url",
      TURNSTILE_SECRET_KEY: "turnstile-secret",
      RESEND_API_KEY: undefined,
    });

    expect(result).toEqual({
      success: false,
      message: "RESEND_API_KEY is required in production",
    });
  });

  it("requires FEEDBACK_RECIPIENT_EMAIL in production", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      DATABASE_URL: "postgres://database-url",
      TURNSTILE_SECRET_KEY: "turnstile-secret",
      FEEDBACK_RECIPIENT_EMAIL: undefined,
    });

    expect(result).toEqual({
      success: false,
      message: "FEEDBACK_RECIPIENT_EMAIL is required in production",
    });
  });

  it("requires MARKETING_DB in production", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    });

    expect(result).toEqual({
      success: false,
      message: "MARKETING_DB binding is required in production",
    });
  });

  it("requires a primary database connection in production", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      TURNSTILE_SECRET_KEY: "turnstile-secret",
    });

    expect(result).toEqual({
      success: false,
      message: "HYPERDRIVE or DATABASE_URL is required in production",
    });
  });

  it("rejects malformed production DATABASE_URL values when Hyperdrive is absent", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      TURNSTILE_SECRET_KEY: "turnstile-secret",
      DATABASE_URL: "not-a-url",
    });

    expect(result).toEqual({
      success: false,
      message: "DATABASE_URL must be a valid production Postgres URL",
    });
  });

  it.each([
    "postgres://localhost/kaiplan",
    "postgres://127.0.0.1/kaiplan",
    "postgres://db.example.com/kaiplan_test",
    "postgres://db.example.com/kaiplan-local",
  ])(
    "rejects non-production DATABASE_URL value %s in production when Hyperdrive is absent",
    (databaseUrl) => {
      const result = validateEnv({
        ...VALID_ENV,
        ENVIRONMENT: "production",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        MARKETING_DB: {},
        TURNSTILE_SECRET_KEY: "turnstile-secret",
        DATABASE_URL: databaseUrl,
      });

      expect(result).toEqual({
        success: false,
        message: "DATABASE_URL must be a valid production Postgres URL",
      });
    },
  );

  it("requires Turnstile secret in production when public RSVP Turnstile is enabled", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      DATABASE_URL: "postgres://database-url",
    });

    expect(result).toEqual({
      success: false,
      message:
        "TURNSTILE_SECRET_KEY is required in production when RSVP Turnstile is enabled",
    });
  });

  it("allows missing Turnstile secret in production when public RSVP Turnstile is disabled", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      DATABASE_URL: "postgres://database-url",
      PUBLIC_RSVP_REQUIRE_TURNSTILE: "false",
    });

    expect(result.success).toBe(true);
  });

  it("trims the public RSVP Turnstile disable flag in production", () => {
    const result = validateEnv({
      ...VALID_ENV,
      ENVIRONMENT: "production",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      MARKETING_DB: {},
      DATABASE_URL: "postgres://database-url",
      PUBLIC_RSVP_REQUIRE_TURNSTILE: " false ",
    });

    expect(result.success).toBe(true);
  });

  it("returns failure when STRIPE_SECRET_KEY is set to an empty string", () => {
    const env = { ...VALID_ENV, STRIPE_SECRET_KEY: "" };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("returns failure when BETTER_AUTH_SECRET is set to an empty string", () => {
    const env = { ...VALID_ENV, BETTER_AUTH_SECRET: "" };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });

  it("returns failure when APP_URL is set to an empty string", () => {
    const env = { ...VALID_ENV, APP_URL: "" };
    const result = validateEnv(env);
    expect(result.success).toBe(false);
  });
});
