# Auth + Dashboard Shell Implementation Plan

> Historical planning artifact. Current pricing, billing labels, trial length,
> and Stripe env keys are defined in `packages/shared`; do not use this plan as
> the current source of truth for commercial terms.


**Goal:** Scaffold the Kaiplan monorepo with auth (Better Auth + Google OAuth), Neon Postgres database, Hono API on Cloudflare Workers, and a Vite React SPA dashboard shell with TanStack Router.

**Architecture:** Monorepo with three packages — `apps/api` (Hono Worker), `apps/app` (Vite SPA), `packages/shared` (Zod schemas + types). The API serves as the auth + data layer, deployed to `api.kaiplan.app`. The SPA is a Cloudflare Pages site at `my.kaiplan.app`. Neon Postgres via Hyperdrive for connection pooling.

**Tech Stack:** Hono, Better Auth, Drizzle ORM, Neon Postgres, Cloudflare Workers/Pages/Hyperdrive, React 19, Vite, TanStack Router, TanStack Query, Shadcn/UI, Tailwind CSS 4, Turborepo, pnpm workspaces.

**Design Spec:** `docs/design-docs/specs/2026-04-07-auth-dashboard-shell-design.md`

**Brand:** Fonts: Fraunces (headings) + DM Sans (body). Colors: Primary `#7C9A82`, Accent `#C5A55A`, Surface `#f8f8f6`, Text `#1f2937`, Muted `#8A8478`. Shadcn/UI New York style.

---

## File Structure

```
kaiplan/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── index.ts                # Worker entry point, Hono app
│   │   │   ├── auth.ts                 # Better Auth instance + config
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts             # Mount Better Auth on /api/auth/*
│   │   │   │   ├── weddings.ts         # Wedding CRUD + member invite
│   │   │   │   └── health.ts           # GET /api/health
│   │   │   ├── middleware/
│   │   │   │   ├── session.ts          # Validate session, attach user
│   │   │   │   └── wedding-access.ts   # Verify wedding membership
│   │   │   ├── db/
│   │   │   │   ├── client.ts           # Drizzle + Neon via Hyperdrive
│   │   │   │   └── schema.ts           # wedding + wedding_member tables
│   │   │   └── lib/
│   │   │       └── env.ts              # Typed Worker bindings
│   │   ├── __tests__/                  # Vitest tests for API
│   │   │   ├── routes/
│   │   │   │   ├── health.test.ts
│   │   │   │   └── weddings.test.ts
│   │   │   └── middleware/
│   │   │       ├── session.test.ts
│   │   │       └── wedding-access.test.ts
│   │   ├── vitest.config.ts
│   │   ├── drizzle.config.ts           # Drizzle-kit migration config
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.toml
│   └── app/
│       ├── src/
│       │   ├── main.tsx                # React entry point
│       │   ├── router.tsx              # TanStack Router creation + auth context
│       │   ├── lib/
│       │   │   ├── auth-client.ts      # Better Auth React client
│       │   │   ├── api.ts              # Fetch wrapper for API calls
│       │   │   └── query-client.ts     # TanStack Query client
│       │   ├── hooks/
│       │   │   ├── use-session.ts      # Auth session hook
│       │   │   └── use-weddings.ts     # Wedding list/select hooks
│       │   ├── components/
│       │   │   ├── ui/                 # Shadcn/UI components (auto-generated)
│       │   │   ├── sidebar.tsx         # Collapsible sidebar nav
│       │   │   ├── top-bar.tsx         # Top bar with wedding name + user menu
│       │   │   ├── user-menu.tsx       # Avatar + dropdown
│       │   │   ├── wedding-picker.tsx  # Wedding selector dropdown
│       │   │   └── module-card.tsx     # Dashboard "coming soon" card
│       │   ├── routes/
│       │   │   ├── __root.tsx          # Root layout
│       │   │   ├── login.tsx
│       │   │   ├── signup.tsx
│       │   │   ├── forgot-password.tsx
│       │   │   ├── reset-password.tsx
│       │   │   ├── _authenticated.tsx  # Auth guard layout
│       │   │   ├── _authenticated/
│       │   │   │   ├── onboarding.tsx
│       │   │   │   ├── dashboard.tsx
│       │   │   │   ├── budget.tsx
│       │   │   │   ├── guests.tsx
│       │   │   │   ├── vendors.tsx
│       │   │   │   ├── seating.tsx
│       │   │   │   └── settings.tsx
│       │   │   └── index.tsx           # Redirect / → /dashboard
│       │   └── styles/
│       │       └── globals.css         # Tailwind + brand tokens
│       ├── index.html
│       ├── vite.config.ts
│       ├── components.json             # Shadcn/UI config
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── index.ts                # Re-exports
│       │   ├── schemas.ts             # Zod schemas for API types
│       │   ├── constants.ts           # Wedding roles, tier names
│       │   └── types.ts               # Inferred TypeScript types
│       ├── __tests__/
│       │   └── schemas.test.ts         # Schema validation tests
│       ├── vitest.config.ts
│       ├── package.json
│       └── tsconfig.json
├── scripts/
│   ├── run-affected-checks.ts          # Pre-commit: detect affected packages
│   ├── lib/
│   │   └── affected-packages.ts        # Core logic (pure, testable)
│   └── vitest.config.ts
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── .prettierrc.json
├── .lintstagedrc.json
├── .gitignore
└── CLAUDE.md
```

---

## Task 1: Monorepo Scaffold

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `CLAUDE.md`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/types.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/app/package.json`
- Create: `apps/app/tsconfig.json`

- [ ] **Step 1: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 3: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
.turbo/
.wrangler/
.env
.env.local
*.log
.DS_Store
```

- [ ] **Step 5: Create CLAUDE.md**

```markdown
# CLAUDE.md — Kaiplan

This file provides guidance to Claude Code when working in this repository.

## Project Overview

**Kaiplan** (kaiplan.app) is a wedding planning SaaS. This repo contains the product application — dashboard, API, and shared packages. The marketing/validation site lives separately in the `ideas-validation` monorepo.

Pricing tiers: Starter $20/mo, Pro $35/mo, Lifetime $100.

## Monorepo Structure

- `apps/app` — React + Vite SPA (TanStack Router, TanStack Query, Shadcn/UI, Tailwind 4). Deployed to Cloudflare Pages at `my.kaiplan.app`.
- `apps/api` — Hono on Cloudflare Workers at `api.kaiplan.app`. Drizzle ORM + Neon Postgres via Hyperdrive. Better Auth.
- `packages/shared` — Zod schemas, constants, TypeScript types shared between app and api.

Package names: `@kaiplan/app`, `@kaiplan/api`, `@kaiplan/shared`.

## Tech Stack

- **Frontend:** React 19, Vite, TanStack Router (file-based), TanStack Query, Shadcn/UI (New York style), Tailwind CSS 4, Lucide React
- **Backend:** Hono, Better Auth (email/password + Google OAuth), Drizzle ORM, Neon Postgres
- **Infrastructure:** Cloudflare Workers, Cloudflare Pages, Cloudflare Hyperdrive
- **Tooling:** pnpm workspaces, Turborepo, TypeScript

## Commands
```

