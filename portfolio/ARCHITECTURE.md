# Architecture

Kaiplan ran entirely on Cloudflare's edge: three Workers, two databases, one Durable Object. This
document explains how a request moves through the system and why the parts are shaped the way they
are.

> **Reading the API entry point.** The product was retired on 2026-06-11 (commit `b5372ed`), which
> replaced the Worker entry points with 410-Gone stubs. They were restored for this archive, so
> `apps/api/src/index.ts` is the real composition root again. If you are browsing a commit between
> `b5372ed` and the restore, use `git show b5372ed^:apps/api/src/index.ts` instead.

---

## 1. Request lifecycle

Every authenticated API request passes through six layers before a handler sees it. Order matters:
CORS must precede CSRF so preflights are answered before origin checks run, and rate limiting must
precede session lookup so an unauthenticated flood never reaches the database.

```mermaid
flowchart TD
    Req["Incoming request"] --> Env

    Env["validateEnv()<br/><i>index.ts:610</i>"]
    Env -->|invalid| Misconfig["500 Server misconfiguration<br/>+ Sentry errorId"]
    Env -->|valid| Sec

    Sec["Security headers<br/>CSP · HSTS · frame-deny<br/><i>index.ts:107</i>"] --> CORS

    CORS["CORS: per-path origin allowlist<br/><i>index.ts:230</i>"]
    CORS -.->|origin not allowed| Rej1["null origin"]
    CORS --> CSRF

    CSRF["csrfMiddleware: Origin verification<br/>public + webhook paths exempt<br/><i>middleware/csrf.ts</i>"]
    CSRF -.->|bad origin| Rej2["403"]
    CSRF --> RL

    RL["Rate limit: RateLimiter Durable Object<br/>keyed on CF-Connecting-IP<br/><i>index.ts:291-368</i>"]
    RL -.->|over budget| Rej3["429"]
    RL --> Sess

    Sess["requireSession<br/><i>middleware/session.ts</i>"]
    Sess -.->|no session| Rej4["401"]
    Sess --> Access

    Access["weddingAccessMiddleware<br/>joins member × wedding × subscription<br/><i>middleware/wedding-access.ts</i>"]
    Access -.->|not a member| Rej5["403"]
    Access --> Feature

    Feature["requireWeddingFeature: plan entitlement<br/><i>middleware/feature-gate.ts</i>"]
    Feature -.->|plan lacks feature| Rej6["402 / 403"]
    Feature --> Billing

    Billing["requireBillingAccess: trial expiry<br/><i>middleware/billing-gate.ts</i>"]
    Billing -.->|trial elapsed| Rej7["402"]
    Billing --> Handler

    Handler["Route handler<br/>zod safeParse + requireWriter"]
    Handler -.->|invalid body| Rej8["400 + field errors"]
    Handler -.->|role = viewer| Rej9["403"]
    Handler --> OK["200 / 201"]
```

Two details worth calling out:

**Errors carry a correlation ID.** A single `app.onError` captures the exception to Sentry with a
scrubbed path, then returns the Sentry event ID to the client in both the response body and an
`X-Kaiplan-Error-Id` header, exposed through CORS via `exposeHeaders`. A user reporting "it broke"
can quote an ID that maps to a stack trace. Error messages themselves are suppressed in production
and surfaced in development.

**Rate limits are per-endpoint, not global.** Six budgets: sign-in 10/min, sign-up 10/min,
forgot-password 5/min, change-password 5/min, auth catch-all 20/min, public API 60/min. The key
function deliberately prefers `CF-Connecting-IP` over the spoofable `X-Forwarded-For`.

**Routing is explicit, not implicit.** Route modules are factory functions mounted as sub-`Hono`
apps and dispatched by explicit URL rewriting rather than nested `app.route()` calls. Hono's trie
matches left-to-right, so `/:weddingId/website/*` has to be declared before `/:weddingId/*` or the
wildcard swallows it. Explicit dispatch makes that ordering visible instead of
load-bearing-but-invisible.

---

## 2. The three-layer permission model

A wedding is the tenant. Members hold one of three roles, and each role is enforced at a different
depth, because each layer catches a class of bug the others structurally cannot.

```mermaid
flowchart LR
    subgraph L1["Layer 1: Database"]
        direction TB
        CHK["CHECK constraint<br/><code>wedding_member_role_check</code><br/>role in (owner, editor, viewer)<br/><i>db/schema.ts:70-73</i>"]
    end

    subgraph L2["Layer 2: Route middleware"]
        direction TB
        MW["weddingAccessMiddleware<br/>UUID-validates :weddingId<br/>one JOIN → role + subscription status<br/>sets weddingRole on context"]
    end

    subgraph L3["Layer 3: Handler"]
        direction TB
        RW["requireWriter(c)<br/>rejects role = viewer<br/>36 call sites / 6 route modules"]
    end

    L1 --> L2 --> L3 --> H["Mutation proceeds"]

    CHK -.->|catches| B1["Bad migration or<br/>direct DB write"]
    MW -.->|catches| B2["Missing authz on a<br/>whole route tree"]
    RW -.->|catches| B3["Read-authorized user<br/>hitting a write endpoint"]
```

The middleware resolves membership, wedding, and the **owner's** subscription in a single join.
Entitlement follows the wedding owner, not the member making the request, so an invited editor
inherits the owner's plan rather than needing their own.

