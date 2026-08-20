# Kaiplan — Auth + Dashboard Shell Design

First slice of the Kaiplan wedding planning SaaS. Establishes the monorepo, authentication, database schema, API layer, and dashboard shell that all future feature modules (budget, guests, vendors, seating) plug into.

## Monorepo Structure

```
kaiplan/
├── apps/
│   ├── app/                  # React + Vite SPA → my.kaiplan.app
│   └── api/                  # Hono Worker → api.kaiplan.app
├── packages/
│   └── shared/               # Shared types, constants, validation schemas (Zod)
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── .gitignore
```

- **`apps/app`** — Vite + React 19, TanStack Router, TanStack Query, Shadcn/UI, Tailwind 4. Deployed to Cloudflare Pages at `my.kaiplan.app`.
- **`apps/api`** — Hono on Cloudflare Workers at `api.kaiplan.app`. Drizzle + Neon via Hyperdrive. Better Auth server-side. Deployed with Wrangler.
- **`packages/shared`** — Zod schemas for API request/response types, shared constants (wedding roles, tier names), TypeScript types. Both `app` and `api` import from here.

The marketing site stays in `ideas-validation` for now. When ready to migrate, it becomes `apps/web`.

### Tooling

- **pnpm workspaces** + **Turborepo** for monorepo management
- Package names: `@kaiplan/app`, `@kaiplan/api`, `@kaiplan/shared`

## Database Schema

Neon Postgres via Drizzle ORM. Better Auth manages its own tables automatically.

### Better Auth tables (managed, not manually defined)

```
user              — id, name, email, emailVerified, image, createdAt, updatedAt
session           — id, userId, token, expiresAt, ipAddress, userAgent
account           — id, userId, providerId (email/google), providerAccountId
verification      — id, identifier, value, expiresAt
```

### Kaiplan tables

```sql
wedding
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  name            TEXT NOT NULL
  date            DATE
  budget_cents    INTEGER NOT NULL DEFAULT 0
  currency        TEXT NOT NULL DEFAULT 'USD'
  timezone        TEXT NOT NULL DEFAULT 'America/New_York'
  created_by      TEXT NOT NULL REFERENCES user(id)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()

wedding_member
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
  wedding_id      UUID NOT NULL REFERENCES wedding(id) ON DELETE CASCADE
  user_id         TEXT REFERENCES user(id)
  role            TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer'))
  invited_email   TEXT
  accepted_at     TIMESTAMPTZ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### Key decisions

- **`wedding_member.role`** — `owner` (created the wedding), `editor` (second planner on Pro tier), `viewer` (future: read-only for family).
- **`wedding_member.invited_email`** — allows inviting someone before they sign up. When they register with that email, they auto-join the wedding.
- **`budget_cents`** — integer, store money in cents to avoid floating point. Display formatting in the frontend.
- **Every future table** (guests, vendors, budget_items, seating) gets a `wedding_id` FK.
- Multi-wedding support from day one — a user can own/be a member of multiple weddings.

## Auth Flow

### Better Auth configuration

- Server-side plugin runs in the Hono API Worker
- Providers: email/password + Google OAuth
- Sessions stored in Neon (Better Auth's default session strategy)
- CORS configured to allow `my.kaiplan.app` → `api.kaiplan.app`

### Auth pages (Vite SPA)

| Route | Purpose |
|-------|---------|
| `/login` | Email/password form + "Continue with Google" button |
| `/signup` | Same form, creates account + redirects to onboarding |
| `/forgot-password` | Email input, sends reset link |
| `/reset-password` | New password form (accessed via token link) |

### Post-signup flow

1. User signs up → Better Auth creates user + session
2. Redirect to `/onboarding` — "Create your wedding" form (name, date, estimated budget)
3. Creates `wedding` + `wedding_member` (role: owner)
4. Redirect to `/dashboard`

### Session handling (frontend)

- TanStack Query hook (`useSession`) calls Better Auth's session endpoint
- Auth state drives the router — unauthenticated users redirected to `/login`
- TanStack Router `beforeLoad` guards on protected routes

### Wedding context

- After login, fetch user's weddings via API
- If one wedding → auto-select, store `wedding_id` in app state
- If multiple → show wedding picker (data model supports it now)
- All API calls include `wedding_id` as a path param or header

## API Layer

### Hono Worker structure

```
apps/api/src/
├── index.ts              # Worker entry, Hono app, Hyperdrive binding
├── auth.ts               # Better Auth instance + config
├── routes/
│   ├── auth.ts           # Mount Better Auth handler on /api/auth/*
│   ├── weddings.ts       # CRUD weddings, invite members
│   └── health.ts         # GET /api/health
├── middleware/
│   ├── session.ts        # Validate session, attach user to context
│   └── wedding-access.ts # Verify user is a member of the requested wedding
├── db/
│   ├── client.ts         # Drizzle + Neon via Hyperdrive
│   ├── schema.ts         # All table definitions
│   └── migrations/       # Drizzle-kit generated
└── lib/
    └── env.ts            # Typed env bindings (Hyperdrive, secrets)