pnpm install # Install all dependencies
turbo build # Build all packages
turbo dev # Dev all packages
turbo typecheck # Typecheck all packages
pnpm --filter @kaiplan/app dev # Dev the SPA
pnpm --filter @kaiplan/api dev # Dev the API Worker
pnpm --filter @kaiplan/api run db:generate # Generate Drizzle migration
pnpm --filter @kaiplan/api run db:migrate # Apply migration to Neon
pnpm --filter @kaiplan/app run deploy # Deploy SPA to Cloudflare Pages
pnpm --filter @kaiplan/api run deploy # Deploy API Worker

```

## Brand

- **Fonts:** Fraunces (headings), DM Sans (body)
- **Colors:** Primary `#7C9A82`, Accent `#C5A55A`, Surface `#f8f8f6`, Text `#1f2937`, Muted `#8A8478`

## Workflow

- **Git worktree is required** — all development work must be done in a worktree, never directly on main/default branches
- **Sub-agent driven development** — use the `subagent-driven-development` skill to parallelize independent implementation tasks
- **Pre-merge review** — before merging a worktree back to master, spin up a review agent using `requesting-code-review`. Fix every issue the reviewer flags, then merge

## Quality Gates

- **No placeholder code.** Every function must be fully implemented.
- **No TODO/FIXME/HACK comments.** If it needs doing, do it now.
- **No `any` type in TypeScript.** Use proper types or `unknown` with narrowing.
- **No `eslint-disable` without explanation.** Fix the lint error instead.

### Test-Driven Development (TDD) — MANDATORY

Every task follows this cycle. No exceptions:
1. **Write the failing test first.** The test must define expected behavior before any implementation exists.
2. **Run the test. Confirm it fails.** If it passes, your test is wrong.
3. **Write the minimal implementation** to make the test pass.
4. **Run the test. Confirm it passes.**
5. **Refactor** if needed, re-run tests to confirm still green.

### Coverage Requirements
- **95% code coverage minimum on every file you touch.** Not the repo average — each individual file.
- React route components (`.tsx` files in `routes/`) are excluded from coverage.
- API package: `pnpm --filter @kaiplan/api test:coverage`
- Shared package: `pnpm --filter @kaiplan/shared test:coverage`
- If a file drops below 95%, you are not done. Write more tests.

## Pre-Commit Hooks

Two-layer smart hook system runs on every commit:

1. **lint-staged** (file-level) — ESLint `--fix` + Prettier `--write` on staged `.ts/.tsx/.js/.mjs` files
2. **affected-packages** (package-level) — detects which workspace packages have staged changes, runs `turbo typecheck test:coverage` only for those packages

To bypass hooks in emergencies: `git commit --no-verify` (but fix the issue promptly).

## Execution Expectations

Work end-to-end without pausing for progress check-ins. Do not stop after completing a batch to ask "ready for feedback?" or "should I continue?". Execute the full plan autonomously. Asking clarifying questions about requirements is still expected.

## Founder Context

**Angel Campa** — Principal SDET, building Kaiplan as a validated SaaS product.
- Do not claim domain expertise in wedding planning when writing copy
- Write from the builder perspective: "we built Kaiplan because..."
- Never fabricate credentials, testimonials, or industry experience
```

- [ ] **Step 6: Create packages/shared/package.json**

```json
{
  "name": "@kaiplan/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24"
  },
  "devDependencies": {
    "typescript": "^5.7"
  }
}
```

- [ ] **Step 7: Create packages/shared/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 8: Create packages/shared/src/constants.ts**

```typescript
export const WEDDING_ROLES = ["owner", "editor", "viewer"] as const;
export type WeddingRole = (typeof WEDDING_ROLES)[number];

export const PRICING_TIERS = ["starter", "pro", "lifetime"] as const;
export type PricingTier = (typeof PRICING_TIERS)[number];
```

- [ ] **Step 9: Create packages/shared/src/schemas.ts**

```typescript
import { z } from "zod";
import { WEDDING_ROLES } from "./constants";

export const createWeddingSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().nullable(),
  budgetCents: z.number().int().min(0).default(0),
  currency: z.string().default("USD"),
  timezone: z.string().default("America/New_York"),
});

export const updateWeddingSchema = createWeddingSchema.partial();

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]),
});

export type CreateWeddingInput = z.infer<typeof createWeddingSchema>;
export type UpdateWeddingInput = z.infer<typeof updateWeddingSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
```

- [ ] **Step 10: Create packages/shared/src/types.ts**

```typescript
import type { WeddingRole } from "./constants";

