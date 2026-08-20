# Production Readiness - Kaiplan

> Status update 2026-05-20: this snapshot is historical. Several product gaps
> listed from the 2026-04-11 closeout have since been fixed in code and tests,
> including guest form stale-state behavior, invite-link recomputation,
> and filter-selection cleanup. Treat this document as launch
> infrastructure context, not as the authoritative unfinished-feature list.

Snapshot: 2026-04-22. Aligns the roadmap launch checklist (`docs/roadmap.md`)
with the current repo state. Every unchecked item below must land before we
point `kaiplan.app` DNS at production.

## 1. Feature completeness

Phases 1-7 have shipped to `master` (budget, guests, seating, vendors, Stripe
billing + 30-day trial, wedding website, transactional email via Resend).
Phase 8 (marketing migration) is in-repo as `apps/web`.

Historical product gaps from `docs/closeout-2026-04-11.md` have been
rechecked against current code and regression tests:

- [x] `GuestForm` stale-state on reopen
      (`pnpm --filter @kaiplan/app test -- guest-form.test.tsx`)
- [x] Website household invite link recompute on primary-guest change
      (`pnpm --filter @kaiplan/app test -- website-route.test.tsx`)
- [x] Guest bulk-selection safety when filters hide rows
      (`pnpm --filter @kaiplan/app test -- guests-route.test.tsx`)
- [x] Public wedding page polish: semantic theme tokens, CTA hierarchy, custom
      RSVP controls, mobile hero, guest-facing copy
      (`pnpm --filter @kaiplan/web test -- src/pages/w/[slug].astro.test.ts
  src/lib/public-website.test.ts`)
- [x] `@kaiplan/app` closeout blocker regressions pass
      (`pnpm --filter @kaiplan/app test -- guest-form.test.tsx
  guests-route.test.tsx website-route.test.tsx`)
- [x] `@kaiplan/app` coverage gate verified at or above 95%
      (`pnpm --filter @kaiplan/app test:coverage`: 92 files, 1010 tests,
      all configured 95% thresholds passed)

No launch until `pnpm run verify` is green on `master`.

## 2. Infrastructure provisioning

### Cloudflare

- [ ] Worker: `kaiplan-api` deployed to `api.kaiplan.app`
- [ ] Worker: `kaiplan-app` deployed to `my.kaiplan.app`
- [ ] Pages project: `kaiplan-web` deployed to `kaiplan.app`
- [ ] `www.kaiplan.app` redirects to `https://kaiplan.app/`
- [ ] Hyperdrive binding `HYPERDRIVE` populated with the production Neon
      connection in `apps/api/wrangler.toml`
- [x] Production `compatibility_date` reviewed on both workers:
      `apps/api/wrangler.toml` uses `2026-04-01` with `nodejs_compat`;
      `apps/app/wrangler.jsonc` uses `2026-05-07`; `apps/web/wrangler.jsonc`
      uses `2026-04-10` with `nodejs_compat`

### Neon

- [ ] Production project + branch created, connection pooling enabled
- [ ] `pnpm --filter @kaiplan/api run db:migrate` applied against production DSN
- [ ] Point-in-time restore window confirmed (>= 7 days)
- [ ] Read-only role for analytics/backups (if used)

### DNS

- [ ] `kaiplan.app` custom domain bound to `kaiplan-web`
- [ ] `my.kaiplan.app` custom domain bound to `kaiplan-app`
- [ ] `api.kaiplan.app` custom domain bound to `kaiplan-api`
- [ ] `mail.kaiplan.app` MX/TXT for Resend sending domain

## 3. Secrets and environment

Set API secrets via `wrangler secret put` and public project variables through
their checked-in Cloudflare configuration. Verify parity with
`apps/api/.dev.vars.example`.

API (`kaiplan-api`):

- [ ] `DATABASE_URL` (direct Neon, for migrations only; Hyperdrive handles
      runtime)
- [ ] `BETTER_AUTH_SECRET`
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_STARTER_PRICE_ID`, `STRIPE_STARTER_ANNUAL_PRICE_ID`,
      `STRIPE_PRO_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`,
      `STRIPE_LIFETIME_PRICE_ID`
- [ ] `STRIPE_CHECKOUT_SUCCESS_URL`,
      `STRIPE_CHECKOUT_CANCEL_URL`,
      `STRIPE_PORTAL_RETURN_URL`
- [ ] `RESEND_API_KEY` and sending-domain env vars
- [ ] Email unsubscribe signing secret
- [ ] `PUBLIC_WEB_URL=https://kaiplan.app`
- [ ] `ENVIRONMENT=production`

