# Testing

425 test files. 6,929 test cases. 13,758 assertions. Test code outweighs source code 1.57 to 1.

Those four figures, the commands that produce them, and what they quietly leave out are in
[METRICS.md](./METRICS.md).

That ratio is the headline, but it is not the interesting part. What follows is how the gates are
shaped and where they deliberately stop.

---

## 1. The 95% gate is per-file, not per-repo

Every one of the eight workspace packages sets the same threshold:

```ts
thresholds: {
  perFile: true,
  lines: 95,
  functions: 95,
  branches: 95,
  statements: 95,
}
```

`perFile: true` is the load-bearing line. A repo-average gate is gameable: a 200-line untested
module hides comfortably behind a well-tested one, and the aggregate never moves. Per-file means
every single file clears 95% on its own or the build fails. There is nowhere to hide a module.

### What is excluded, and why

A 95% claim is only believable if the exclusion list is on the table. Here is the whole of it.

| Package | Excluded | Reason |
|---|---|---|
| `apps/api` | `src/index.ts` | Composition root: wiring, not logic. Exercised end-to-end by Playwright instead. |
| `apps/api` | `src/lib/env.ts`, 8 × `src/db/*-schema.ts` | Declarative Drizzle table definitions and env typing. No branches to cover. |
| `apps/api` | `src/routes/wedding-website.ts` | The one genuine gap. A 1,559-line module that never got its coverage backfilled. |
| `apps/app` | `src/routes/**/*.tsx` | Route components are thin composition over tested hooks and components. |
| `apps/app` | `main.tsx`, `router.tsx`, `routeTree.gen.ts` | Bootstrap and generated code. |
| `apps/web` | `src/pages/**/*.astro` | Astro pages are templates over tested `lib/` functions. |
| `apps/web` | 2 components, image manifest, CF env shim | Presentational or generated. |
| `packages/*` | `index.ts`, `types.ts`, `constants.ts`, `env.d.ts`, `*.astro` | Re-export barrels and type-only files. |
| `packages/marketing-api` | `src/integration/**` | Covered by a separate integration suite against real D1. |

