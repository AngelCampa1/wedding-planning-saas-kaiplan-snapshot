import { STRIPE_PRICE_ENV_KEYS, type StripePriceEnvKey } from "@kaiplan/shared";
import { z } from "zod";

/**
 * Zod schema for required worker environment bindings.
 *
 * Optional bindings (HYPERDRIVE, DATABASE_URL, GOOGLE_*, etc.)
 * are intentionally omitted here — they may be absent in some deployment
 * configurations and are validated at the call-site where they are used.
 *
 * Required bindings are those without which the worker cannot serve any
 * request safely (auth, billing, email delivery). Cloudflare Images is
 * optional: the hero-image upload degrades to a 503 when it is absent.
 */
const stripePriceEnvSchema = Object.fromEntries(
  Object.values(STRIPE_PRICE_ENV_KEYS)
    .flatMap((keysByInterval) => Object.values(keysByInterval))
    .map((key) => [key, z.string().min(1)]),
) as Record<StripePriceEnvKey, z.ZodString>;

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const envSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().refine(isHttpUrl),
  APP_URL: z.string().min(1),
  EMAIL_FROM_ADDRESS: z.string().min(1),
  EMAIL_TOKEN_SECRET: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  ...stripePriceEnvSchema,
  STRIPE_CHECKOUT_SUCCESS_URL: z.string().min(1),
  STRIPE_CHECKOUT_CANCEL_URL: z.string().min(1),
  STRIPE_PORTAL_RETURN_URL: z.string().min(1),
  CLOUDFLARE_IMAGES_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_IMAGES_API_TOKEN: z.string().min(1).optional(),
});

const NON_PRODUCTION_DATABASE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);
const NON_PRODUCTION_DATABASE_NAME_PATTERN =
  /(^|[_-])(dev|development|local|test|testing|staging|stage)([_-]|$)/i;
const INVALID_PRODUCTION_DATABASE_URL_MESSAGE =
  "DATABASE_URL must be a valid production Postgres URL";

function isValidProductionDatabaseUrl(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return false;
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (NON_PRODUCTION_DATABASE_HOSTS.has(hostname)) {
    return false;
  }

  const databaseName = parsed.pathname.replace(/^\/+/, "");
  return !NON_PRODUCTION_DATABASE_NAME_PATTERN.test(databaseName);
}

function validateProductionObservability(
  env: Record<string, unknown>,
): EnvValidationFailure | undefined {
  if (env.ENVIRONMENT !== "production") {
    return undefined;
  }

  if (typeof env.SENTRY_DSN !== "string" || env.SENTRY_DSN.trim() === "") {
    return {
      success: false,
      message: "SENTRY_DSN is required in production",
    };
  }

  if (
    typeof env.BETTER_AUTH_URL !== "string" ||
    !isHttpUrl(env.BETTER_AUTH_URL) ||
    new URL(env.BETTER_AUTH_URL).protocol !== "https:"
  ) {
    return {
      success: false,
      message: "BETTER_AUTH_URL must use HTTPS in production",
    };
  }

  if (!env.MARKETING_DB) {
    return {
      success: false,
      message: "MARKETING_DB binding is required in production",
    };
  }

  const hasHyperdrive =
    typeof (env.HYPERDRIVE as { connectionString?: unknown } | undefined)
      ?.connectionString === "string" &&
    (env.HYPERDRIVE as { connectionString: string }).connectionString.trim() !==
      "";
  const hasDatabaseUrl =
    typeof env.DATABASE_URL === "string" && env.DATABASE_URL.trim() !== "";

  if (!hasHyperdrive && !hasDatabaseUrl) {
    return {
      success: false,
      message: "HYPERDRIVE or DATABASE_URL is required in production",
    };
  }

  if (
    !hasHyperdrive &&
    typeof env.DATABASE_URL === "string" &&
    !isValidProductionDatabaseUrl(env.DATABASE_URL.trim())
  ) {
    return {
      success: false,
      message: INVALID_PRODUCTION_DATABASE_URL_MESSAGE,
    };
  }

  const publicRsvpRequiresTurnstile =
    typeof env.PUBLIC_RSVP_REQUIRE_TURNSTILE === "string"
      ? env.PUBLIC_RSVP_REQUIRE_TURNSTILE.trim() !== "false"
      : env.PUBLIC_RSVP_REQUIRE_TURNSTILE !== "false";

  if (
    publicRsvpRequiresTurnstile &&
    (typeof env.TURNSTILE_SECRET_KEY !== "string" ||
      env.TURNSTILE_SECRET_KEY.trim() === "")
  ) {
    return {
      success: false,
      message:
        "TURNSTILE_SECRET_KEY is required in production when RSVP Turnstile is enabled",
    };
  }

  const requiredEmailDeliveryValues = [
    "RESEND_API_KEY",
    "FEEDBACK_RECIPIENT_EMAIL",
  ] as const;
  for (const key of requiredEmailDeliveryValues) {
    if (typeof env[key] !== "string" || env[key].trim() === "") {
      return {
        success: false,
        message: `${key} is required in production`,
      };
    }
  }

  return undefined;
}

type EnvValidationSuccess = { success: true };
type EnvValidationFailure = { success: false; message: string };
type EnvValidationResult = EnvValidationSuccess | EnvValidationFailure;

/**
 * Validates that all required environment bindings are present and non-empty.
 *
 * Returns a discriminated union so callers can decide whether to surface the
 * error message (dev/test) or swallow it (production).
 */
export function validateEnv(env: Record<string, unknown>): EnvValidationResult {
  const observabilityFailure = validateProductionObservability(env);
  if (observabilityFailure) {
    return observabilityFailure;
  }

  const result = envSchema.safeParse(env);
  if (result.success) {
    return { success: true };
  }
  return { success: false, message: result.error.message };
}
