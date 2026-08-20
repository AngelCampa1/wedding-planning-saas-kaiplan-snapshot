# CLAUDE.md - Kaiplan

Guidance for Claude Code and other AI agents working in this repository.

> This project is archived. The product was wound down on 2026-06-11 and the
> Workers no longer serve traffic. The conventions below are what the codebase
> was built to, and they still apply to any change made here.

## Design Canon

- **Buttons are pills.** Fully rounded button geometry is a standing product preference. Every button or button-styled CTA uses pill corners (`border-radius: 9999px`, `rounded-full`, or equivalent), including primary and secondary actions, link-buttons, toolbar buttons, segmented and toggle controls, and icon buttons (circular when square). Do not introduce square or mildly rounded button shapes.

See [DESIGN.md](portfolio/DESIGN.md) for the full design system: brand personality, principles, and tokens.

## Project Overview

**Kaiplan** is a wedding planning SaaS. This repo contains the product application, dashboard, API, public marketing website, and shared packages.

Pricing tiers: Starter $20/mo, Pro $35/mo, Lifetime $100.

## Monorepo Structure

- `apps/app` - React + Vite SPA (TanStack Router, TanStack Query, Shadcn/UI, Tailwind 4). Cloudflare Worker at `my.kaiplan.app`.
- `apps/api` - Hono on Cloudflare Workers at `api.kaiplan.app`. Drizzle ORM + Neon Postgres via Hyperdrive. Better Auth.
- `apps/web` - Astro public marketing site and couple-facing wedding websites. Cloudflare Worker at `kaiplan.app`.
- `packages/shared` - Zod schemas, constants, TypeScript types shared between app and api.
- `packages/marketing` - Astro layouts, React islands, and the SEO toolkit used by `apps/web`.
- `packages/marketing-api` - Second Hono app backed by Cloudflare D1, mounted into Astro.
- `packages/knowledge` - Validated single source of truth for offering and pricing copy.
- `packages/lead-magnet-pdf` - Markdown to PDF renderer for lead magnets.

Package names: `@kaiplan/app`, `@kaiplan/api`, `@kaiplan/shared`, `@kaiplan/web`, `@kaiplan/marketing`, `@kaiplan/marketing-api`, `@kaiplan/knowledge`, `@kaiplan/lead-magnet-pdf`.

See [ARCHITECTURE.md](portfolio/ARCHITECTURE.md) for how these fit together.

## Local Dev Ports

| Surface  | Port |
| -------- | ---- |
| Frontend | 3030 |
| Backend  | 5030 |

Use these rather than framework defaults (`:3000` / `:8787`). Vite, Astro, Wrangler, and the local-e2e stack are all configured to honor them. The local-e2e stack also uses 3031 for Astro, 5031 for the marketing API, and 55432 for the Dockerised Postgres.

## Tech Stack

- **Frontend:** React 19, Vite, TanStack Router (file-based), TanStack Query, Shadcn/UI (New York style), Tailwind CSS 4, Lucide React
- **Backend:** Hono, Better Auth (email/password + Google OAuth), Drizzle ORM, Neon Postgres
- **Infrastructure:** Cloudflare Workers, Pages, Hyperdrive, D1, R2, Durable Objects
- **Tooling:** pnpm workspaces, Turborepo, TypeScript, Vitest, Playwright

## Commands

```bash
pnpm install                                   # Install all dependencies
pnpm exec turbo build                          # Build all packages
pnpm exec turbo dev                            # Dev all packages
pnpm run lint                                  # ESLint across workspace packages
pnpm run typecheck                             # Typecheck all packages
pnpm run test:coverage                         # Workspace coverage gates
pnpm run test:scripts                          # Vitest for scripts/
pnpm run verify                                # Full local quality gate sequence
pnpm run e2e:browser                           # Playwright suite (boots the local stack)
pnpm run e2e:smoke                             # In-process smoke, no browser or Docker
pnpm --filter @kaiplan/app dev                 # Dev the SPA
pnpm --filter @kaiplan/api dev                 # Dev the API Worker
pnpm --filter @kaiplan/web dev                 # Dev the public website frontend
pnpm --filter @kaiplan/api run db:generate     # Generate Drizzle migration
pnpm --filter @kaiplan/api run db:migrate      # Apply migration
```

Before the first E2E run, `cp apps/web/.dev.vars.example apps/web/.dev.vars`. Wrangler reads worker vars from `.dev.vars`, not the shell, so without it `astro preview` falls back to the production `ALLOWED_ORIGIN` and same-origin form POSTs return 403.

Deploy scripts exist but the wrangler configs carry placeholder infrastructure IDs. They will not deploy without real Cloudflare resource IDs and secrets. See `docs/production-env-vars-step-by-step.md`.

## Brand

- **Fonts:** Instrument Serif (headings/display), Geist (body), Geist Mono (numerals/mono)
- **Colors:** Primary `#B0432A` (terracotta), Accent `#EEF0EB` (light moss tint), Background `#F5F1EA` (paper), Text `#171311` (ink), Muted `#3D3530`

