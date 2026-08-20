# Metrics

Every number on the README, with the command that produced it, what it counts, and what it leaves out.

All figures were re-derived against this tree on **2026-08-13**. Commands are POSIX shell run from the
repository root and read only tracked files (`git ls-files`), so nothing in `node_modules/`, `.turbo/`,
or an ignored scratch directory can inflate them.

Two figures on the README come from the private full-history repository rather than this tree, and
both are sourced in [§7](#7-history-and-duration).

## Contents

- [1. Lines of code](#1-lines-of-code)
- [2. Source against test](#2-source-against-test)
- [3. Test files, cases, assertions](#3-test-files-cases-assertions)
- [4. The coverage gate](#4-the-coverage-gate)
- [5. End-to-end](#5-end-to-end)
- [6. Surface and data](#6-surface-and-data)
- [7. History and duration](#7-history-and-duration)

---

## 1. Lines of code

```bash
git ls-files | grep -E '\.(ts|tsx|astro|css|sql|mjs)$' | xargs cat | wc -l
```

**230,851** lines across **981** files.

```bash
git ls-files | grep -cE '\.(ts|tsx|astro|css|sql|mjs)$'
```

### What the count includes and excludes

Six extensions, chosen because they are the ones actually authored here: `.ts`, `.tsx`, `.astro`,
`.css`, `.sql`, `.mjs`. That deliberately omits Markdown, JSON, YAML, lockfiles, and the two
generated artifacts that would otherwise pad the number, `routeTree.gen.ts` excepted: it is a
tracked `.ts` file and it is counted. It is 1 file of 981.

### One caveat about the method

`cat | wc -l` counts newline characters, so a file whose last line has no trailing newline is
undercounted by one. Counting records instead of newlines gives a slightly higher figure:

```bash
git ls-files | grep -E '\.(ts|tsx|astro|css|sql|mjs)$' \
  | tr '\n' '\0' | xargs -0 awk 'END{print NR}'   # sums to 230,863
```

The 12-line gap is 12 files with no terminating newline. Both numbers are correct for what they
measure. The README uses the `wc -l` form because that is the command printed in its own source.

---

## 2. Source against test

```bash
# test
git ls-files | grep -E '\.(test|spec)\.(ts|tsx)$' | xargs cat | wc -l      # 141,158
# source (everything else in the extension set)
git ls-files | grep -E '\.(ts|tsx|astro|css|sql|mjs)$' \
  | grep -vE '\.(test|spec)\.(ts|tsx)$' | xargs cat | wc -l                # 89,693
```

**141,158 test, 89,693 source. Test code outweighs source 1.57 : 1.**

The split is drawn on filename, not on directory. A file counts as test if and only if it ends
`.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx`. Test fixtures and factories that do not carry
that suffix therefore land on the *source* side of the ratio, which makes 1.57 : 1 a floor rather
than a ceiling. It is the less flattering way to cut it, which is why it is the one used.

---

## 3. Test files, cases, assertions

```bash
git ls-files | grep -cE '\.(test|spec)\.(ts|tsx)$'                          # 425
git ls-files | grep -E '\.(test|spec)\.(ts|tsx)$' \
  | xargs grep -cE '^\s*(it|test)(\.\w+)?\('  | awk -F: '{t+=$2} END{print t}'   # 6,929
git ls-files | grep -E '\.(test|spec)\.(ts|tsx)$' \
  | xargs grep -chE '\bexpect\('              | awk '{t+=$1} END{print t}'       # 13,758
```

| | |
|---|---|
| Test files | **425** |
| Test cases | **6,929** |
| `expect(` calls | **13,758** |

Both greps are line-anchored counts, not a parse. `^\s*(it|test)(\.\w+)?\(` matches a declaration at
the start of a line, so it catches `it(`, `test(`, `it.each(`, `test.skip(`, and it also catches
`test.describe(`, which is a grouping block rather than a case. In the Vitest suites `describe(` is
spelled without the `test.` prefix and so is not matched; in the Playwright specs it is, which is why
the E2E count in §5 is done separately with a tighter pattern. The assertion count is one per
`expect(` occurrence, so a single `expect(x).toBe(1)` counts once and a chained matcher does not
double-count.

**The per-package table this section used to carry was wrong, and this same document had already
named the reason.** A line-anchored `it(`/`test(` grep counts source-line *declarations*, not the
cases Vitest actually runs. A declaration inside a loop, a `.forEach`, or an `it.each(...)` table
runs once in the source and N times at test time; the grep can only ever see the once. That gap
compounds differently per file depending on how much dynamic case generation it uses, which is why
it cannot be corrected with a fudge factor. It has to be re-run. The table below now comes from
Vitest's own `Test Files` / `Tests` summary line, not a grep, for exactly that reason.

### Where the cases live

Every row is the `Test Files` / `Tests` line Vitest prints for that package, read off two commands
run from the repo root:

```bash
pnpm run test:coverage      # turbo running `vitest run --coverage` in each of the 8 packages
pnpm run test:scripts       # vitest run --config scripts/vitest.config.ts
```

| Package | Test files | Cases | Command |
|---|---:|---:|---|
| `packages/marketing` | 111 | 2,527 | `pnpm --filter @kaiplan/marketing run test:coverage` |
| `apps/api` | 47 | 1,326 | `pnpm --filter @kaiplan/api run test:coverage` |
| `apps/app` | 95 | 1,037 | `pnpm --filter @kaiplan/app run test:coverage` |
| `packages/marketing-api` | 31 | 588 | `pnpm --filter @kaiplan/marketing-api run test:coverage` |
| `apps/web` | 66 | 674 | `pnpm --filter @kaiplan/web run test:coverage` |
| `packages/shared` | 12 | 376 | `pnpm --filter @kaiplan/shared run test:coverage` |
| `packages/lead-magnet-pdf` | 3 | 22 | `pnpm --filter @kaiplan/lead-magnet-pdf run test:coverage` |
| `packages/knowledge` | 1 | 20 | `pnpm --filter @kaiplan/knowledge run test:coverage` |
| `scripts/` | 25 | 358 | `pnpm run test:scripts` |

The eight packages plus `scripts/` sum to **6,928**, one below the repo-wide grep total of 6,929
quoted above it, a gap the same size as the LOC newline caveat in §1, not a new problem. The
earlier draft of this table read `packages/marketing` 2,323, `apps/api` 1,307, `apps/app` 1,036,
`packages/marketing-api` 683, and `apps/web` 669, every one of the five an undercount, all from the
same grep this section now disowns. `packages/marketing` was the worst of them, 204 cases short.
The README quoted that exact row; it has been corrected to 2,527.

Its "the remaining 135 are the Playwright specs under `e2e/`" line is retracted along with it. That
arithmetic only worked because the package sum was undercounted by roughly the same amount the real
total needed explaining; with real per-package figures there is nothing meaningful left over to
attribute to `e2e/`, which is counted on its own terms in §5 below.

**What this table leaves out.** `packages/marketing-api` also ships 8 integration-only test files
(`src/integration/**/*.test.ts`, 100 cases) that run separately, outside the coverage gate and
outside `pnpm run verify`:

```bash
pnpm --filter @kaiplan/marketing-api run test:integration    # 8 files, 100 cases
```

Neither the file nor case count above includes this suite, so it is not part of the 6,928 total
either. One of its 100 cases,
`signup.integration.test.ts` › "claims duplicate lead magnet retries so concurrent requests send
once", failed on both of two consecutive local runs made while re-deriving these figures. That
looks like a genuine race in the test rather than in this table, and is left for the owner rather
than patched here.

Separately, `apps/web` carries 2 more spec files, `apps/web/e2e/audit/editorial-baseline.spec.ts`
and `apps/web/e2e/audit/wave-3-pricing.spec.ts`. Both are Playwright, not Vitest, and both say in
their own header comment that they run outside `pnpm verify`, invoked by hand against a live or
local target. They are counted by neither this table nor the E2E section below.

### A discrepancy worth naming

[TESTING.md](./TESTING.md) opens with 6,889 cases. The grep above returns 6,929. Neither of those
two is the number to build a per-package breakdown from; see the correction above. TESTING.md now
defers to this file for the count.

---

## 4. The coverage gate

**95% per file (lines, functions, branches, statements) in all 8 workspace packages.**

This is not a repo average. `perFile: true` means each file clears 95% alone, so a well-tested
module cannot carry an untested one. The exclusion list is written out in full in
[TESTING.md §1](./TESTING.md), including the one genuine gap: `apps/api/src/routes/wedding-website.ts`,
1,559 lines, excluded from coverage and never backfilled. That is the same module that holds the
public RSVP handler discussed on the README.

Two further caveats, both repeated from TESTING.md: `packages/marketing-api` enforces only `lines`
and `statements`, omitting `functions` and `branches`; and `scripts/` has no coverage block at all.
Of its 41 non-test modules, 22 carry a colocated test, a module and a `*.test.ts` file that share a
basename anywhere under `scripts/`, since several `scripts/*.test.ts` files test a same-named
module in `scripts/lib/` rather than in their own directory. 25 `scripts/*.test.ts` files exist in
total; three of them, `docs-source-of-truth.test.ts`, `pre-commit-tooling.test.ts`, and
`vitest-config.test.ts`, are
meta-tests that check repo-wide invariants (pricing-doc drift, the absence of a CI workflow file,
the vitest exclude list) and have no source module of matching basename, which is why the module
count and the test-file count do not agree:

```bash
modules=$(find scripts -type f \( -name '*.ts' -o -name '*.mjs' \) \
  | grep -v '\.test\.ts$' | grep -v 'scripts/vitest\.config\.ts$')   # 41, config file excluded
tests=$(find scripts -type f -name '*.test.ts')                      # 25

paired=0
for t in $tests; do
  base=$(basename "$t" .test.ts)
  echo "$modules" | grep -qE "(^|/)$base\.(ts|mjs)\$" && paired=$((paired + 1))
done
echo "$paired"   # 22
```

**No coverage percentage is claimed anywhere in this repository.** The gate is a threshold that the
build either clears or fails, and there is no CI, so there is no stored run to cite. A number here
would have to come from a run you cannot see. Run `pnpm run test:coverage` and read your own.

---

## 5. End-to-end

```bash
git ls-files | grep -cE '^e2e/.*\.spec\.ts$'                                    # 24
git ls-files | grep -E '^e2e/.*\.spec\.ts$' \
  | xargs grep -hoE '^\s*test(\.(only|skip|fixme))?\(' | wc -l                  # 97
grep -n 'name:' e2e/playwright.config.ts                                        # 3 projects
```

**24 spec files, 97 declared cases, 3 device profiles** (`chromium`, `iphone-12`, `pixel-7`).

One of the 97 is a `test.skip(`, leaving **96 that run**, which is the figure the README quotes.
The tighter pattern here excludes the 23 `test.describe(` grouping blocks that the §3 count folds in.

---

## 6. Surface and data

```bash
git ls-files 'apps/api/src/routes/*.ts' | grep -v test | wc -l                          # 14
git ls-files 'apps/api/src/routes/*.ts' | grep -v test \
  | xargs grep -hcE '^\s*app\.(get|post|put|patch|delete)\(' | awk '{t+=$1} END{print t}'   # 79
git grep -hoE 'pgTable\(' -- 'apps/api/src/db/*.ts' | wc -l                             # 20
git ls-files | grep -c 'apps/api/drizzle.*\.sql$'                                       # 25
git ls-files | grep -c '^apps/web/d1/migrations/.*\.sql$'                               # 14
```

| | |
|---|---|
| HTTP endpoints | **79** across **14** route modules |
| Postgres tables | **20**, over **25** migrations |
| D1 tables | 9, over **14** migrations |
| Workspace packages | **8** |
| Marketing content entries | **247** Markdown files |

The endpoint count matches `app.<verb>(` at the start of a line inside `apps/api/src/routes/`. It
excludes the Better Auth routes, which are mounted as a handler rather than declared here, and the
second Hono app in `packages/marketing-api`. So 79 is the product API only, not every path the
three Workers answer.

The D1 table count of 9 is read from the schema rather than counted by a command, because the
migrations create and later drop tables and a raw `CREATE TABLE` grep overstates it.

### The 247 marketing entries

```bash
git ls-files 'apps/web/src/content/**' | sed 's|apps/web/src/content/||;s|/.*||' | sort | uniq -c
```

| Collection | Entries |
|---|---:|
| `guides` | 133 |
| `listicles` | 29 |
| `comparisons` | 26 |
| `pricing-breakdowns` | 24 |
| `alternatives` | 19 |
| `lead-magnets` | 16 |

Three of those collections (`alternatives`, `comparisons`, `pricing-breakdowns`) total **69** and
are what the comparison hub on the README renders under its three headings. Each is a written
Markdown entry, not a template filled from a keyword list.

---

## 7. History and duration

Two README figures come from the private full-history repository rather than from this tree, and
both are sourced as such on the page itself.

**History: 469 commits, 2026-04-07 to 2026-07-08, 1 contributor.** This repository is a snapshot of
the final tree. It carries only the commits needed to publish it, so `git log` here will not return
469. The figure comes from the private full-history repository, which stayed private because it
contains vendored private dependencies from another project.

**Three months, solo.** Same source. The dates above are the only support for it.

Every other number on the README reproduces from the commands on this page.