`requireWriter` is not shared: it is declared six times, once per route module, and the six copies
are identical. Extracting it is a five-minute change that never got made, and it is the kind of
duplication that stays harmless right up until one copy is edited and the others are not.

Above this sits an append-only `audit_log`, written best-effort via `recordAuditEventBestEffort` so
a logging failure never fails a user's request. It probes for table existence first, which keeps it
safe across migrations.

---

## 3. Two databases, on purpose

```mermaid
flowchart TB
    APIW["kaiplan-api Worker"]
    WEBW["kaiplan-web Worker"]

    APIW -->|HYPERDRIVE binding| HD["Cloudflare Hyperdrive<br/>connection pooling"]
    HD --> NEON[("Neon Postgres<br/>20 tables · 25 migrations<br/>transactional product data")]

    APIW -->|MARKETING_DB| D1[("Cloudflare D1: kaiplan-db<br/>9 tables · 14 migrations<br/>marketing + email preferences")]
    WEBW -->|DB| D1

    POOL["pg.Pool max: 1<br/>connectionTimeoutMillis: 15000<br/><i>db/client.ts:32-36</i>"]
    HD -.-> POOL

    style POOL fill:#ffe6e6,stroke:#c0392b,stroke-width:2px
```

**Postgres** holds everything transactional: weddings, members, guests, budget categories and items,
vendors with nested quotes and payments, checklist tasks, seating charts, subscriptions. It needs
real joins, foreign keys with cascade semantics, and `CHECK` constraints.

**D1** holds marketing signups, pricing clicks, survey responses, referrals, lead-magnet downloads,
and, critically, email preferences and unsubscribe tokens. Both the product Worker and the marketing
Worker bind the *same* D1 instance. That shared binding is the mechanism by which a transactional
product email honors an unsubscribe made from a marketing footer. Migrations live in
`apps/web/d1/migrations` and are referenced from both wrangler configs.

The `max: 1` pool is highlighted above because it is not incidental. It dictates the design of the
cron pipeline below.

---

## 4. The cron pipeline, and why it is serial

The API Worker runs five maintenance jobs daily at 03:00 UTC. They execute strictly in series.

```mermaid
flowchart LR
    T["cron: 0 3 * * *"] --> J1

    J1["cleanupOldProcessedEvents"] --> J2
    J2["cleanupOldEmailOperationalData"] --> J3
    J3["dispatchTrialEndingReminders"] --> J4
    J4["dispatchSignupLifecycleEmails"] --> J5
    J5["expireElapsedFreeTrials"] --> Done["ctx.waitUntil resolves"]

    J1 -.->|catch| S["captureApiException<br/>next job still runs"]
    J2 -.->|catch| S
    J3 -.->|catch| S
    J4 -.->|catch| S
    J5 -.->|catch| S
```

Every job is wrapped in `withDbRetry` (2 retries, transient failures only) and its own
`try`/`catch`, so one failure neither aborts the run nor silently skips the rest.

The serial ordering is a direct consequence of the connection pool. From
`apps/api/src/index.ts:653`:

> Run maintenance jobs sequentially. They share a single pg Pool (`max: 1`) backed by Hyperdrive, so
> concurrent execution causes the later jobs to time out waiting for the one connection. Each job is
> isolated so a single failure does not skip the others.

`withDbRetry` inspects both `error.message` and `error.cause.message`, because Drizzle wraps driver
errors one layer deep. A retry predicate reading only the top-level message would miss every
transient Hyperdrive failure.

The marketing Worker runs its own hourly cron for survey reminders, against D1, independently.

---

## 5. Package graph

```mermaid
flowchart BT
    SHARED["packages/shared<br/>53 zod schemas · plan matrix · domain enums"]
    KNOW["packages/knowledge<br/>offering + pricing source of truth"]
    MKT["packages/marketing<br/>Astro layouts · React islands · SEO"]
    MKTAPI["packages/marketing-api<br/>Hono app on D1"]
    PDF["packages/lead-magnet-pdf<br/>markdown → PDF"]

    API["apps/api<br/>Hono Worker"]
    APP["apps/app<br/>React SPA"]
    WEB["apps/web<br/>Astro site"]

    SHARED --> API
    SHARED --> APP
    SHARED --> WEB
    SHARED --> KNOW
    KNOW --> APP
    KNOW --> WEB
    MKT --> WEB
    MKTAPI --> WEB
    MKTAPI --> API
    PDF --> WEB
```

`packages/shared` is the spine. It owns the `BILLING_PLAN_FEATURES` matrix, so changing what a plan
includes propagates in one edit to the feature-gate middleware, the paywall UI, and the public
pricing page. They cannot drift, because they read the same constant.

Turborepo wires the build order: `build` and `test:coverage` both declare `dependsOn: ["^build"]`,
which is what forces `shared` to compile before anything that imports it.

---

## 6. Provenance and scope

- **The AI customer-support integration** was removed before this archive was published. Its route
  modules, nonce store, and vendored dependency are not in this tree.
- **Every infrastructure identifier is a placeholder**: Hyperdrive ID, D1 database ID, Sentry DSN,
  and Turnstile key alike, in every wrangler config. The configs are shaped correctly and pass the
  deploy validators, so a reader can inspect them safely; they need real values to deploy anywhere.
- **The seating editor keeps local optimistic state and flushes with a single `PUT`.** There was no
  websocket or SSE channel, no feature flags, and no i18n.
- Quality gates ran locally through husky hooks throughout development. See
  [TESTING.md](TESTING.md) for what that bought and what it cost.