export interface Wedding {
  id: string;
  name: string;
  date: string | null;
  budgetCents: number;
  currency: string;
  timezone: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeddingMember {
  id: string;
  weddingId: string;
  userId: string | null;
  role: WeddingRole;
  invitedEmail: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface WeddingWithRole extends Wedding {
  role: WeddingRole;
}
```

- [ ] **Step 11: Create packages/shared/src/index.ts**

```typescript
export * from "./constants";
export * from "./schemas";
export * from "./types";
```

- [ ] **Step 12: Create apps/api/package.json**

```json
{
  "name": "@kaiplan/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run --outdir dist",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@kaiplan/shared": "workspace:*",
    "@neondatabase/serverless": "^0.10",
    "better-auth": "^1.2",
    "drizzle-orm": "^0.38",
    "hono": "^4",
    "zod": "^3.24"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4",
    "drizzle-kit": "^0.30",
    "typescript": "^5.7",
    "wrangler": "^4"
  }
}
```

- [ ] **Step 13: Create apps/api/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["@cloudflare/workers-types"],
    "jsx": "react-jsx",
    "lib": ["ES2022"]
  },
  "include": ["src"]
}
```

- [ ] **Step 14: Create apps/app/package.json**

```json
{
  "name": "@kaiplan/app",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "vite build && wrangler pages deploy dist --project-name kaiplan-app",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@kaiplan/shared": "workspace:*",
    "@tanstack/react-query": "^5",
    "@tanstack/react-router": "^1",
    "better-auth": "^1.2",
    "lucide-react": "^0.460",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@tanstack/router-plugin": "^1",
    "@tailwindcss/vite": "^4",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^4",
    "typescript": "^5.7",
    "vite": "^6",
    "wrangler": "^4"
  }
}
```

- [ ] **Step 15: Create apps/app/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 16: Run pnpm install**

Run: `pnpm install`
Expected: All dependencies installed, lockfile generated.

- [ ] **Step 17: Verify typecheck passes**

Run: `turbo typecheck`
Expected: All three packages pass.

- [ ] **Step 18: Commit**

```bash
git add .
git commit -m "feat: scaffold monorepo with shared package, app, and api stubs"
```

---

## Task 2: API — Database Schema + Drizzle Config

**Files:**

- Create: `apps/api/src/lib/env.ts`
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/wrangler.toml`
- Create: `apps/api/.dev.vars.example`

- [ ] **Step 1: Create apps/api/wrangler.toml**

```toml
name = "kaiplan-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[vars]
BETTER_AUTH_URL = "https://api.kaiplan.app"
APP_URL = "https://my.kaiplan.app"

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "" # Fill after creating Hyperdrive config: wrangler hyperdrive create kaiplan-db --connection-string="..."
```

- [ ] **Step 2: Create apps/api/.dev.vars.example**

```
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/kaiplan?sslmode=require
BETTER_AUTH_SECRET=generate-a-random-32-char-string
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

- [ ] **Step 3: Create apps/api/src/lib/env.ts**

```typescript
export interface Env {
  HYPERDRIVE: Hyperdrive;
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}
```

- [ ] **Step 4: Create apps/api/src/db/schema.ts**

```typescript
import {
  pgTable,
  uuid,
  text,
  date,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const wedding = pgTable("wedding", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  date: date("date"),
  budgetCents: integer("budget_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const weddingMember = pgTable("wedding_member", {
  id: uuid("id").defaultRandom().primaryKey(),
  weddingId: uuid("wedding_id")
    .notNull()
    .references(() => wedding.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  role: text("role").notNull().$type<"owner" | "editor" | "viewer">(),
  invitedEmail: text("invited_email"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 5: Create apps/api/src/db/client.ts**

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle({ client: sql, schema });
}

export type Database = ReturnType<typeof createDb>;
```

- [ ] **Step 6: Create apps/api/drizzle.config.ts**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add database schema, Drizzle config, and Worker bindings"
```

---

## Task 3: API — Better Auth Setup

**Files:**

- Create: `apps/api/src/auth.ts`
- Create: `apps/api/src/routes/auth.ts`

- [ ] **Step 1: Create apps/api/src/auth.ts**

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "./db/client";

export function createAuth(
  db: Database,
  env: {
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    APP_URL: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
  },
) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.APP_URL],
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 2: Create apps/api/src/routes/auth.ts**

```typescript
import { Hono } from "hono";
import type { Env } from "../lib/env";
import type { Auth } from "../auth";

export function authRoutes(auth: Auth) {
  const app = new Hono<{ Bindings: Env }>();

  app.on(["POST", "GET"], "/*", (c) => {
    return auth.handler(c.req.raw);
  });

  return app;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/auth.ts apps/api/src/routes/auth.ts
git commit -m "feat(api): configure Better Auth with email/password and Google OAuth"
```

---

## Task 4: API — Session Middleware + Wedding Access Middleware

**Files:**

- Create: `apps/api/src/middleware/session.ts`
- Create: `apps/api/src/middleware/wedding-access.ts`

- [ ] **Step 1: Create apps/api/src/middleware/session.ts**

```typescript
import { createMiddleware } from "hono/factory";
import type { Env } from "../lib/env";
import type { Auth } from "../auth";

type SessionUser = {
  id: string;
  email: string;
  name: string;
};

type SessionVariables = {
  user: SessionUser;
};

export function sessionMiddleware(auth: Auth) {
  return createMiddleware<{
    Bindings: Env;
    Variables: SessionVariables;
  }>(async (c, next) => {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });

    await next();
  });
}
```

- [ ] **Step 2: Create apps/api/src/middleware/wedding-access.ts**

```typescript
import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import { weddingMember } from "../db/schema";

type WeddingAccessVariables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