App (`kaiplan-app` Worker vars in `apps/app/wrangler.jsonc`):

- [ ] `VITE_API_URL=https://api.kaiplan.app`
- [ ] `VITE_PUBLIC_SITE_URL=https://kaiplan.app`
- [ ] `VITE_SENTRY_DSN` set to the public browser DSN

Web (`kaiplan-web` Pages vars and bindings):

- [ ] `PUBLIC_API_URL=https://api.kaiplan.app`
- [ ] `PUBLIC_APP_ORIGIN=https://my.kaiplan.app`
- [ ] `PUBLIC_MARKETING_API_URL` left unset in production so the embedded
      `@kaiplan/marketing-api` binding handles `/api/...`
- [ ] Pages Functions D1 binding `DB` configured for the production
      `kaiplan-db` database
- [ ] `LEAD_MAGNETS_R2` bound to the production bucket
- [ ] Existing marketing API bindings and secrets configured for the embedded
      runtime

Checked-in examples must match the deploy contract:

- [x] `apps/web/.env.example` documents `PUBLIC_API_URL` and
      `PUBLIC_APP_ORIGIN` (`apps/web/.env.example`: lines 1-2)
- [x] `apps/app/.env.example` documents `VITE_API_URL` and
      `VITE_PUBLIC_SITE_URL` (`apps/app/.env.example`: lines 1-4)
- [x] `apps/api/wrangler.toml` defaults deployed workers to
      `ENVIRONMENT=production` (`apps/api/wrangler.toml`: lines 14-20)

## 4. Third-party production accounts

- [ ] Stripe live products, prices, customer portal, and webhook endpoint
      configured
- [ ] Google OAuth production client verified with
      `https://api.kaiplan.app/api/auth/callback/google`
- [ ] Resend production domain verified with SPF, DKIM, and DMARC
- [ ] Neon production plan confirmed for expected compute/runtime
- [ ] Cloudflare billing confirmed for Worker and Pages usage

## 5. Security hardening

Roadmap launch security checklist status:

- [x] Rate limiting on auth (`/api/auth/sign-in`, `/api/auth/sign-up`,
      `/api/auth/forget-password`)
      (`pnpm --filter @kaiplan/api test -- __tests__/routes/index.test.ts`)
- [x] CSRF protection audit for Better Auth state-changing routes
      (`pnpm --filter @kaiplan/api test -- __tests__/middleware/csrf.test.ts`)
- [x] `pnpm audit` clean (no high/critical)
      (`pnpm audit --audit-level high`: exits clean; low/moderate advisories
      remain for separate triage)
- [ ] Security header scan on app, api, and web hosts (2026-05-20 live scan:
      `kaiplan.app` and `my.kaiplan.app` return security headers; current
      `api.kaiplan.app/api/health` lacks the full defensive header set until
      `apps/api/src/index.ts` is redeployed)
- [x] Public wedding page CSP + slug validation reserved-word list
      (`pnpm --filter @kaiplan/web test -- src/lib/security-headers.test.ts
  src/pages/w/[slug].astro.test.ts`)
- [x] Image upload path: API and dashboard allowlist JPEG, PNG, WebP, and
      AVIF only; dashboard rejects files over 10 MB before requesting a
      Cloudflare Images direct upload URL; Cloudflare Images enforces the
      hosted-image upload limit; malware policy documented in
      `docs/image-upload-security-policy.md`
      (`pnpm --filter @kaiplan/api test --
  __tests__/routes/wedding-website.test.ts`;
      `pnpm --filter @kaiplan/app test -- website-route.test.tsx`)
- [x] Audit logging for member invite/remove/role changes
      (`pnpm --filter @kaiplan/api test -- __tests__/routes/weddings.test.ts`)
- [x] Audit logging for billing plan changes
      (`pnpm --filter @kaiplan/api test -- __tests__/routes/billing.test.ts`)
- [x] Session privilege freshness verified: wedding access re-reads membership
      role on each request, so stale sessions cannot retain old wedding roles
      (`pnpm --filter @kaiplan/api test --
  __tests__/middleware/wedding-access.test.ts`)
- [ ] Penetration test on auth flows + public RSVP form before launch

## 6. Observability