```

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `*` | `/api/auth/*` | Better Auth handles all auth routes |
| `POST` | `/api/weddings` | Create a wedding (post-signup) |
| `GET` | `/api/weddings` | List user's weddings |
| `GET` | `/api/weddings/:id` | Get wedding details |
| `PATCH` | `/api/weddings/:id` | Update wedding (name, date, budget) |
| `POST` | `/api/weddings/:id/members` | Invite a member |
| `GET` | `/api/health` | Health check |

### Middleware chain

Every route except `/api/auth/*` and `/api/health` goes through `session` middleware (validates the Better Auth session, attaches user to context). Routes scoped to a specific wedding (`/api/weddings/:id/*`) additionally go through `wedding-access` middleware, which checks `wedding_member` to confirm the user has access. Unscoped routes like `POST /api/weddings` and `GET /api/weddings` only need session auth.

## Dashboard Shell (Vite SPA)

### Route tree (TanStack Router)

```
/login
/signup
/forgot-password
/reset-password
/onboarding              # Create your wedding (post-signup)
/dashboard               # Main dashboard home (wedding overview)
/budget                  # Placeholder — future slice
/guests                  # Placeholder — future slice
/vendors                 # Placeholder — future slice
/seating                 # Placeholder — future slice
/settings                # Account settings, wedding settings, manage members
```

### Sidebar nav

- Collapsible (icon-only when collapsed, icon + label when expanded)
- Items: Dashboard, Budget, Guests, Vendors, Seating, Settings
- Lucide icons for each item
- Active state highlighting based on current route
- Budget through Seating show "Coming soon" placeholder pages
- Collapse state persisted in localStorage

### Top bar (minimal)

- Wedding name on the left (clickable → wedding picker when multiple weddings exist)
- User avatar + dropdown on the right (Profile, Settings, Log out)

### Dashboard home (`/dashboard`)

- Welcome message with wedding name and date
- Countdown to wedding date
- Empty module cards: "Budget," "Guest List," "Vendors," "Seating" — each with a brief description and a disabled "Coming soon" state
- Becomes the real overview as modules are built

### Settings (`/settings`)

- Wedding details (edit name, date, budget)
- Manage members (invite editor, see current members, remove)
- Account (email, password change, connected Google account)

## Deployment & Infrastructure

### Cloudflare resources

| Resource | Purpose | Config |
|----------|---------|--------|
| Cloudflare Pages (`kaiplan-app`) | Vite SPA | Custom domain: `my.kaiplan.app` |
| Cloudflare Worker (`kaiplan-api`) | Hono API | Custom domain: `api.kaiplan.app`, Hyperdrive binding |
| Cloudflare Hyperdrive | Connection pooling to Neon | Bound to the API Worker |

### Neon setup

- Project: `kaiplan`
- Database: `kaiplan` (default branch `main`)
- Dev branch: `dev` for local development
- Connection string stored as Worker secret

### Environment variables / secrets (API Worker)

| Variable | Type | Purpose |
|----------|------|---------|
| `DATABASE_URL` | secret | Neon connection string (used by Hyperdrive) |
| `BETTER_AUTH_SECRET` | secret | Session signing secret |
| `BETTER_AUTH_URL` | var | `https://api.kaiplan.app` |
| `GOOGLE_CLIENT_ID` | secret | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | secret | Google OAuth |
| `APP_URL` | var | `https://my.kaiplan.app` (CORS + redirects) |

### Dev environment

- `wrangler dev` for the API Worker (local Hyperdrive connects to Neon dev branch)
- `vite dev` for the SPA (proxies API calls or hits local Worker)
- Neon branching: `dev` branch for local, `main` for production

### Deploy commands

```bash
turbo build                                    # Build all
pnpm --filter @kaiplan/app run deploy          # Deploy SPA to Pages
pnpm --filter @kaiplan/api run deploy          # Deploy Worker
```

## Design Constraints

- **Fonts:** Fraunces (headings) + DM Sans (body) — matching the marketing site brand
- **Colors:** Primary `#7C9A82`, Accent `#C5A55A`, Surface `#f8f8f6`, Text `#1f2937`, Muted `#8A8478` — from the validation site's `siteConfig.theme`
- **Shadcn/UI:** New York style, same as the validation site
- **No placeholder code** — every function fully implemented
- **No TODO/FIXME comments** — if it needs doing, do it now
- **No `any` types** — use proper types or `unknown` with narrowing