Two caveats: `packages/marketing-api` enforces only `lines` and `statements`; its config
omits `functions` and `branches`. And `scripts/` has no coverage block at all, though 22 of its 41
modules carry a colocated test; see [METRICS.md §4](./METRICS.md#4-the-coverage-gate) for the
command that pairs them.

---

## 2. The local E2E harness boots four real services

The E2E suite does not mock the backend. It starts the actual stack.

```text
Docker Postgres  :55432   ← scripts/local-e2e-db.ts (docker run postgres:16-alpine)
API Worker       :5030    ← scripts/serve-local-api.ts (real Hono app, real migrations)
Marketing API    :5031    ← scripts/serve-local-marketing-api.ts (in-memory D1 stand-in)
Astro web        :3031    ← astro build && astro preview
React SPA        :3030    ← vite
```

`e2e/playwright.config.ts` awaits `ensureLocalE2ERuntime()` at module scope, then hands Playwright a
`webServer` list built by `buildLocalPlaywrightWebServers()`. Playwright owns the lifecycle: it
boots all four, health-gates each one, runs the suite, and tears them down.

The API side needs no secrets of its own. `buildLocalApiEnv()` synthesizes every variable the Worker
wants: auth secret, Stripe price IDs, and the `E2E_MODE` + `ENVIRONMENT` pair that the fail-closed
`isE2eAllowed()` check demands, all passed in as process env.

The Astro side is the exception, and it is worth knowing why. `astro preview` runs under Wrangler,
and Wrangler builds worker vars from `wrangler.jsonc` and `.dev.vars`, never from the shell. So a
process env var cannot reach the Worker. Without `apps/web/.dev.vars`, the site falls back to the
production `ALLOWED_ORIGIN` in `wrangler.jsonc` and answers every same-origin form POST with 403.
One copy fixes it:

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Billing is exercised for real, not stubbed: `scripts/local-e2e-billing.ts` drives a checkout and
then POSTs a synthetic `customer.subscription.updated` event to the actual webhook handler, which
the handler accepts only because the E2E gate is open.

**24 spec files, 97 test cases, 3 device profiles:** Desktop Chromium, iPhone 12, Pixel 7. A
separate `playwright.live.config.ts` runs a production smoke suite against the deployed site, kept
out of the default run by `testIgnore: ["**/live/**"]`.

---

## 3. Accessibility is asserted, not audited

`@axe-core/playwright` runs inside the suite rather than as a separate report nobody reads.
`edge-a11y.spec.ts` and `audit-capture.spec.ts` assert zero violations, and because they run in the
same three-device matrix, accessibility is checked at mobile widths too, where it usually breaks.

The seating chart got explicit attention: `role="region"` with a label on the canvas, per-guest
`aria-label`s naming the assigned table, `aria-busy` during saves, and labeled unassign buttons.
Drag-and-drop is the easiest thing in a product to make unusable without a mouse.

---

## 4. `pnpm run verify`: seven stages, cheapest first

```text
1  lint           turbo lint across 8 packages
2  typecheck      turbo typecheck + the scripts/ tsconfig
3  test:coverage  the per-file 95% gates
4  test:scripts   358 tests over the tooling in scripts/
5  build web      Astro production build
6  audit:links    crawl apps/web/dist for broken links
7  e2e:browser    24 specs × 3 device profiles
```

The ordering is deliberate: static analysis fails in seconds, the browser matrix takes minutes.
Stage 6 sits after stage 5 because it crawls build output. It cannot run before the build exists.

---

## 5. Meta-tests: testing the configuration

This is the least conventional part of the suite and the part worth stealing.

Config drift is a failure mode unit tests structurally cannot catch. A test asserts that a function
behaves; nothing asserts that the vitest config still excludes the right paths, that the wrangler
config still declares the custom domain, or that a pricing doc still matches the pricing constant.
So those got their own tests:

- `scripts/vitest-config.test.ts`: asserts vitest excludes `**/.claude/**` and `**/.worktrees/**`,
  so in-repo worktrees are not double-collected.
- `scripts/cloudflare-{api,app,web}-config.test.ts`: assert each wrangler config declares the
  bindings, routes, and custom domains the deploy needs.
- `scripts/lib/wrangler-custom-domains.test.ts`, `scripts/astro-cloudflare-preview-config.test.ts`:
  assert the config *patchers* produce valid output.
- `scripts/docs-source-of-truth.test.ts`: imports `PLAN_PRICING`, `STRIPE_PRICE_ENV_KEYS`, and
  `TRIAL_DURATION_DAYS` from `packages/shared` and fails if the pricing documentation disagrees. A
  stale doc is a red build.
- `apps/web/src/config/{site,site-content}.test.ts`, `content.config.test.ts`,
  `lib/{api-config,sitemap-config}.test.ts`: same idea for site configuration and content
  collections.
- `apps/web/src/assets/screenshots/v2/manifest.test.ts`: asserts every screenshot the marketing site
  references actually exists on disk and is non-trivial in size.

---

## 6. How the gates were enforced

Locally, through Git hooks. There was no CI.

```sh
# .husky/pre-commit
pnpm exec lint-staged --concurrent false      # eslint --fix + prettier on staged files
pnpm exec tsx scripts/run-affected-checks.ts  # lint + typecheck + coverage for changed packages only

# .husky/pre-push
pnpm run lint && pnpm run typecheck && pnpm run test:coverage
```

`run-affected-checks.ts` resolves which workspace packages have staged changes and runs only their
gates, which is what kept the pre-commit hook fast enough to survive daily use.

The `.husky/pre-push` file carries the comment *"Lighter gate than `pnpm run verify` — CI owns full
verify including e2e."* That CI never existed. There is no workflow file in this repository, and
`scripts/pre-commit-tooling.test.ts` asserts there isn't one, so the absence is a checked invariant
rather than an oversight.

For one developer on one machine, the hooks were the enforcement mechanism, and they held: nothing
reached a commit without passing lint, typecheck, and the coverage gates for every package it
touched. What that setup cannot give you is proof. A hook runs on the machine that wrote the code,
and `--no-verify` is always one flag away. Someone reading this repository has to take the green on
faith or run `pnpm run verify` themselves, which is the honest cost of the choice.

## Commands

```bash
pnpm run test:coverage                        # all packages, per-file 95% gates
pnpm --filter @kaiplan/api test:coverage      # one package
pnpm run test:scripts                         # tooling tests
pnpm run e2e:smoke                            # in-process smoke, no browser or Docker
pnpm run e2e:browser                          # full matrix
pnpm run e2e:mobile                           # iPhone 12 + Pixel 7 only
pnpm run verify                               # all seven stages
```
