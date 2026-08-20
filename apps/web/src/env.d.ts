/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_API_URL?: string;
  readonly PUBLIC_APP_ORIGIN?: string;
  readonly PUBLIC_MARKETING_API_URL?: string;
  readonly PUBLIC_SENTRY_DSN?: string;
  readonly PUBLIC_SENTRY_RELEASE?: string;
  readonly PUBLIC_RSVP_HONEYPOT_FIELD?: string;
  readonly PUBLIC_RSVP_TURNSTILE_FIELD?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
