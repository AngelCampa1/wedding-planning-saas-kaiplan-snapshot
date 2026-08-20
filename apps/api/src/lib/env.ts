import type { StripePriceEnvKey } from "@kaiplan/shared";

export interface Env extends Record<StripePriceEnvKey, string> {
  HYPERDRIVE?: Hyperdrive;
  DATABASE_URL?: string;
  MARKETING_DB?: D1Database;
  RATE_LIMITER?: DurableObjectNamespace;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  APP_URL: string;
  PUBLIC_WEB_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  EMAIL_FROM_ADDRESS: string;
  EMAIL_REPLY_TO_ADDRESS?: string;
  RESEND_API_KEY?: string;
  EMAIL_TOKEN_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_CHECKOUT_SUCCESS_URL: string;
  STRIPE_CHECKOUT_CANCEL_URL: string;
  STRIPE_PORTAL_RETURN_URL: string;
  CLOUDFLARE_IMAGES_ACCOUNT_ID?: string;
  CLOUDFLARE_IMAGES_API_TOKEN?: string;
  CLOUDFLARE_IMAGES_DELIVERY_BASE_URL?: string;
  CLOUDFLARE_IMAGES_DIRECT_UPLOAD_TTL_SECONDS?: string;
  FEEDBACK_RECIPIENT_EMAIL?: string;
  TURNSTILE_SECRET_KEY?: string;
  PUBLIC_RSVP_HONEYPOT_FIELD?: string;
  PUBLIC_RSVP_TURNSTILE_FIELD?: string;
  PUBLIC_RSVP_REQUIRE_TURNSTILE?: string;
  E2E_MODE?: string;
  ENVIRONMENT?: string;
  SENTRY_DSN?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
}
