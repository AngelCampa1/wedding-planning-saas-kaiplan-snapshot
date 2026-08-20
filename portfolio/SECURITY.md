# Security

Kaiplan handled two categories of data that earn this document a place in `portfolio/` rather than
being folded into [ARCHITECTURE.md](ARCHITECTURE.md): guest PII (names, emails, phone numbers,
dietary notes, RSVP status) and payment flows through Stripe. Everything below cites a file in this
tree; nothing here is a policy statement without code behind it.

## 1. An internal audit left numbered fingerprints in the source

Four controls in this codebase carry an inline `audit finding #N` comment, which means a security
review happened during development and its findings were remediated in place rather than tracked
only in an external document that did not make it into this archive:

| Finding | Control | Where |
|---|---|---|
| #17 | Wedding deletion stays available on archived weddings specifically for GDPR / right-to-delete compliance, even though the normal access middleware blocks writes against archived weddings. | [`weddings.ts:249`](../apps/api/src/routes/weddings.ts) |
| #22 | The public RSVP endpoint is rate-limited by client IP (5 submissions/minute), backed by the `RateLimiter` Durable Object so the limit holds across every Worker isolate, not just one. | [`wedding-website.ts:56`](../apps/api/src/routes/wedding-website.ts) |
| #27 | CSRF / Origin verification as defense in depth on top of Better Auth's `SameSite=Lax` cookie, because a same-site XSS can still forge a request with the cookie attached. | [`middleware/csrf.ts`](../apps/api/src/middleware/csrf.ts) |
| #28 | The `/api/weddings` sub-routes were consolidated onto one router so mount ordering is explicit, closing a class of bug where an implicit route order silently shadowed a handler. | [`index.ts:425`](../apps/api/src/index.ts) |

The numbering is not sequential in this tree (17, 22, 27, 28) because the audit covered more ground
than these four items; only the findings with a surviving code comment are listed here, and none of
the others are guessed at.

## 2. Access control: three layers, each catching a different bug class