## Workflow

- **Use master directly for small scoped work** - quick bugfixes and small, low-risk tasks should be completed directly on `master` without creating a worktree
- **Use in-repo worktrees for larger work** - substantial features, risky refactors, or explicitly requested parallel work should use a worktree inside this repository, never a sibling clone or external worktree
- **Sub-agent-first workflow** - use fresh subagents by default for bounded codebase exploration, implementation plan execution, review passes, and follow-up fixes
- **Controller context must stay small** - the primary agent coordinates, answers questions, and integrates results, delegating scoped work into subagents to avoid context creep
- **Execute every task end-to-end** - when working on a phase, task, or bug, execute the full plan unless a real blocker is hit
- **All quality gates are mandatory** - tests, coverage, linting, typechecking, and any required verification must pass before the work is considered done
- **Reviewer agent is mandatory for implemented work** - every implemented change must be reviewed by a dedicated review agent, and every issue it finds must be fixed before completion
- **Cleanup is required after merge** - once a merge lands, tear down the worktree and remove its branch. A task is not done until the worktree and branch are gone.

## Quality Gates

- **No placeholder code.** Every function must be fully implemented.
- **No TODO/FIXME/HACK comments.** If it needs doing, do it now.
- **No `any` type in TypeScript.** Use proper types or `unknown` with narrowing. `@typescript-eslint/no-explicit-any` is `error` everywhere except one override in [`eslint.config.js`](eslint.config.js) that turns it off for test files — `**/__tests__/**`, `**/*.test.*`, `**/*.spec.*` — where an `any` cast on a mock or fixture is allowed. Production code carries no exemption; if an `any` is genuinely unavoidable there, it needs an explained `eslint-disable` like the one in `apps/api/src/db/guest-schema.ts`.
- **No `eslint-disable` without explanation.** Fix the lint error instead. If a disable is truly the only option, it must carry a `-- reason` on the same line saying why.

### Test-Driven Development - MANDATORY

Every task follows this cycle. No exceptions:

1. **Write the failing test first.** The test must define expected behavior before any implementation exists.
2. **Run the test. Confirm it fails.** If it passes, your test is wrong.
3. **Write the minimal implementation** to make the test pass.
4. **Run the test. Confirm it passes.**
5. **Refactor** if needed, re-run tests to confirm still green.

### Coverage Requirements

- **95% code coverage minimum on every file you touch.** Not the repo average, each individual file (`perFile: true`).
- React route components (`.tsx` files in `routes/`) are excluded from coverage.
- Astro page files under `apps/web/src/pages/**/*.astro` are excluded from coverage.
- If a file drops below 95%, you are not done. Write more tests.

See [TESTING.md](portfolio/TESTING.md) for the full exclusion list and the E2E harness.

## Pre-Commit Hooks

Two-layer hook system runs on every commit:

1. **lint-staged** (file-level) - ESLint `--fix` on staged `.ts/.tsx/.js/.mjs` files and Prettier `--write` on staged `.ts/.tsx/.js/.mjs/.astro/.json/.css/.yml/.yaml` files
2. **affected-packages** (package-level) - detects which workspace packages have staged changes, runs package lint, typecheck, and `test:coverage` only for those packages; if `scripts/` changes it also runs the scripts Vitest suite

To bypass hooks in emergencies: `git commit --no-verify` (but fix the issue promptly).

## Execution Expectations

Work end-to-end without pausing for progress check-ins. Do not stop after completing a batch to ask "ready for feedback?" or "should I continue?". Execute the full plan autonomously. Asking clarifying questions about requirements is still expected.

## Working autonomously

- **Poll, don't idle.** When a task, build, test run, or hook is running, actively poll its status and output until it finishes.
- **Keep going.** Finishing one chunk of work means moving straight to the next chunk. Continue until the goal is done or you are genuinely blocked.

## User-Facing Copy Guardrails

For any user-facing copy in this repo, run the copy through these guardrails before calling the work done. This applies to product UI text, landing pages, hero copy, CTAs, pricing copy, onboarding copy, emails, ads, popups, social posts, SEO pages, help text, empty states, and any copy that sells, explains, persuades, activates, or reassures.

Required order:

1. Remove AI-sounding, bloated, or generic copy.
2. Rewrite and audit the result for a third-grade reading level.
3. Verify there are zero lies: no made-up numbers, claims, proof, testimonials, guarantees, rankings, integrations, prices, timelines, or capabilities. Check claims against the product source of truth before publishing.
4. Verify the message fits the whole place it appears: the page, flow, audience, offer, brand voice, surrounding copy, and user intent. Do not approve a line just because it is clear in isolation.

Do not apply this rule to code identifiers, logs, API docs, technical docs for developers, exact legal text, database values, or user-generated content unless asked.

## Founder Context

**Angel Campa** - Principal SDET, built Kaiplan as a solo SaaS product.

- Do not claim domain expertise in wedding planning when writing copy
- Write from the builder perspective: "we built Kaiplan because..."
- Never fabricate credentials, testimonials, or industry experience