export function weddingAccessMiddleware(db: Database) {
  return createMiddleware<{
    Bindings: Env;
    Variables: WeddingAccessVariables;
  }>(async (c, next) => {
    const weddingId = c.req.param("weddingId");
    const user = c.get("user");

    if (!weddingId) {
      return c.json({ error: "Wedding ID required" }, 400);
    }

    const member = await db
      .select()
      .from(weddingMember)
      .where(
        and(
          eq(weddingMember.weddingId, weddingId),
          eq(weddingMember.userId, user.id),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!member) {
      return c.json({ error: "Not a member of this wedding" }, 403);
    }

    c.set("weddingRole", member.role as "owner" | "editor" | "viewer");
    await next();
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middleware/
git commit -m "feat(api): add session and wedding-access middleware"
```

---

## Task 5: API — Wedding Routes + Health

**Files:**

- Create: `apps/api/src/routes/weddings.ts`
- Create: `apps/api/src/routes/health.ts`

- [ ] **Step 1: Create apps/api/src/routes/health.ts**

```typescript
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export { app as healthRoutes };
```

- [ ] **Step 2: Create apps/api/src/routes/weddings.ts**

```typescript
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import {
  createWeddingSchema,
  updateWeddingSchema,
  inviteMemberSchema,
} from "@kaiplan/shared";
import type { Env } from "../lib/env";
import type { Database } from "../db/client";
import type { Auth } from "../auth";
import { wedding, weddingMember } from "../db/schema";
import { sessionMiddleware } from "../middleware/session";
import { weddingAccessMiddleware } from "../middleware/wedding-access";

type Variables = {
  user: { id: string; email: string; name: string };
  weddingRole: "owner" | "editor" | "viewer";
};

export function weddingRoutes(db: Database, auth: Auth) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  const requireSession = sessionMiddleware(auth);
  const requireWeddingAccess = weddingAccessMiddleware(db);

  // List user's weddings
  app.get("/", requireSession, async (c) => {
    const user = c.get("user");

    const rows = await db
      .select({
        id: wedding.id,
        name: wedding.name,
        date: wedding.date,
        budgetCents: wedding.budgetCents,
        currency: wedding.currency,
        timezone: wedding.timezone,
        createdBy: wedding.createdBy,
        createdAt: wedding.createdAt,
        updatedAt: wedding.updatedAt,
        role: weddingMember.role,
      })
      .from(weddingMember)
      .innerJoin(wedding, eq(weddingMember.weddingId, wedding.id))
      .where(eq(weddingMember.userId, user.id));

    return c.json(rows);
  });

  // Create a wedding
  app.post("/", requireSession, async (c) => {
    const user = c.get("user");
    const body = await c.req.json();
    const parsed = createWeddingSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [newWedding] = await db
      .insert(wedding)
      .values({
        name: parsed.data.name,
        date: parsed.data.date,
        budgetCents: parsed.data.budgetCents,
        currency: parsed.data.currency,
        timezone: parsed.data.timezone,
        createdBy: user.id,
      })
      .returning();

    await db.insert(weddingMember).values({
      weddingId: newWedding.id,
      userId: user.id,
      role: "owner",
      acceptedAt: new Date(),
    });

    return c.json(newWedding, 201);
  });

  // Get wedding details
  app.get("/:weddingId", requireSession, requireWeddingAccess, async (c) => {
    const weddingId = c.req.param("weddingId");

    const [row] = await db
      .select()
      .from(wedding)
      .where(eq(wedding.id, weddingId))
      .limit(1);

    if (!row) {
      return c.json({ error: "Wedding not found" }, 404);
    }

    return c.json(row);
  });

  // Update wedding
  app.patch("/:weddingId", requireSession, requireWeddingAccess, async (c) => {
    const weddingId = c.req.param("weddingId");
    const role = c.get("weddingRole");

    if (role === "viewer") {
      return c.json({ error: "Viewers cannot edit weddings" }, 403);
    }

    const body = await c.req.json();
    const parsed = updateWeddingSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: parsed.error.flatten() }, 400);
    }

    const [updated] = await db
      .update(wedding)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(wedding.id, weddingId))
      .returning();

    return c.json(updated);
  });

  // Invite a member
  app.post(
    "/:weddingId/members",
    requireSession,
    requireWeddingAccess,
    async (c) => {
      const weddingId = c.req.param("weddingId");
      const role = c.get("weddingRole");

      if (role !== "owner") {
        return c.json({ error: "Only owners can invite members" }, 403);
      }

      const body = await c.req.json();
      const parsed = inviteMemberSchema.safeParse(body);

      if (!parsed.success) {
        return c.json({ error: parsed.error.flatten() }, 400);
      }

      const existing = await db
        .select()
        .from(weddingMember)
        .where(
          and(
            eq(weddingMember.weddingId, weddingId),
            eq(weddingMember.invitedEmail, parsed.data.email),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (existing) {
        return c.json({ error: "Member already invited" }, 409);
      }

      const [member] = await db
        .insert(weddingMember)
        .values({
          weddingId,
          invitedEmail: parsed.data.email,
          role: parsed.data.role,
        })
        .returning();

      return c.json(member, 201);
    },
  );

  return app;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/
git commit -m "feat(api): add wedding CRUD, member invite, and health routes"
```

---

## Task 6: API — Worker Entry Point

**Files:**

- Create: `apps/api/src/index.ts`

- [ ] **Step 1: Create apps/api/src/index.ts**

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/env";
import { createDb } from "./db/client";
import { createAuth } from "./auth";
import { authRoutes } from "./routes/auth";
import { weddingRoutes } from "./routes/weddings";
import { healthRoutes } from "./routes/health";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.APP_URL;
      if (origin === allowed) return origin;
      return null;
    },
    credentials: true,
  }),
);

app.route("/api/health", healthRoutes);

app.all("/api/auth/*", (c) => {
  const db = createDb(c.env.HYPERDRIVE.connectionString);
  const auth = createAuth(db, c.env);
  return auth.handler(c.req.raw);
});

app.route(
  "/api/weddings",
  (() => {
    const router = new Hono<{ Bindings: Env }>();
    router.all("/*", (c) => {
      const db = createDb(c.env.HYPERDRIVE.connectionString);
      const auth = createAuth(db, c.env);
      const routes = weddingRoutes(db, auth);
      return routes.fetch(c.req.raw, c.env);
    });
    return router;
  })(),
);

export default app;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm --filter @kaiplan/api typecheck`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): wire up Worker entry point with CORS, auth, and wedding routes"
```

---

## Task 7: App — Vite + TanStack Router + Tailwind Setup

**Files:**

- Create: `apps/app/index.html`
- Create: `apps/app/vite.config.ts`
- Create: `apps/app/src/styles/globals.css`
- Create: `apps/app/src/main.tsx`
- Create: `apps/app/src/router.tsx`
- Create: `apps/app/src/lib/query-client.ts`
- Create: `apps/app/src/lib/auth-client.ts`
- Create: `apps/app/src/lib/api.ts`
- Create: `apps/app/src/routes/__root.tsx`
- Create: `apps/app/src/routes/index.tsx`

- [ ] **Step 1: Create apps/app/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kaiplan</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create apps/app/vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [tanstackRouter(), react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 3: Create apps/app/src/styles/globals.css**

```css
@import "tailwindcss";

@theme {
  --color-primary: #7c9a82;
  --color-accent: #c5a55a;
  --color-surface: #f8f8f6;
  --color-foreground: #1f2937;
  --color-muted: #8a8478;

  --font-heading: "Fraunces", serif;
  --font-body: "DM Sans", sans-serif;
}

body {
  font-family: var(--font-body);
  color: var(--color-foreground);
  background-color: var(--color-surface);
}

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: var(--font-heading);
}
```

- [ ] **Step 4: Create apps/app/src/lib/query-client.ts**

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});
```

- [ ] **Step 5: Create apps/app/src/lib/auth-client.ts**

```typescript
import { createAuthClient } from "better-auth/react";

const baseURL = import.meta.env.VITE_API_URL ?? "";

export const authClient = createAuthClient({
  baseURL: baseURL ? `${baseURL}/api/auth` : "/api/auth",
});
```

- [ ] **Step 6: Create apps/app/src/lib/api.ts**

```typescript
const BASE_URL = import.meta.env.VITE_API_URL ?? "";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? "Request failed");
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

- [ ] **Step 7: Create apps/app/src/router.tsx**

```tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export interface AuthContext {
  isAuthenticated: boolean;
  user: { id: string; name: string; email: string } | null;
}