- [x] Sentry wired for app, api, and web
      (`pnpm --filter @kaiplan/app test -- sentry.test.ts main.test.tsx
  env-guard.test.ts query-client.test.ts query-client-static.test.ts`;
      `pnpm --filter @kaiplan/api test -- __tests__/lib/sentry.test.ts
  __tests__/lib/env-schema.test.ts __tests__/routes/index.test.ts`;
      `pnpm --filter @kaiplan/marketing test -- src/lib/sentry-client.test.ts
  src/components/marketing-island-boundary.test.tsx
  src/components/feedback-widget.test.tsx`;
      `pnpm --filter @kaiplan/web test -- src/scripts/public-rsvp.test.ts
  src/lib/local-sentry-cloudflare.test.ts`)
- [x] PostHog reviewed for PII exposure and prod bootstrap: browser analytics
      are production-gated with autocapture/pageview/pageleave disabled, custom
      event payloads avoid raw email/name/token values, and server-side PDF
      download tracking uses a SHA-256 email hash as the distinct id
      (`pnpm --filter @kaiplan/marketing test -- src/lib/analytics.test.ts
  src/lib/form-interaction-tracker.test.ts
  src/lib/billing-toggle-tracker.test.ts
  src/components/email-capture.test.tsx
  src/components/exit-intent-popup.test.tsx
  src/components/gated-content.test.tsx
  src/components/feedback-widget.test.tsx
  src/components/post-signup-survey.test.tsx`;
      `pnpm --filter @kaiplan/marketing-api test --
  src/routes/lead-magnet-download.test.ts src/services/analytics.test.ts`;
      `pnpm --filter @kaiplan/web test -- src/lib/security-headers.test.ts`)
- [ ] Cloudflare Worker tail or Logpush configured for `kaiplan-api`
- [ ] Uptime checks on `api.kaiplan.app/api/health`, `my.kaiplan.app`,
      and `kaiplan.app`
- [ ] Alerts on Stripe webhook failures, auth error spikes, and DB connection
      errors

## 7. Legal and compliance

- [x] Privacy policy page updated for Neon, Stripe, Google OAuth, PostHog,
      Sentry, Resend, and Cloudflare (`apps/web/src/pages/privacy.astro`;
      `pnpm --filter @kaiplan/web test -- src/pages/privacy.astro.test.ts
  src/pages/terms.astro.test.ts`)
- [x] Terms of service page updated with subscription cancellation and refund
      language (`apps/web/src/pages/terms.astro`; same focused legal page test
      command above)
- [x] Cookie/consent handling reviewed if PostHog loads before consent:
      browser PostHog loads with autocapture, pageview, pageleave, session
      recording, persistence, and capture disabled by default until a future
      consent flow opts visitors in (`packages/marketing/src/lib/analytics.ts`)
- [ ] DPA review completed for Stripe, Neon, Cloudflare, Resend, PostHog,
      and Sentry
- [ ] Record-of-processing doc stored durably

## 8. Operational runbook

- [x] Secret rotation procedure documented for auth, Stripe, Resend, Google
      OAuth, and Neon (`docs/operational-runbook.md`)
- [ ] DB restore dry-run from Neon PITR verified once
- [x] Incident contact and owner documented (`docs/operational-runbook.md`)
- [x] Deploy procedure documented:
      `pnpm --filter @kaiplan/api run deploy`
      `pnpm --filter @kaiplan/app run deploy`
      `pnpm --filter @kaiplan/web run deploy`
- [x] Rollback procedure documented for Worker version rollback, Pages
      deployment rollback, and old-site removal (`docs/operational-runbook.md`)
- [ ] Status page ready for visible incidents (interim incident communication
      documented in `docs/operational-runbook.md`; dedicated status page still
      required before launch)

## 9. Launch gate

Run all of this in order:

1. `pnpm install && pnpm run verify` on a clean clone
2. Deploy and smoke test `kaiplan-api`, including
   `https://api.kaiplan.app/health`
3. Deploy `kaiplan-app`, bind `my.kaiplan.app`, and smoke test
   signup/login/bootstrap against the live API
4. Deploy `kaiplan-web` to a Pages preview, validate the homepage, one
   embedded `/api/...` marketing route, one published wedding page, and the
   RSVP submission path, then bind `kaiplan.app`
5. Add the `www.kaiplan.app` redirect to `https://kaiplan.app/`
6. Run security header scan (A or better) on all three hosts
7. Run `pnpm audit --prod` with no high/critical issues
8. Run Lighthouse and axe on key pages with no P0 regressions
9. Remove the stale `kaiplan` Cloudflare Pages marketing project from the old
   `ideas-validation` stack after live validation confirms `kaiplan-web` is the
   only canonical marketing site