Covered in full in [ARCHITECTURE.md §2](ARCHITECTURE.md#2-the-three-layer-permission-model): a
database `CHECK` constraint on the role column, a route middleware that resolves membership and
subscription in one join, and a `requireWriter(c)` guard at every mutating handler. The three exist
because each one is blind to a different mistake: a bad migration, a route tree that forgot authz
entirely, or a read-authorized user hitting a write endpoint.

Above all three sits an append-only `audit_log`, written best-effort through
`recordAuditEventBestEffort` ([`lib/audit-log.ts`](../apps/api/src/lib/audit-log.ts)) so a logging
failure never blocks the request it is trying to record. It probes for table existence before
writing, which keeps it safe to deploy alongside a migration that has not run yet.

## 3. Tenant isolation: can one couple's wedding reach another's

A wedding is the tenant, and every path into wedding-scoped data carries two independent checks,
not one:

1. **Membership, checked before the handler runs.** `weddingAccessMiddleware`
   ([`middleware/wedding-access.ts:38-64`](../apps/api/src/middleware/wedding-access.ts)) joins
   `weddingMember` to the `:weddingId` route param and the authenticated `user.id`. No matching row
   returns `403 Not a member of this wedding` before any query against guest, budget, vendor, or
   seating data runs. The param itself is UUID-validated first
   ([`wedding-access.ts:20,34`](../apps/api/src/middleware/wedding-access.ts)), so a malformed ID
   fails closed rather than reaching the join.
2. **The wedding ID scopes every query, not just the membership check.** Route handlers do not
   trust that passing the middleware means every subsequent query is safe: they repeat the filter.
   `guests.ts` alone conditions on `eq(guest.weddingId, weddingId)` at read, summary, bulk-RSVP, and
   single-guest lookups
   ([`routes/guests.ts:122,239,285`](../apps/api/src/routes/guests.ts)), so a guest ID that is valid
   but belongs to a different wedding still resolves to nothing rather than another couple's row.

Invites are the one path that crosses wedding boundaries by design, and that path is signed and
email-bound: `POST /accept-invite` verifies the token with `verifyMemberInviteToken`, then rejects
it if the token's email does not case-insensitively match the authenticated user's own email
([`routes/weddings.ts:488-497`](../apps/api/src/routes/weddings.ts)), which stops a guessed or
forwarded invite token from attaching a stranger's account to someone else's wedding.

## 4. Authentication and session model

Better Auth backs both apps, with two sign-in paths: email/password (12-character minimum, email
verification required before the account can act, waived only when `E2E_MODE` allows it for the
test harness) and Google OAuth, wired up only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
are both present in the environment
([`auth.ts:38-62`](../apps/api/src/auth.ts)).

The two apps do not trust the same session two different ways. `apps/app`'s route guard
(`beforeLoad` on `/_authenticated`,
[`routes/_authenticated.tsx:59-65`](../apps/app/src/routes/_authenticated.tsx)) is a UX
convenience: it redirects to `/login` before rendering a page the user cannot use. The actual
enforcement is server-side and per-request: `sessionMiddleware` calls `auth.api.getSession` against
the incoming cookie on every authenticated API call, rejects with `401` if there is no session, and
separately rejects with `403` if the account's email is not verified
([`middleware/session.ts:21-32`](../apps/api/src/middleware/session.ts)). A client that skipped or
patched the SPA's route guard gains nothing: the API re-checks the session itself.

## 5. CSRF, origin verification, and session cookies

Better Auth issues the session cookie with `SameSite=Lax`, and production sets the `__Secure-`
prefix; local dev over plain HTTP uses the bare cookie name
([`middleware/csrf.ts`](../apps/api/src/middleware/csrf.ts)). `SameSite=Lax` alone blocks most
cross-site POSTs, so the CSRF middleware (audit finding #27, above) is defense in depth for the
same-site case: every authenticated, state-changing request must carry an `Origin` or `Referer`
header matching the app allowlist, or it is rejected. GET/HEAD/OPTIONS pass through unchecked, and
public unauthenticated endpoints (RSVP, public wedding sites, webhooks) are exempt by design,
since they are either token-scoped or called by machines that never set an `Origin` header.

## 6. Rate limiting is a Durable Object, not an in-memory counter

`RateLimiter` (see [ARCHITECTURE.md](ARCHITECTURE.md) and
[`lib/rate-limit.ts`](../apps/api/src/lib/rate-limit.ts)) is a fixed-window counter shared across
every Worker isolate, keyed on `CF-Connecting-IP` rather than the client-spoofable
`X-Forwarded-For`. Budgets are per-endpoint: sign-in 10/min, public API 60/min, the public RSVP
endpoint 5/min (audit finding #22, above), and three others. An in-memory counter would reset per
isolate and undercount a distributed request burst; the Durable Object does not.

## 7. Payments: Stripe owns the card data

Checkout and the Customer Portal are both Stripe-hosted: `stripe.checkout.sessions.create` (or
`.createWithIdempotency`) and `stripe.billingPortal.sessions.create`
([`billing.ts:159,287-294`](../apps/api/src/routes/billing.ts)), with no embedded card element or
`Elements`/`PaymentElement` component anywhere in `apps/app`. Verified by reading the billing
routes, not assumed from the product category: this repository has no code path where a card
number, expiry, or CVC is submitted to a Kaiplan Worker at all; Stripe's hosted pages collect it
directly. Webhook events are verified with `stripe.webhooks.constructEventAsync` against the
`stripe-signature` header before anything in the payload is trusted
([`billing.ts:1472`](../apps/api/src/routes/billing.ts),
[`lib/stripe.ts`](../apps/api/src/lib/stripe.ts)). `docs/roadmap.md` Phase 5 additionally scoped
idempotent webhook processing for duplicate deliveries and server-side-only tier checks, so a
client cannot claim a plan it has not paid for.

## 8. Uploads: the Worker never touches the bytes

The full threat model is [`docs/image-upload-security-policy.md`](../docs/image-upload-security-policy.md),
kept in `docs/` rather than duplicated here because it is short and already precise. In summary:
the client requests a short-lived Cloudflare Images direct-upload URL from the API, uploads
straight to Cloudflare, and the Images API token never reaches the browser. Only `image/jpeg`,
`image/png`, `image/webp`, and `image/avif` intents are accepted (no SVG, PDF, HTML, or GIF),
which is also why there is no separate malware scanner: the accepted formats are raster images
transformed and served by Cloudflare's own pipeline, not arbitrary files a user could later
execute or serve back to another user.

## 9. Guest PII: what is stored, and what deletion actually exists

Guests never sign up for Kaiplan: a couple enters their name, and the record lives in the couple's
data from then on until someone removes it. The `guest` table stores first and last name, email,
phone, a free-text `dietaryNotes` field plus a `dietaryTags` array, and RSVP status
([`db/guest-schema.ts:24-32`](../apps/api/src/db/guest-schema.ts)). There is no dedicated
accessibility-notes column; an accessibility need would have to be entered into `dietaryNotes` or a
household's free-text fields, which is itself worth naming as a gap in a wedding-planning product:
a need that is not dietary gets no field of its own.

Deletion is real and works two ways, not one:

- **Per guest.** `DELETE /:weddingId/guests/:guestId`
  ([`routes/guests.ts:630`](../apps/api/src/routes/guests.ts)) hard-deletes the row (and, via a
  separate endpoint at [`guests.ts:711`](../apps/api/src/routes/guests.ts), an entire household),
  after removing the guest from any seating chart and RSVP token first so no orphaned reference is
  left behind.
- **Per wedding.** Every wedding-scoped table (guest, budget, checklist, vendor, seating, wedding
  website) declares its foreign key to `wedding.id` with `onDelete: "cascade"`
  ([`db/guest-schema.ts:19`](../apps/api/src/db/guest-schema.ts) and the equivalent line in each of
  `budget-schema.ts`, `checklist-schema.ts`, `seating-schema.ts`, `vendor-schema.ts`, and
  `wedding-website-schema.ts`), so deleting a wedding, the path audit finding #17 keeps open even
  on an otherwise read-only archived wedding, removes every guest's data with it in one
  transaction, not as a follow-up job that could be skipped.

What does not exist: an automatic retention or expiry policy. The five daily cron jobs
([ARCHITECTURE.md §4](ARCHITECTURE.md#4-the-cron-pipeline-and-why-it-is-serial)) clean up processed
webhook events, email operational data, and trial state; none of them touch guest records. A
wedding's guest list, including a declined guest's dietary notes, persists indefinitely unless a
member of that wedding deletes it by hand. That is a real gap, not a hedge: nothing in this tree
ages out or minimizes third-party PII on its own.

## 10. Bot and abuse protection on the one endpoint with no login

The public RSVP handler at [`wedding-website.ts:1450`](../apps/api/src/routes/wedding-website.ts)
has no session, since a declining guest has no account, so it leans on two other controls instead:
the IP-based Durable Object rate limiter above (audit finding #22) and a Cloudflare Turnstile
check.
This is the same handler discussed in the README's
[seating-chart integrity explanation](../README.md#seven-decisions-worth-explaining), for the same
reason: it is the one path into the product that no login guards.

## 11. Transport and response headers

Every response gets `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`),
`X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY`, applied in one middleware in
[`index.ts`](../apps/api/src/index.ts) rather than per-route, so a new route cannot ship without
them by omission. Errors are captured to Sentry with a scrubbed path and returned to the client only
as a correlation ID (`X-Kaiplan-Error-Id`) in production; raw error messages are suppressed in
production and surfaced only in development, per
[ARCHITECTURE.md §1](ARCHITECTURE.md#1-request-lifecycle).

## 12. Provenance of this document

Everything above is a description of what the code does, sourced from the code itself, not a claim
that a third party validated these controls.
