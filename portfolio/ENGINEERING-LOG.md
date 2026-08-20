# Engineering log

What got built, in what order, and what was found wrong along the way. Everything below traces to
a file still in this tree: a design doc, a roadmap phase, a source comment, or a test that
currently fails. Nothing here is reconstructed from memory or invented to fill a gap.

The private full-history repository (469 commits, 2026-04-07 to 2026-07-08) is not in this
snapshot (see [METRICS.md §7](METRICS.md#7-history-and-duration)), so this log is built
from the artifacts that *did* ship in the tree: seven dated design-doc pairs, an eight-phase
roadmap, and the source comments and tests that recorded decisions inline. Where no date survives
for a decision, that is stated rather than guessed.

---

## 1. The roadmap, as planned

[`docs/roadmap.md`](../docs/roadmap.md) lays out eight phases, each a self-contained
spec → plan → implementation cycle, security requirements written inline per phase rather than
bolted on at the end:

| Phase | Scope |
|---|---|
| 0 | Auth + dashboard shell. Tagged `v0.1.0-scaffold` in the private history. |
| 1 | Budget ledger, the headline differentiator: real vendor quotes against a budget. |
| 2 | Guest list + RSVP, feeding the seating chart in Phase 3. |
| 3 | Seating chart, drag-and-drop, the most complex frontend feature. |
| 4 | Vendor tracker (Pro), quotes linked into budget line items. |
| 5 | Stripe billing + tier gating. |
| 6 | Wedding website builder (Pro), public RSVP. |
| 7 | Transactional email via Resend + React Email. |
| 8 | Marketing site migration from a separate `ideas-validation` repo into `apps/web`. |

Only Phase 0 is marked complete in the roadmap's own text. The other seven shipped: every surface
they describe exists in this tree and is covered in
[ARCHITECTURE.md](ARCHITECTURE.md), but the roadmap itself was never updated to check them off,
which is consistent with [docs/production-readiness.md](../docs/production-readiness.md) being the
launch checklist that also never got fully ticked. Both files were left exactly as they were found.

---

## 2. The seven dated design docs

Seven features got a **spec** (decisions and rationale, usually as a Decision / Choice / Rationale
log) before a **plan** (file map, ordered task list), before implementation. See
[docs/design-docs/README.md](../docs/design-docs/README.md) for the full index.

**2026-04-07: Auth, dashboard shell, budget ledger, guest list + RSVP.** Four features specced
and planned the same day: the monorepo scaffold, Better Auth, the dashboard shell, and the first
two product surfaces. The budget-ledger spec is the one worth reading in full: it records
choosing flat CRUD with query-time aggregation over a denormalized rollup, on the grounds that a
wedding has thirty to fifty line items and a rollup buys nothing but sync bugs. That choice is
checkable: the aggregation is still in `apps/api/src/routes/budget.ts` and it never grew a cache.

**2026-04-11: Dashboard enhancements, email templates, seating UX.** The seating-chart spec at
this date is scoped narrowly: three missing interactions (unassign a guest from the
table view, locate a guest's table from the guest panel, auto-seat a group at a chosen table), all
inside `apps/app/src/components/seating/seating-editor.tsx` and
`apps/app/src/lib/seating-draft.ts`, explicitly no API or schema changes. The plan calls out that
`unassignGuestFromSeat` already existed in the reducer with no UI trigger, a case of the backend
invariant (see [README §Seven decisions](../README.md#seven-decisions-worth-explaining)) arriving
before the frontend caught up to it. The plan also states plainly that the editor component is not
exempt from the 95% coverage gate just because it is a component file.

**2026-06-09: Exit-intent popup, page-tailored.** The last dated design doc before retirement,
two days later. The spec scopes a page → lead-magnet resolver as a pure, unit-tested function
rather than baking the mapping into each of the three call sites (landing layout, article layout,
lead-magnet page), and is explicit about what not to touch: the popup's existing Turnstile
protection and silent sequencer enrollment in `packages/marketing-api/src/routes/signup.ts` were
load-bearing and out of scope for this change.

**Undated in this snapshot.** The two-database split (Postgres for product data, D1 for marketing
and email preferences), the `RateLimiter` Durable Object, the serial five-job cron pipeline, and
the three-layer permission model are all real and all documented in
[ARCHITECTURE.md](ARCHITECTURE.md) with file citations, but no design doc or dated artifact for
them survived into this tree. Rather than assign them a plausible-looking date, they are listed
here as decisions this snapshot can prove happened but cannot date.

---

## 3. The rebrand

[DESIGN.md](DESIGN.md#palette-evolution) records a full palette change partway through the build:
sage-and-gold to terracotta-and-moss. The reasoning kept in that file is specific rather than
aesthetic: sage green was "the default signal for 'tasteful wedding thing,'" indistinguishable
from every competitor, and terracotta held up better against user-uploaded photography, the
dominant content on a wedding website. The old palette is still visible in parts of the marketing
site, which is disclosed in the same section rather than cleaned up for this archive. No date
survived for when the rebrand happened; the token diff between "Current palette" and "Original
palette" in DESIGN.md is the evidence.

---

## 4. Retirement

**2026-06-11: commit `b5372ed`.** The three Worker entry points were replaced with 410-Gone
stubs. That is the last dated event this tree can point to. They were restored for this archive so
the code actually runs; the restoration is noted inline in
[ARCHITECTURE.md](ARCHITECTURE.md#1-request-lifecycle). If you are browsing a commit between
`b5372ed` and the restore in the private history, `apps/api/src/index.ts` is the stub, not the real
composition root.

Before retirement, an AI customer-support integration was removed from the tree entirely: its
route modules, nonce store, and vendored dependency are gone, not merely disabled. See
[ARCHITECTURE.md §6](ARCHITECTURE.md#6-provenance-and-scope). No further detail survives in this
snapshot, and none is invented here.

---

## 5. Defects on record

Found during later review of this tree, not necessarily during the original build, so they are
labeled as such rather than folded into the timeline above.

| Defect | Where | Status |
|---|---|---|
| `signup.integration.test.ts` › "claims duplicate lead magnet retries so concurrent requests send once" fails on repeated runs. | `packages/marketing-api/src/integration/` | Open. Runs outside `test:coverage`, `test:scripts`, and `pnpm run verify`, so no check in this repo currently catches it. Looks like a genuine race in the test setup. |
| `requireWriter` is declared six times, once per route module, all six copies identical. | `apps/api/src/routes/*.ts` | Open. A five-minute extraction that never got made, the kind of duplication that stays harmless until one copy is edited and the others are not. Named explicitly in [ARCHITECTURE.md §2](ARCHITECTURE.md#2-the-three-layer-permission-model). |
| `apps/api/src/routes/wedding-website.ts`, 1,559 lines, carries no test coverage. | `apps/api/src/routes/wedding-website.ts` | Open, permanent exclusion. It is also the module holding the unauthenticated public RSVP handler discussed in the README. See [TESTING.md §1](TESTING.md#1-the-95-gate-is-per-file-not-per-repo). |

None of these were fixed as part of preparing this archive. The archive is a snapshot, and
patching source to make the write-up look cleaner would misrepresent what the tree actually
contains. They are recorded here for the same reason
[docs/production-readiness.md](../docs/production-readiness.md) is left with unticked boxes:
neither file was cleaned up to make the archive look better than the build was.

---

## 6. How decisions got kept

The mechanism, not just the content: every one of the seven features above went spec first, then
plan, then test-first implementation against the plan's task list, per the workflow rule in
[CLAUDE.md](../CLAUDE.md). That is why a reader four months later, reviewing this archive rather
than the live product, can still check whether a decision held up, instead of taking the README's
word for it. The budget-aggregation choice in §2 is one example; the seating-editor coverage
exemption is another. See [README §Built with AI agents](../README.md#built-with-ai-agents) for
what the agent-driven process enforced structurally.