export const router = createRouter({
  routeTree,
  context: {
    auth: {
      isAuthenticated: false,
      user: null,
    },
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 8: Create apps/app/src/routes/\_\_root.tsx**

```tsx
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { AuthContext } from "../router";

interface RouterContext {
  auth: AuthContext;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
});
```

- [ ] **Step 9: Create apps/app/src/routes/index.tsx**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
```

- [ ] **Step 10: Create apps/app/src/main.tsx**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./lib/query-client";
import { router } from "./router";
import { authClient } from "./lib/auth-client";
import "./styles/globals.css";

function App() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <RouterProvider
      router={router}
      context={{
        auth: {
          isAuthenticated: !!session?.user,
          user: session?.user
            ? {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
              }
            : null,
        },
      }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 11: Verify dev server starts**

Run: `pnpm --filter @kaiplan/app dev`
Expected: Vite dev server starts on port 3000 without errors.

- [ ] **Step 12: Commit**

```bash
git add apps/app/
git commit -m "feat(app): set up Vite, TanStack Router, TanStack Query, Tailwind, and auth client"
```

---

## Task 8: App — Auth Pages (Login, Signup, Forgot/Reset Password)

**Files:**

- Create: `apps/app/src/routes/login.tsx`
- Create: `apps/app/src/routes/signup.tsx`
- Create: `apps/app/src/routes/forgot-password.tsx`
- Create: `apps/app/src/routes/reset-password.tsx`

- [ ] **Step 1: Create apps/app/src/routes/login.tsx**

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await authClient.signIn.email({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message ?? "Sign in failed");
      return;
    }

    navigate({ to: "/dashboard" });
  }

  async function handleGoogle() {
    await authClient.signIn.social({ provider: "google" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-semibold text-foreground">
            Welcome back
          </h1>
          <p className="mt-2 text-muted">Sign in to your Kaiplan account</p>
        </div>

        <button
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-foreground/10 bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-foreground/5"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-foreground/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-2 text-muted">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Don't have an account?{" "}
          <Link to="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create apps/app/src/routes/signup.tsx**

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await authClient.signUp.email({
      name,
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message ?? "Sign up failed");
      return;
    }

    navigate({ to: "/onboarding" });
  }

  async function handleGoogle() {
    await authClient.signIn.social({ provider: "google" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-semibold text-foreground">
            Create your account
          </h1>
          <p className="mt-2 text-muted">Start planning your wedding</p>
        </div>

        <button
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-foreground/10 bg-white px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-foreground/5"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-foreground/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-surface px-2 text-muted">or</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-foreground"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create apps/app/src/routes/forgot-password.tsx**

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await authClient.forgetPassword({
      email,
      redirectTo: "/reset-password",
    });

    setLoading(false);

    if (authError) {
      setError(authError.message ?? "Failed to send reset email");
      return;
    }

    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-semibold text-foreground">
            Reset your password
          </h1>
          <p className="mt-2 text-muted">
            We'll send you a link to reset your password
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm text-foreground">
            Check your email for a password reset link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-foreground"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-muted">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create apps/app/src/routes/reset-password.tsx**

```tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await authClient.resetPassword({
      newPassword: password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message ?? "Failed to reset password");
      return;
    }

    navigate({ to: "/login" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-semibold text-foreground">
            Set new password
          </h1>
          <p className="mt-2 text-muted">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/routes/login.tsx apps/app/src/routes/signup.tsx apps/app/src/routes/forgot-password.tsx apps/app/src/routes/reset-password.tsx
git commit -m "feat(app): add login, signup, forgot-password, and reset-password pages"
```

---

## Task 9: App — Authenticated Layout + Session Hook

**Files:**

- Create: `apps/app/src/hooks/use-session.ts`
- Create: `apps/app/src/hooks/use-weddings.ts`
- Create: `apps/app/src/routes/_authenticated.tsx`

- [ ] **Step 1: Create apps/app/src/hooks/use-session.ts**

```typescript
import { authClient } from "../lib/auth-client";

export function useSession() {
  return authClient.useSession();
}
```

- [ ] **Step 2: Create apps/app/src/hooks/use-weddings.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { WeddingWithRole, CreateWeddingInput } from "@kaiplan/shared";

export function useWeddings() {
  return useQuery<WeddingWithRole[]>({
    queryKey: ["weddings"],
    queryFn: () => apiFetch("/api/weddings"),
  });
}

export function useCreateWedding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWeddingInput) =>
      apiFetch("/api/weddings", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weddings"] });
    },
  });
}
```

- [ ] **Step 3: Create apps/app/src/routes/\_authenticated.tsx**

```tsx
import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => <Outlet />,
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/app/src/hooks/ apps/app/src/routes/_authenticated.tsx
git commit -m "feat(app): add auth guard layout and session/wedding hooks"
```

---

## Task 10: App — Sidebar, Top Bar, and Dashboard Layout

**Files:**

- Create: `apps/app/src/components/sidebar.tsx`
- Create: `apps/app/src/components/top-bar.tsx`
- Create: `apps/app/src/components/user-menu.tsx`
- Create: `apps/app/src/components/wedding-picker.tsx`
- Create: `apps/app/src/components/module-card.tsx`

- [ ] **Step 1: Create apps/app/src/components/sidebar.tsx**

```tsx
import { useState, useEffect } from "react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  Users,
  Store,
  Armchair,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/guests", label: "Guests", icon: Users },
  { to: "/vendors", label: "Vendors", icon: Store },
  { to: "/seating", label: "Seating", icon: Armchair },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });
  const matchRoute = useMatchRoute();

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <aside
      className={`flex h-screen flex-col border-r border-foreground/10 bg-white transition-all ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed && (
          <span className="font-heading text-lg font-semibold text-primary">
            Kaiplan
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-lg p-1.5 text-muted transition hover:bg-foreground/5 hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = !!matchRoute({ to, fuzzy: true });

          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted hover:bg-foreground/5 hover:text-foreground"
              } ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create apps/app/src/components/user-menu.tsx**

```tsx
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, User } from "lucide-react";
import { authClient } from "../lib/auth-client";

interface UserMenuProps {
  user: { name: string; email: string };
}

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    await authClient.signOut();
    navigate({ to: "/login" });
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-white"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-56 rounded-lg border border-foreground/10 bg-white py-1 shadow-lg">
          <div className="border-b border-foreground/10 px-4 py-2">
            <p className="text-sm font-medium text-foreground">{user.name}</p>
            <p className="text-xs text-muted">{user.email}</p>
          </div>

          <button
            onClick={() => {
              setOpen(false);
              navigate({ to: "/settings" });
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-foreground/5"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>

          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create apps/app/src/components/wedding-picker.tsx**

```tsx
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import type { WeddingWithRole } from "@kaiplan/shared";

interface WeddingPickerProps {
  weddings: WeddingWithRole[];
  activeWeddingId: string;
  onSelect: (weddingId: string) => void;
}

export function WeddingPicker({
  weddings,
  activeWeddingId,
  onSelect,
}: WeddingPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = weddings.find((w) => w.id === activeWeddingId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (weddings.length <= 1) {
    return (
      <span className="font-heading text-lg font-semibold text-foreground">
        {active?.name ?? "My Wedding"}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 font-heading text-lg font-semibold text-foreground hover:text-primary"
      >
        {active?.name ?? "My Wedding"}
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-64 rounded-lg border border-foreground/10 bg-white py-1 shadow-lg">
          {weddings.map((w) => (
            <button
              key={w.id}
              onClick={() => {
                onSelect(w.id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-foreground/5 ${
                w.id === activeWeddingId
                  ? "bg-primary/10 text-primary"
                  : "text-foreground"
              }`}
            >
              <span>{w.name}</span>
              <span className="text-xs text-muted">{w.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create apps/app/src/components/top-bar.tsx**

```tsx
import type { WeddingWithRole } from "@kaiplan/shared";
import { WeddingPicker } from "./wedding-picker";
import { UserMenu } from "./user-menu";

interface TopBarProps {
  user: { name: string; email: string };
  weddings: WeddingWithRole[];
  activeWeddingId: string;
  onSelectWedding: (weddingId: string) => void;
}

export function TopBar({
  user,
  weddings,
  activeWeddingId,
  onSelectWedding,
}: TopBarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-foreground/10 bg-white px-4">
      <WeddingPicker
        weddings={weddings}
        activeWeddingId={activeWeddingId}
        onSelect={onSelectWedding}
      />
      <UserMenu user={user} />
    </header>
  );
}
```

- [ ] **Step 5: Create apps/app/src/components/module-card.tsx**

```tsx
import type { LucideIcon } from "lucide-react";

interface ModuleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export function ModuleCard({
  title,
  description,
  icon: Icon,
  comingSoon = false,
}: ModuleCardProps) {
  return (
    <div
      className={`rounded-xl border border-foreground/10 bg-white p-6 ${
        comingSoon ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {title}
            </h3>
            {comingSoon && (
              <span className="rounded-full bg-muted/20 px-2 py-0.5 text-xs font-medium text-muted">
                Coming soon
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/components/
git commit -m "feat(app): add sidebar, top bar, user menu, wedding picker, and module card components"
```

---

## Task 11: App — Dashboard, Onboarding, Placeholder, and Settings Pages

**Files:**

- Create: `apps/app/src/routes/_authenticated/onboarding.tsx`
- Create: `apps/app/src/routes/_authenticated/dashboard.tsx`
- Create: `apps/app/src/routes/_authenticated/budget.tsx`
- Create: `apps/app/src/routes/_authenticated/guests.tsx`
- Create: `apps/app/src/routes/_authenticated/vendors.tsx`
- Create: `apps/app/src/routes/_authenticated/seating.tsx`
- Create: `apps/app/src/routes/_authenticated/settings.tsx`

- [ ] **Step 1: Create apps/app/src/routes/\_authenticated/onboarding.tsx**

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useCreateWedding } from "../../hooks/use-weddings";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const createWedding = useCreateWedding();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [budget, setBudget] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await createWedding.mutateAsync({
      name,
      date: date || null,
      budgetCents: budget ? Math.round(parseFloat(budget) * 100) : 0,
      currency: "USD",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-semibold text-foreground">
            Let's set up your wedding
          </h1>
          <p className="mt-2 text-muted">
            You can always change these details later
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {createWedding.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {createWedding.error.message}
            </p>
          )}

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-foreground"
            >
              Wedding name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Sarah & James's Wedding"
            />
          </div>

          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-foreground"
            >
              Wedding date (optional)
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-foreground/10 bg-white px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label
              htmlFor="budget"
              className="block text-sm font-medium text-foreground"
            >
              Estimated budget (optional)
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                $
              </span>
              <input
                id="budget"
                type="number"
                min="0"
                step="100"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="block w-full rounded-lg border border-foreground/10 bg-white py-2 pl-7 pr-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="30,000"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={createWedding.isPending}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {createWedding.isPending ? "Creating..." : "Start planning"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create apps/app/src/routes/\_authenticated/dashboard.tsx**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Wallet, Users, Store, Armchair } from "lucide-react";
import { useWeddings } from "../../hooks/use-weddings";
import { Sidebar } from "../../components/sidebar";
import { TopBar } from "../../components/top-bar";
import { ModuleCard } from "../../components/module-card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: weddings, isPending } = useWeddings();
  const [activeWeddingId, setActiveWeddingId] = useState<string | null>(null);

  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const weddingsList = weddings ?? [];
  const currentId = activeWeddingId ?? weddingsList[0]?.id;
  const current = weddingsList.find((w) => w.id === currentId);
  const user = Route.useRouteContext().auth.user!;

  const daysUntil = current?.date
    ? Math.ceil(
        (new Date(current.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      )
    : null;

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          user={user}
          weddings={weddingsList}
          activeWeddingId={currentId ?? ""}
          onSelectWedding={setActiveWeddingId}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl space-y-6">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
              </h1>
              {current && (
                <p className="mt-1 text-muted">
                  {current.name}
                  {daysUntil !== null && daysUntil > 0 && (
                    <span> — {daysUntil} days to go</span>
                  )}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ModuleCard
                title="Budget"
                description="Track vendor quotes and actual costs against your budget"
                icon={Wallet}
                comingSoon
              />
              <ModuleCard
                title="Guest List"
                description="Manage invitations, RSVPs, and dietary preferences"
                icon={Users}
                comingSoon
              />
              <ModuleCard
                title="Vendors"
                description="Track contacts, quotes, contracts, and payments"
                icon={Store}
                comingSoon
              />
              <ModuleCard
                title="Seating"
                description="Drag-and-drop seating chart with table assignments"
                icon={Armchair}
                comingSoon
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder pages (budget, guests, vendors, seating)**

Create `apps/app/src/routes/_authenticated/budget.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { Sidebar } from "../../components/sidebar";

export const Route = createFileRoute("/_authenticated/budget")({
  component: BudgetPage,
});

function BudgetPage() {
  return (
    <div className="flex h-screen bg-surface">
      <Sidebar />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <Wallet className="mx-auto h-12 w-12 text-muted" />
          <h2 className="mt-4 font-heading text-xl font-semibold text-foreground">
            Budget
          </h2>
          <p className="mt-2 text-sm text-muted">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
```

Create `apps/app/src/routes/_authenticated/guests.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Sidebar } from "../../components/sidebar";

export const Route = createFileRoute("/_authenticated/guests")({
  component: GuestsPage,
});

function GuestsPage() {
  return (
    <div className="flex h-screen bg-surface">
      <Sidebar />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <Users className="mx-auto h-12 w-12 text-muted" />
          <h2 className="mt-4 font-heading text-xl font-semibold text-foreground">
            Guests
          </h2>
          <p className="mt-2 text-sm text-muted">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
```

Create `apps/app/src/routes/_authenticated/vendors.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { Sidebar } from "../../components/sidebar";

export const Route = createFileRoute("/_authenticated/vendors")({
  component: VendorsPage,
});

function VendorsPage() {
  return (
    <div className="flex h-screen bg-surface">
      <Sidebar />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <Store className="mx-auto h-12 w-12 text-muted" />
          <h2 className="mt-4 font-heading text-xl font-semibold text-foreground">
            Vendors
          </h2>
          <p className="mt-2 text-sm text-muted">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
```

Create `apps/app/src/routes/_authenticated/seating.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Armchair } from "lucide-react";
import { Sidebar } from "../../components/sidebar";

export const Route = createFileRoute("/_authenticated/seating")({
  component: SeatingPage,
});

function SeatingPage() {
  return (
    <div className="flex h-screen bg-surface">
      <Sidebar />
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <Armchair className="mx-auto h-12 w-12 text-muted" />
          <h2 className="mt-4 font-heading text-xl font-semibold text-foreground">
            Seating
          </h2>
          <p className="mt-2 text-sm text-muted">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create apps/app/src/routes/\_authenticated/settings.tsx**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../../lib/api";
import { Sidebar } from "../../components/sidebar";
import type { Wedding, WeddingMember } from "@kaiplan/shared";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const user = Route.useRouteContext().auth.user!;

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          <h1 className="font-heading text-2xl font-semibold text-foreground">
            Settings
          </h1>

          <section className="space-y-4 rounded-xl border border-foreground/10 bg-white p-6">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Account
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Name</span>
                <span className="text-foreground">{user.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Email</span>
                <span className="text-foreground">{user.email}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/routes/_authenticated/
git commit -m "feat(app): add onboarding, dashboard, placeholder, and settings pages"
```

---

## Task 12: Linting, Formatting, Pre-Commit Hooks

**Files:**

- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.lintstagedrc.json`
- Create: `.husky/pre-commit`
- Create: `scripts/run-affected-checks.ts`
- Create: `scripts/lib/affected-packages.ts`
- Create: `scripts/vitest.config.ts`

- [ ] **Step 1: Install dev dependencies at root**

Run:

```bash
pnpm add -Dw eslint @eslint/js typescript-eslint eslint-config-prettier globals prettier lint-staged husky tsx
```

- [ ] **Step 2: Create eslint.config.js**

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/.turbo/",
      "**/.wrangler/",
      "**/coverage/",
      ".claude/",
      "**/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/__tests__/**", "**/*.test.*", "**/*.spec.*"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
```

- [ ] **Step 3: Create .prettierrc.json**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 80,
  "tabWidth": 2
}
```

- [ ] **Step 4: Create .lintstagedrc.json**

```json
{
  "*.{ts,tsx,js,mjs}": ["eslint --fix --no-warn-ignored", "prettier --write"],
  "*.{json,css,yml,yaml}": ["prettier --write"]
}
```

- [ ] **Step 5: Init husky and create pre-commit hook**

Run:

```bash
pnpm exec husky init
```

Then write `.husky/pre-commit`:

```bash
#!/bin/sh
pnpm exec lint-staged
pnpm tsx scripts/run-affected-checks.ts
```

- [ ] **Step 6: Create scripts/lib/affected-packages.ts**

```typescript
import { join } from "node:path";

export interface PackageInfo {
  name: string;
  scripts: Record<string, string>;
}

export interface AffectedPackage {
  name: string;
  dir: string;
  scripts: Record<string, string>;
}

export interface FilterArgs {
  typecheckFilters: string[];
  coverageFilters: string[];
  runScriptsTests: boolean;
}

export type PackageMap = Record<string, PackageInfo>;

export interface FsDeps {
  readdirSync: (path: string) => string[];
  readFileSync: (path: string, encoding: string) => string;
}

export interface Deps {
  getStagedFiles: () => string[];
  discoverPackages: (rootDir: string) => PackageMap;
  exec: (command: string) => void;
  log: (message: string) => void;
  exit: (code: number) => void;
  cwd: () => string;
}

export function mapFileToPackage(
  filePath: string,
  packages: PackageMap,
): AffectedPackage | null {
  const normalized = filePath.replace(/\\/g, "/");

  if (normalized.startsWith("scripts/")) {
    return { name: "__scripts__", dir: "scripts", scripts: {} };
  }

  for (const [dir, pkg] of Object.entries(packages)) {
    if (normalized.startsWith(dir + "/")) {
      return { name: pkg.name, dir, scripts: pkg.scripts };
    }
  }

  return null;
}

export function getAffectedPackages(
  files: string[],
  packages: PackageMap,
): AffectedPackage[] {
  const seen = new Set<string>();
  const result: AffectedPackage[] = [];

  for (const file of files) {
    const pkg = mapFileToPackage(file, packages);
    if (pkg && !seen.has(pkg.name)) {
      seen.add(pkg.name);
      result.push(pkg);
    }
  }

  return result;
}

export function buildFilterArgs(packages: AffectedPackage[]): FilterArgs {
  const typecheckFilters: string[] = [];
  const coverageFilters: string[] = [];
  let runScriptsTests = false;

  for (const pkg of packages) {
    if (pkg.name === "__scripts__") {
      runScriptsTests = true;
      continue;
    }
    if (pkg.scripts.typecheck) {
      typecheckFilters.push(`--filter=${pkg.name}`);
    }
    if (pkg.scripts["test:coverage"]) {
      coverageFilters.push(`--filter=${pkg.name}`);
    }
  }

  return { typecheckFilters, coverageFilters, runScriptsTests };
}

export function discoverPackages(rootDir: string, fs: FsDeps): PackageMap {
  const packages: PackageMap = {};
  const workspaceDirs = ["packages", "apps"];

  for (const wsDir of workspaceDirs) {
    const fullPath = join(rootDir, wsDir);
    let entries: string[];
    try {
      entries = fs.readdirSync(fullPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgJsonPath = join(fullPath, entry, "package.json");
      try {
        const raw = fs.readFileSync(pkgJsonPath, "utf-8");
        const parsed = JSON.parse(raw);
        const relDir = `${wsDir}/${entry}`;
        packages[relDir] = {
          name: parsed.name || entry,
          scripts: parsed.scripts || {},
        };
      } catch {
        continue;
      }
    }
  }

  return packages;
}

export function main(deps: Deps): void {
  const rootDir = deps.cwd();
  const stagedFiles = deps.getStagedFiles();

  if (stagedFiles.length === 0) {
    deps.log("No staged files. Skipping package-level checks.");
    deps.exit(0);
    return;
  }

  const packages = deps.discoverPackages(rootDir);
  const affected = getAffectedPackages(stagedFiles, packages);

  if (affected.length === 0) {
    deps.log("No workspace packages affected. Skipping checks.");
    deps.exit(0);
    return;
  }

  const { typecheckFilters, coverageFilters, runScriptsTests } =
    buildFilterArgs(affected);

  const affectedNames = affected
    .filter((p) => p.name !== "__scripts__")
    .map((p) => p.name);
  if (affectedNames.length > 0) {
    deps.log(`Affected packages: ${affectedNames.join(", ")}`);
  }

  if (typecheckFilters.length > 0) {
    deps.exec(`pnpm turbo typecheck ${typecheckFilters.join(" ")}`);
  }

  if (coverageFilters.length > 0) {
    deps.exec(
      `pnpm turbo test:coverage --concurrency=1 ${coverageFilters.join(" ")}`,
    );
  }

  if (runScriptsTests) {
    deps.exec("pnpm vitest run --config scripts/vitest.config.ts");
  }

  deps.log("\nAll checks passed.");
}
```

- [ ] **Step 7: Create scripts/run-affected-checks.ts**

```typescript
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { main, discoverPackages } from "./lib/affected-packages";

main({
  getStagedFiles: () => {
    const output = execSync("git diff --cached --name-only --diff-filter=d", {
      encoding: "utf-8",
    });
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  },
  discoverPackages: (rootDir) =>
    discoverPackages(rootDir, {
      readdirSync: readdirSync as (path: string) => string[],
      readFileSync: readFileSync as (path: string, encoding: string) => string,
    }),
  exec: (command) => {
    console.log(`\n> ${command}\n`);
    execSync(command, { stdio: "inherit" });
  },
  log: (message) => console.log(message),
  exit: (code) => process.exit(code),
  cwd: () => process.cwd(),
});
```

- [ ] **Step 8: Create scripts/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
  },
});
```

- [ ] **Step 9: Commit**

```bash
git add eslint.config.js .prettierrc.json .lintstagedrc.json .husky/ scripts/
git commit -m "feat: add ESLint, Prettier, lint-staged, husky pre-commit hooks, and affected-packages script"
```

---

## Task 13: Testing Infrastructure (Vitest + 95% Coverage)

**Files:**

- Create: `apps/api/vitest.config.ts`
- Create: `packages/shared/vitest.config.ts`
- Modify: `apps/api/package.json` (add test scripts)
- Modify: `packages/shared/package.json` (add test scripts)
- Modify: `turbo.json` (add test:coverage task)
- Create: `packages/shared/__tests__/schemas.test.ts`

- [ ] **Step 1: Add vitest to root devDependencies**

Run:

```bash
pnpm add -Dw vitest @vitest/coverage-v8
```

- [ ] **Step 2: Create apps/api/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
      thresholds: {
        perFile: true,
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
```

- [ ] **Step 3: Update apps/api/package.json scripts**

Add to `scripts`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 4: Create packages/shared/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types.ts"],
      thresholds: {
        perFile: true,
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
```

- [ ] **Step 5: Update packages/shared/package.json scripts**

Add to `scripts`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

- [ ] **Step 6: Update turbo.json — add test and test:coverage tasks**

Add to `tasks`:

```json
{
  "test": {
    "dependsOn": ["^build"],
    "cache": false
  },
  "test:coverage": {
    "dependsOn": ["^build"],
    "cache": false
  }
}
```

- [ ] **Step 7: Create packages/shared/**tests**/schemas.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import {
  createWeddingSchema,
  updateWeddingSchema,
  inviteMemberSchema,
} from "../src/schemas";

describe("createWeddingSchema", () => {
  it("accepts valid input with all fields", () => {
    const result = createWeddingSchema.safeParse({
      name: "Sarah & James",
      date: "2027-06-15",
      budgetCents: 3000000,
      currency: "USD",
      timezone: "America/New_York",
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = createWeddingSchema.safeParse({
      name: "Our Wedding",
      date: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.budgetCents).toBe(0);
      expect(result.data.currency).toBe("USD");
      expect(result.data.timezone).toBe("America/New_York");
    }
  });

  it("rejects empty name", () => {
    const result = createWeddingSchema.safeParse({
      name: "",
      date: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 200 characters", () => {
    const result = createWeddingSchema.safeParse({
      name: "a".repeat(201),
      date: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative budget", () => {
    const result = createWeddingSchema.safeParse({
      name: "Wedding",
      date: null,
      budgetCents: -100,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateWeddingSchema", () => {
  it("accepts partial updates", () => {
    const result = updateWeddingSchema.safeParse({ name: "Updated Name" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateWeddingSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("inviteMemberSchema", () => {
  it("accepts valid editor invite", () => {
    const result = inviteMemberSchema.safeParse({
      email: "partner@example.com",
      role: "editor",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid viewer invite", () => {
    const result = inviteMemberSchema.safeParse({
      email: "family@example.com",
      role: "viewer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects owner role in invite", () => {
    const result = inviteMemberSchema.safeParse({
      email: "someone@example.com",
      role: "owner",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = inviteMemberSchema.safeParse({
      email: "not-an-email",
      role: "editor",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 8: Run tests to verify**

Run: `pnpm --filter @kaiplan/shared test`
Expected: All tests pass.

- [ ] **Step 9: Run coverage to verify threshold**

Run: `pnpm --filter @kaiplan/shared test:coverage`
Expected: 95%+ coverage on `schemas.ts` and `constants.ts`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/vitest.config.ts packages/shared/vitest.config.ts packages/shared/__tests__/ turbo.json apps/api/package.json packages/shared/package.json
git commit -m "feat: add Vitest testing infrastructure with 95% per-file coverage thresholds"
```

---

## Task 14: Shadcn/UI Design System Init

**Files:**

- Create: `apps/app/components.json`
- Modify: `apps/app/package.json` (add shadcn dependencies)
- Shadcn/UI will generate files in `apps/app/src/components/ui/`

- [ ] **Step 1: Install Shadcn/UI dependencies**

Run from `apps/app`:

```bash
cd apps/app && pnpm add class-variance-authority clsx tailwind-merge @radix-ui/react-slot @radix-ui/react-dropdown-menu @radix-ui/react-dialog @radix-ui/react-avatar @radix-ui/react-separator @radix-ui/react-tooltip
```

- [ ] **Step 2: Create apps/app/components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 3: Create apps/app/src/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Add path alias to vite.config.ts**

Update `apps/app/vite.config.ts` to include:

```typescript
import path from "path";

// Inside defineConfig:
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
},
```

- [ ] **Step 5: Add path alias to tsconfig.json**

Update `apps/app/tsconfig.json` to include:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 6: Init Shadcn/UI base components**

Run from `apps/app`:

```bash
pnpm dlx shadcn@latest add button input label card dropdown-menu avatar separator tooltip
```

This generates components in `src/components/ui/`.

- [ ] **Step 7: Commit**

```bash
git add apps/app/
git commit -m "feat(app): init Shadcn/UI design system with brand tokens and base components"
```

---

## Task 15: Configure Project Plugins

This task sets up the Claude Code project-level settings to enable the same plugins used in `ideas-validation`.

- [ ] **Step 1: Create .claude/settings.json**

```json
{
  "enabledPlugins": {
    "frontend-design@claude-plugins-official": true,
    "superpowers@claude-plugins-official": true,
    "context7@claude-plugins-official": true,
    "playwright@claude-plugins-official": true,
    "typescript-lsp@claude-plugins-official": true,
    "claude-md-management@claude-plugins-official": true,
    "skill-creator@claude-plugins-official": true,
    "cloudflare@cloudflare": true
  }
}
```

Note: `marketing-skills`, `firecrawl`, `apollo`, and `security-guidance` are omitted — those are relevant to the validation/marketing site but not the product app. `neon`, `sentry`, `posthog`, `stripe` are enabled globally and will be available. Add `marketing-skills` back when the marketing site migrates into this repo.

- [ ] **Step 2: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: configure Claude Code plugins for the project"
```

---

## Task 16: Final Wiring + Verify Build

- [ ] **Step 1: Run pnpm install to ensure all dependencies are resolved**

Run: `pnpm install`

- [ ] **Step 2: Verify typecheck across the monorepo**

Run: `turbo typecheck`
Expected: All packages pass.

- [ ] **Step 3: Verify the app builds**

Run: `turbo build`
Expected: Both `@kaiplan/app` and `@kaiplan/api` build successfully.

- [ ] **Step 4: Run all tests with coverage**

Run: `pnpm --filter @kaiplan/shared test:coverage`
Expected: All tests pass, 95%+ coverage on every file.

- [ ] **Step 5: Verify lint passes**

Run: `pnpm eslint .`
Expected: No lint errors.

- [ ] **Step 6: Fix any type errors, test failures, or build failures**

Address errors found in steps 2-5.

- [ ] **Step 7: Commit any fixes**

```bash
git add .
git commit -m "fix: resolve type, test, and build errors from full monorepo wiring"
```

- [ ] **Step 8: Final commit — tag the milestone**

```bash
git tag v0.1.0-scaffold
```
