# Kaiplan Product Roadmap

> Historical planning artifact. Current pricing, billing labels, trial length,
> and Stripe env keys are defined in `packages/shared`; do not use this roadmap
> as the current source of truth for commercial terms.

Ship all phases before public launch. Each phase is a self-contained spec → plan → implementation cycle.

## Security

Security is built into each phase, not a separate pass. Each phase lists its security requirements inline. Cross-cutting concerns are assigned to the phase where they first become relevant.

## Phase 0: Auth + Dashboard Shell (COMPLETE)

- Monorepo scaffold (apps/app, apps/api, packages/shared)
- Better Auth (email/password + Google OAuth)
- Neon Postgres via Drizzle, multi-wedding data model
- Hono API with session + wedding-access middleware
- Vite SPA with TanStack Router, collapsible sidebar, dashboard shell
- Shadcn/UI design system, Tailwind 4 with brand tokens
- 95% test coverage, pre-commit hooks, ESLint/Prettier

Tagged: `v0.1.0-scaffold`

**Security (retrofit):**

- Rate limiting on auth endpoints (login, signup, forgot-password)
- Session token rotation on privilege changes
- CSRF protection for state-changing API routes
- `pnpm audit` in CI / pre-commit

---

## Phase 1: Budget Ledger

The headline differentiator. Couples track real vendor quotes against their budget, not estimates.

- Budget categories (venue, catering, photography, etc.) with estimated vs actual costs
- Line items within each category (vendor name, quoted amount, paid amount, status)
- Running totals: total budget, total quoted, total paid, remaining
- Money stored in cents, displayed formatted
- Budget overview on dashboard home (replaces "coming soon" card)

**Security:**

- Input validation on all budget amounts (integer cents, max bounds)
- Row-level access enforcement: all queries scoped to wedding_id via middleware
- Parameterized queries only (Drizzle handles this, but verify no raw SQL)

---

## Phase 2: Guest List + RSVP

High engagement feature. Feeds into seating chart (Phase 3).

- Add/edit/delete guests (name, email, phone, party size, dietary notes, group/side)
- RSVP status tracking (invited, accepted, declined, pending)
- Guest count summary (invited, confirmed, declined, pending)
- Bulk import (CSV)
- Guest list overview on dashboard home

**Security:**

- CSV import sanitization (strip formulas, limit file size, validate column types)
- XSS prevention on guest names and notes (sanitize on output)
- Rate limiting on bulk operations

---

## Phase 3: Seating Chart

Depends on guest list data. The most complex frontend feature.

- Drag-and-drop table layout on a canvas
- Table types (round, rectangle) with configurable capacity
- Assign guests to tables (drag from guest list)
- Visual indicators for unassigned guests, over-capacity tables
- Seat count validation against guest list

**Security:**

- Canvas state validation (prevent oversized layouts, max table/guest limits)
- Ensure seating assignments reference only guests within the same wedding

---

## Phase 4: Vendor Tracker

Pro feature. Integrates with budget (quotes flow into budget line items).

- Vendor contacts (name, company, email, phone, category, notes)
- Quote tracking (amount, date, status: pending/accepted/rejected)
- Contract status (none, sent, signed)
- Payment tracking (deposits, installments, final payment)
- Link vendor quotes to budget line items

**Security:**

- Sanitize vendor contact fields (email, phone, URLs)
- Validate cross-entity references (vendor → budget item must be same wedding)

---

## Phase 5: Stripe Billing + Tier Gating

Monetization layer. Gates Pro features behind paid plans.

- Stripe Checkout for subscriptions (Starter $20/mo, Pro $35/mo)
- Stripe Checkout for one-time Lifetime ($100)
- Webhook handling (subscription created/updated/cancelled, payment succeeded/failed)
- `subscription` table (userId, stripeCustomerId, stripePriceId, status, currentPeriodEnd)
- Tier-gating middleware: check subscription status before allowing access to Pro features
- Pro features gated: vendor tracker, wedding website, 2-planner support
- Billing settings page (current plan, upgrade/downgrade, cancel, payment history)
- Stripe Customer Portal link for self-service billing management

**Security:**

- Stripe webhook signature verification (reject unsigned events)
- Idempotent webhook processing (handle duplicate deliveries)
- Server-side tier checks (never trust client-side plan claims)
- PCI compliance: no card data touches our servers (Stripe Checkout handles it)

---

## Phase 6: Wedding Website Builder

Pro feature. Public-facing wedding website with RSVP.

- Template selection (2-3 simple templates)
- Customizable sections (hero with names/date, story, venue/directions, registry links, RSVP form)
- Public URL (slug-based, e.g., kaiplan.app/w/sarah-and-james)
- RSVP form that writes to the guest list (Phase 2 data)
- Mobile-responsive output

**Security:**

- XSS sanitization on all user-generated content (names, story text, custom sections)
- Content Security Policy headers on public wedding pages
- Slug validation (no path traversal, reserved words)
- Image uploads: file type validation, size limits, malware scan via Cloudflare
- Public RSVP form: rate limiting, CAPTCHA or honeypot for spam prevention

---

## Phase 7: Transactional Email

Cross-cutting concern needed for polish.

- Resend integration for email delivery
- React Email templates
- Email types: member invite, RSVP confirmation, RSVP reminder, password reset
- Email preferences (opt-out per type)

**Security:**

- SPF/DKIM/DMARC configured on sending domain
- Unsubscribe tokens: signed, single-use, non-guessable
- Rate limiting on email sends (prevent abuse of invite/reminder features)
- No sensitive data in email bodies (link to app instead)

---

## Phase 8: Marketing Site Migration

Move the validation site from `ideas-validation` into this repo as `apps/web`.

- Astro site with existing pSEO content
- Shared Shadcn/UI components between app and web
- Update CTAs from waitlist to actual signup
- Remove fake-door pricing and link to real Stripe Checkout
- Deploy to `kaiplan.app` (root domain)

**Security:**

- Security headers on marketing site (CSP, X-Frame-Options, HSTS)
- No sensitive config exposed in client-side bundles

---

## Launch Checklist

- [ ] All 8 phases complete
- [ ] Neon production database provisioned
- [ ] Cloudflare Workers + Pages deployed
- [ ] Stripe production keys configured
- [ ] DNS: `kaiplan.app` (marketing), `my.kaiplan.app` (app), `api.kaiplan.app` (API)
- [ ] Resend production domain verified
- [ ] Google OAuth production credentials
- [ ] Better Auth secret rotated for production
- [ ] Drizzle migrations applied to production DB
- [ ] Error monitoring (Sentry)
- [ ] Analytics (PostHog)
- [ ] Privacy policy + terms of service pages
- [ ] Security headers audit (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- [ ] `pnpm audit` clean (no high/critical vulnerabilities)
- [ ] Penetration test on auth flows and public wedding pages
- [ ] Audit logging for admin-level actions (member invite/remove, plan changes)
- [ ] Secrets rotation documented (Better Auth, Stripe, Resend, Google OAuth)
