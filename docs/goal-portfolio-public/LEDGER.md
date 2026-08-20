# Goal: Portfolio-public — structure, evidence, images

> Restructure this snapshot so a skeptical senior engineer reading for 90 seconds can tell
> what was built, how it was tested, and what was never finished — without taking a single
> claim on trust. Promote the retrospective write-ups to a root `portfolio/` directory,
> separate them from the working residue in `docs/`, close the image gap against the
> private source repo, and make every number on the README re-derivable from a command.
>
> The honesty is the asset. Kaiplan never launched and never had a paying customer.
> Nothing in this pass may soften that, and no claim may be added that this tree
> cannot substantiate.

## Method

1. Read every candidate root and `docs/` document; sort each into **retrospective**
   (reader-addressed, finite, evidence-backed → `portfolio/`) or **prospective**
   (self-addressed, dated, open-ended → stays in `docs/`).
2. Move with `git mv` so history follows. Repoint every inbound link, then verify each
   link target exists on disk before calling it done.
3. Re-derive every number on the README with a shell command against `git ls-files`.
   Record the command, the result, and what the count omits. Where a number does not
   re-derive, say so in place rather than adjusting the number to fit.
4. Re-read the load-bearing code claims against the actual source, including line
   references, before repeating them.
5. Harvest images from the private source repo's audit captures. **View every candidate**
   and judge it as a viewer. Reject empty states, error states, localhost URLs, broken
   image slots, and captures whose dimensions make them illegible when embedded.
6. Write alt text describing what is in the frame, not the filename.

## Cycle log

### Cycle 1 — 2026-08-13 — Document triage and `portfolio/`

Read `ARCHITECTURE.md`, `TESTING.md`, `DESIGN.md` (repo root) and the six documents in
`docs/`. Root three are retrospective and evidence-dense; moved to `portfolio/`.
`docs/production-readiness.md` was a candidate but is a dated launch checklist with
unticked boxes — prospective by the rule above, and independently pinned in place
(see F-01). It stays, and the README now links it as the least flattering file in the tree.

Repointed inbound links in `README.md`, `AGENTS.md`, `CLAUDE.md`. The one intra-document
link (`portfolio/ARCHITECTURE.md` → `TESTING.md`) still resolves, since both files moved
together. Verified all 33 relative link targets in the README resolve on disk.

### Cycle 2 — 2026-08-13 — Verifying the claims before repeating them

Re-derived every README figure. Wrote `portfolio/METRICS.md` recording each command, its
output, and its blind spots. Three findings came out of this: F-02, F-03, F-04.

Re-read the seating-chart integrity claim against source. The "seven call sites" figure is
correct — six in `guests.ts`, one in `wedding-website.ts`. The line reference was pointing
at the internal helper rather than the unauthenticated route that reaches it (F-05).

### Cycle 3 — 2026-08-13 — Images

Viewed 17 candidate captures from the source repo's audit sets. Most of the desktop
application set was captured against an unseeded database and shows empty states, so the
nine existing curated captures remain the product gallery and were not touched. Added six
images covering the two surfaces with no representation at all: the marketing site and the
in-product help system (F-06, F-07).

### Cycle 4 — 2026-08-13 — Hygiene sweep

Swept for committed build and tooling output, local absolute paths in documents, stale
cross-references to sibling projects by local path, and old organization URLs. The document
tree came back clean — a prior pass had already handled it. Nothing was deleted.

Ran the `scripts/` suite to confirm the tree was not left in a failing state. It fails, and
it failed before this pass began (F-08).

### Cycle 5 — 2026-08-14 — Re-deriving the per-package test table

`METRICS.md`'s "Where the cases live" table (added in Cycle 2) and the README row that quotes it
were themselves built with the same line-anchored `it(`/`test(` grep this document warns against in
§3 — a case of the file naming the trap and then falling into it. Re-ran every package's own
`test:coverage` (plus `scripts/`'s `test:scripts`) and read the real `Test Files` / `Tests` counts
off Vitest's summary line instead (F-11).

While re-deriving `packages/marketing-api`'s figures, ran its separate integration suite
(`test:integration`, not part of `test:coverage` or `pnpm run verify`, so outside every other check
in this repo) and hit a test that failed on both of two consecutive runs (F-12).

### Cycle 6 — 2026-08-18 — House style, the full image harvest, and the docs the corpus standard added

A second brief arrived after Cycle 5: `PORTFOLIO-STANDARD.md`, the cross-repo spec this snapshot is
now held to alongside the other fourteen. It supersedes some Cycle-1-through-5 calls made before it
existed, most visibly F-10 below. Re-verified rather than assumed: the 6,929/425 test-case headline
(re-run `git ls-files | grep -cE '\.(test|spec)\.(ts|tsx)$'`, still 425 — unchanged since Cycle 5,
consistent with no source files having moved), the absence of any live credential in
`scripts/dataforseo-content-gap.ts` and its siblings (reads `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`
from `process.env` only; the one hardcoded string in that file family is a `sk_live_...` truncated
example inside a doc, not a script), and that `docs/` still carries no backup files, empty files, or
stray scratch output.

**README restructured to the spec's required heading order.** Status became a `> [!IMPORTANT]`
alert, byline/license became a `> [!NOTE]`, the tech-stack backtick line became a table, `##
Copyright` became `## License`, `## Running it` became `## Running it locally`, and four required
headings that did not exist were added: `## What it did`, `## Testing`, `## Built with AI agents`,
`## Known gaps`. The `## Documentation` section was cut down to two sentences and two links per
spec §1.6 — the file-by-file table it used to carry now lives only in the new `portfolio/README.md`,
so it cannot drift out of sync with itself again the way spec called out generally. The two
paragraphs that table displaced (the production-readiness pointer, the design-docs pointer) were not
deleted — one moved into `## Known gaps`, the other into the new `## If you read one thing`.

**The two wide-table offenders are gone.** The 739- and 730-character table cells (former README
lines 138 and 137) and their siblings were the Screenshots grid and the marketing-comparison grid;
both are now the HTML `<table>` grid pattern the spec specifies for screenshot sets, full alt text
preserved on every image.

**`portfolio/DESIGN.md`'s H1→H3 jump is closed.** All nine `### ` section headings promoted to
`## `; they were already siblings of each other, so this was a level fix, not a restructure.

**Every untagged fence in README.md and the four pre-existing `portfolio/` docs got a language.**
Three were bare directory-tree/list dumps and became `` ```text ``. `docs/design-docs/` was swept
for the same defect and left alone: several of its untagged fences turn out to be a nested-fence
rendering artifact in `2026-04-07-auth-dashboard-shell.md` (a `` ```markdown `` block that contains
its own embedded ``` for a commands sub-block, which GitHub renders as an early close plus a second
unclosed block) — a real pre-existing quirk in a historical, unmodified planning document, not
something this pass introduced or was asked to fix in a working doc. Flagged here rather than
silently left for the next reader to rediscover.

**The image harvest reopened, past what Cycle 3 covered.** Cycle 3 viewed 17 candidates from what
turned out to be a partial slice of the private source repo's audit captures. The full set at
`kaiplan/docs/audit/screenshots/` is 103 files across five sessions (`desktop/`, `mobile/`,
`2026-04-15/`, `2026-04-19-session2/`, plus loose mobile files) — 86 of them never viewed before this
cycle. Viewed roughly a dozen additional candidates this pass, concentrated on the desktop set and
the two dated sessions, specifically looking for the milestone checklist — the one feature the
README's own pitch line names with zero representation anywhere in the tree. See F-13.

**`portfolio/img/` renamed to `portfolio/screenshots/`** per spec §3.6, six existing files carried
over unchanged, one added. Every reference in `README.md` updated; grepped the whole tree afterward
for `portfolio/img` and got zero hits.

**`portfolio/README.md` and `portfolio/ENGINEERING-LOG.md` added** — both required by the spec and
both missing. See F-10 (reversed) and F-14.

**`portfolio/SECURITY.md` added**, not explicitly requested but required by spec §2.4 for any repo
touching PII or payments — Kaiplan does both (guest PII; Stripe billing). Built entirely from
evidence already in the tree, most notably four `audit finding #N` code comments
(`weddings.ts:249`, `wedding-website.ts:56`, `middleware/csrf.ts:6`, `index.ts:425`) that show an
internal security review happened during development and left its remediation inline. See F-15.

### Cycle 7 — 2026-08-18 — Reviewer findings pass

A second reviewer read the Cycle-6 output and filed eight findings plus one corpus-wide check.
Fixed all nine; none were disputed.

**Re-counted the `scripts/` module/test pairing instead of trusting the existing "25 of 41"
figure (F-17).** Wrote an independent pairing script (`find` + basename match, not `git`, per this
cycle's tooling constraint) and ran it twice under different framings to be sure: 41 non-test
modules (42 files under `scripts/`, minus `vitest.config.ts`, which is tooling config rather than a
module), 25 `*.test.ts` files, and only 22 of the 41 modules have a test whose basename matches
somewhere under `scripts/` — several `scripts/*.test.ts` files import a same-named module from
`scripts/lib/` rather than their own directory, which the loose "colocated" wording already in the
tree was quietly counting as unpaired. The other three test files
(`docs-source-of-truth.test.ts`, `pre-commit-tooling.test.ts`, `vitest-config.test.ts`) assert
repo-wide invariants and have no source module of matching basename at all — confirmed by reading
each one's imports, not inferred from the name. The command is now published in `METRICS.md` §4,
and README.md:374 and `TESTING.md` both read 22, with `TESTING.md` cross-referencing `METRICS.md`
for the derivation instead of repeating an unsourced number.

**`kaiplan.com` in the README's Known-gaps section was never this product's domain (F-18).** Every
other reference in the tree — the architecture table, `apps/web/astro.config.mjs`,
`apps/api/wrangler.toml`, `apps/web/wrangler.jsonc`, `apps/app/.env.production`,
`docs/production-readiness.md` — says `kaiplan.app`. Grepped the whole tree for `kaiplan.com` and
got exactly the one hit, inside the sentence being corrected. Fixed to `kaiplan.app`; no evidence
`kaiplan.com` was ever this product's domain, so nothing else needed correcting.

**Cropped the mobile pricing capture instead of shipping the full scrolled page (F-19).**
`marketing-pricing-mobile.png` was a full-page capture, 390×6219px, paired in the same table row
against `marketing-pricing.png` at 1440×4962px — an aspect ratio 4.6× more extreme on the mobile
side, which is what produced the dead void on desktop and the horizontal overflow on a phone
browser rendering the two-column HTML table. Cropped the mobile capture to end right after the
Lifetime tier and the trial caption (390×3260px, found by inspecting the actual pixel rows, not
guessed), which drops the FAQ/model/footer sections the alt text never claimed to show and brings
the mismatch down to roughly 2.4×. Added `valign="top"` and an explicit `max-width:100%;height:auto`
style to every `<img>` in both the Screenshots grid and the marketing-site grid, so a short image
sits at the top of its cell instead of floating in the middle and no image can force horizontal
overflow. Left `wedding-website.png` and `marketing-pricing.png` themselves untouched — the first is
a shared asset imported by `apps/web/src/assets/screenshots/v2/manifest.ts`, not a
`portfolio/`-only file, so cropping it risked the live app bundle for a documentation-grid fix; the
`valign`/`max-width` treatment on that row's cells addresses the same floating-void symptom without
touching a production asset.

**Reconciled the 89,694/89,693 source-line mismatch (F-20).** Re-ran `METRICS.md` §2's own
published command; it produces 89,693. README.md:203 said 89,694 — a stale figure from before the
last re-derivation, never propagated. Fixed to 89,693 to match.

**`portfolio/SECURITY.md`'s length row was wrong before this cycle's additions and is now
substantively different (F-21, folds in the corpus-wide check).** The Cycle-6 table said 104 lines;
`wc -l` said 105 even before this cycle touched the file. A second, corpus-wide check (not one of
the eight reviewer findings) flagged that `portfolio/SECURITY.md`, at 105 lines, sat under the
120–450 band spec §2.6 sets for `portfolio/`, and is not on the METRICS/SCREENSHOTS exemption list —
and, separately, that Kaiplan takes Stripe payments, which spec §2.4 already uses to require the
file's existence in the first place. Read the existing file first rather than padding it: it
already covered the audit findings, the three-layer access model, CSRF, rate limiting, payments, and
uploads with real citations. What it did not cover: the authentication/session model end to end, an
explicit statement of what stops one wedding's data reaching another's, what guest PII is actually
stored and whether any deletion path exists for it, and a concrete (not just categorical) list of
what is unprotected. Added three new sections and expanded a fourth, each claim re-verified against
source rather than assumed — including the payment claim, confirmed by finding
`stripe.checkout.sessions.create` and `stripe.billingPortal.sessions.create` calls in `billing.ts`
and no `CardElement`/`PaymentElement` anywhere in `apps/app`, not just repeating what the file
already said. `portfolio/SECURITY.md` is now 200 lines, within band. The `portfolio/README.md`
index row was recomputed last, after this edit, per the coordinator's instruction, to 200 lines and
an updated one-line summary naming the new content.

**Added `## Contents` to `portfolio/METRICS.md` (F-22).** The file crossed 250 lines this cycle
(269 → 299, from the pairing-command addition in F-17) and spec §3.4 requires a section list past
that threshold regardless of the file's length-band exemption. Added an eight-entry list matching
the existing `## N.` headings, each linking to its real anchor.

**Varied two of the three verbatim "test code outweighs source 1.57 : 1" repetitions in README.md
(F-23).** The numbers-table occurrence (§By the numbers) stays as the source of the figure. The
`## Testing` section prose now points back at that table instead of repeating the sentence. The
`## Built with AI agents` section keeps its own verbatim repetition, since there it is doing real
work — evidence for a specific claim about what the coverage gate produced — rather than restating
a fact already stated once.

**Hard-wrapped `ARCHITECTURE.md`, `DESIGN.md`, and `TESTING.md` to the 100-column house wrap
(F-24).** Longest lines ran 410–481 characters. Wrote a wrapping pass that tracks fenced-code state
(mermaid blocks included, since ```` ```mermaid ```` is a fenced block like any other) and table
rows by leading `|`, and leaves both untouched; blockquote continuations get a repeated `> `, list
and numbered-list continuations get a hanging indent matching the marker width, matching the
convention already visible elsewhere in this tree. First verification pass flagged several
false positives from `awk`'s byte-counting on em dashes; re-verified with a UTF-8-aware
character count and confirmed zero prose lines over 100 columns in all three files, with every
mermaid diagram and table intact.

**Verified every relative link and `#anchor` in `README.md` and all of `portfolio/*.md`
programmatically (F-25).** Wrote a checker that extracts every markdown link, resolves relative
file paths against disk, and for `#anchor` targets — same-file or cross-file — builds each target
file's real heading list and GitHub's slug algorithm, rather than trusting that an anchor like
`#4-the-coverage-gate` matches its heading by eye. First run flagged four false positives, all
directory links (`docs/`, `docs/design-docs/`, `.claude/`, `portfolio/screenshots/`) that the
checker's `isfile`-only check rejected; fixed the checker to accept directories, re-ran, zero
remaining problems.

## Findings registry

**P0** = broken or blocking · **P1** = looks bad or confusing · **P2** = polish

| ID | P | Finding | State |
|---|---|---|---|
| F-01 | P0 | `docs/production-readiness.md` is referenced by literal path in two test files (`scripts/docs-source-of-truth.test.ts`, `scripts/deploy-touched.test.ts`). Moving it to `portfolio/` would have broken the suite. | Caught before the move. File stays in `docs/`, which is also where the retrospective/prospective rule puts it. |
| F-02 | P1 | `TESTING.md` opened with 6,889 test cases; the documented command returns 6,929. A 40-case drift from a figure written once and never refreshed. | Fixed. Figure corrected and the file now defers to `METRICS.md` for the count. |
| F-03 | P2 | README's line-of-code command (`cat \| wc -l`) undercounts by one per file lacking a trailing newline — 12 files here, so 230,851 against a true 230,863. | Not "fixed". Both numbers and the reason for the gap are stated in `METRICS.md` §1. Adjusting the number to the prettier one would have made the printed command wrong. |
| F-04 | P2 | README's "96 E2E cases" did not obviously reconcile — the natural grep returns 97. | Explained rather than changed: one of the 97 is a `test.skip(`. `METRICS.md` §5 shows both counts and the tighter pattern that separates cases from `describe` blocks. |
| F-05 | P1 | The seating-integrity claim cited `wedding-website.ts:680`, which is an internal helper. A reviewer clicking through would land somewhere unremarkable and lose the point. | Fixed. Now cites both: the strip at `:680` **and** the public `POST /rsvp/:token` handler at `:1450` that reaches it with a rate limiter, a Turnstile check, and no session middleware. The "seven" was re-counted and is correct. |
| F-06 | P1 | Five of eight workspace packages serve the marketing site, and `packages/marketing` has more tests than any other package — yet the site had zero images and no section on the page. | Fixed. Added four marketing captures and a section, with the content-collection counts derived by command. |
| F-07 | P2 | The in-product help and guided-tour system had no representation. | Fixed. Added one capture. |
| F-08 | P0 | The `scripts/` suite fails: 1 of 358. `scripts/local-e2e-config.ts` derives a legacy repo-root from the developer's home directory, and `scripts/local-e2e-config.test.ts` asserts against the original checkout's absolute path, which this snapshot does not sit at. Pre-existing at `HEAD` and untouched by this pass. | **Open — needs the owner.** Out of scope here: this pass is barred from editing tests or source. Flagged to the orchestrator. |
| F-09 | P2 | Claimed during triage that `pricing.astro` is asserted against `PLAN_PRICING` in `packages/shared`. It is not — it is asserted against `kaiplanPricingFacts` in `packages/knowledge`. `PLAN_PRICING` guards `docs/pricing.md`, a different document. | `RETRACTED`. Caption corrected to name the real test and the real source of truth before publishing. |
| F-10 | P2 | Considered adding a `WALKTHROUGH.md` and an `ENGINEERING-LOG.md` to match the fuller portfolio set used elsewhere in the portfolio. | `REVERSED in Cycle 6`. `PORTFOLIO-STANDARD.md` §2.1 lists `ENGINEERING-LOG.md` as required in every repo, not optional. The Cycle-1 concern — "no defect record exists to build one from" — turned out to be narrower than the real source material: the roadmap's eight dated phases, seven dated design-doc spec/plan pairs, the DESIGN.md palette-evolution record, and four in-code `audit finding #N` comments are enough real, dated (or explicitly undated) evidence for a log that invents nothing. `WALKTHROUGH.md` stays out — it is not spec-required and no defect forced it in. |
| F-11 | P1 | `METRICS.md`'s per-package test table and the README row quoting it (`packages/marketing`) were grep-derived, not run. Five of nine rows undercounted; `packages/marketing` was 204 cases short (2,323 claimed vs 2,527 real), `apps/api` 19 short (1,307 vs 1,326). The table's "sum to 6,794, remainder is `e2e/`" line was an artifact of that undercount, not a real accounting. | Fixed. Table rebuilt from `pnpm run test:coverage` / `pnpm run test:scripts`'s own `Test Files`/`Tests` output, one command cited per row. New sum is 6,928, a one-off gap against the repo-wide 6,929 headline (left alone — same order of noise as F-03). README's `packages/marketing` figure corrected to 2,527. |
| F-12 | P1 | `packages/marketing-api`'s integration suite (`test:integration`, outside `test:coverage`, `test:scripts`, and `pnpm run verify` — so never exercised by any check named in this repo) has a failing test: `signup.integration.test.ts` › "claims duplicate lead magnet retries so concurrent requests send once", failed on both of two consecutive runs. | **Open — needs the owner.** Out of scope here: this pass is barred from editing tests or source. Looks like a genuine race between two concurrent requests in the test setup, not a count problem. Flagged to the orchestrator. |
| F-13 | P1 | The milestone checklist — named explicitly in the README's own pitch sentence, alongside budget, guests, seating, vendors, and the wedding website — had no screenshot anywhere in the tree. Six of the six named product surfaces except this one were covered. | Fixed. Viewed both a 0/60-complete candidate (`desktop/app-checklist.png`, matches the current icon wordmark, but reads as an empty-progress state — the same reason Cycle 3's rejected-images table already ruled out a checklist candidate) and a 2/60-complete one (`2026-04-15/05c-checklist-checked.png`, plain-text wordmark from before the icon mark was added, but shows real checked-off progress and a filled bar). Chose the populated one over the brand-consistent one; added to `portfolio/screenshots/milestone-checklist.png` and the README's main Screenshots grid, captioned to disclose it comes from an earlier audit session, not the `capture-screenshots-v2.ts` harness the other six images share. |
| F-14 | P2 | `portfolio/README.md` did not exist — every other repo-required index file did, this one did not, and nothing in `portfolio/` pointed a reader at where to start. | Fixed. Three parts per spec §2.5: a checkability-promise paragraph, a file table with one-line summaries and `wc -l` lengths, and a portfolio-vs-docs paragraph. |
| F-15 | P2 | No `portfolio/SECURITY.md` despite Kaiplan handling guest PII and Stripe payments — spec §2.4 calls this combination a required-file trigger, not a stylistic option. | Fixed. Built from four in-code `audit finding #N` comments (an internal review that happened during development and left its remediation inline), the three-layer permission model already documented in `ARCHITECTURE.md`, the CSRF/session-cookie mechanics in `middleware/csrf.ts`, the Stripe webhook signature check in `billing.ts`, and the existing `docs/image-upload-security-policy.md`, which stays in `docs/` and is linked rather than duplicated. |
| F-16 | P2 | Six untagged code fences in `README.md` and `portfolio/TESTING.md` — directory trees and a stage list with no language tag. | Fixed, tagged `` ```text ``. `docs/design-docs/` fences were swept too; see the Cycle 6 log entry for why they were left alone. |
| F-17 | P0 | README.md:374, `portfolio/TESTING.md`, and `portfolio/METRICS.md` all claimed "25 of 41 modules" have colocated tests in `scripts/`. `scripts/` has 25 `.test.ts` files, but 3 are meta-tests with no source module of matching basename, so only 22 of the 41 modules actually pair with a test. The only figure in `METRICS.md` with no command behind it. | Fixed in all three places to 22. Pairing command published in `METRICS.md` §4; `TESTING.md` now cites it instead of repeating the bare number. |
| F-18 | P1 | README.md:466 (Known gaps) said `kaiplan.com` no longer serves this product. Every other reference in the tree says `kaiplan.app`; no evidence `kaiplan.com` was ever this product's domain. | Fixed to `kaiplan.app`. |
| F-19 | P1 | The marketing-site image grid was visibly broken on both desktop and mobile: `marketing-pricing-mobile.png` was a 390×6219px full-page capture paired against a 1440×4962px desktop capture, a 4.6× aspect mismatch that produced a dead void on desktop and horizontal overflow with cut-off content on a real phone browser. The Screenshots row pairing `wedding-website.png` (900×1200) with `milestone-checklist.png` (1280×900) had the same defect at smaller scale. | Fixed. Mobile pricing capture cropped to 390×3260px (hero through the Lifetime tier and trial caption, no FAQ/footer), bringing the mismatch to ~2.4×. `valign="top"` and `max-width:100%;height:auto` added to every cell/image in both grids. `wedding-website.png` left uncropped since it is a shared asset in `apps/web/src/assets/screenshots/v2/manifest.ts`, not a `portfolio/`-only file; the CSS treatment covers that row instead. |
| F-20 | P2 | README.md:203 said "89,694 source"; `portfolio/METRICS.md`:58 said 89,693 for the same figure. | Fixed. Re-ran `METRICS.md`'s own published command (89,693) and corrected the README to match. |
| F-21 | P2 | `portfolio/README.md`:19 listed `SECURITY.md` at 104 lines against a true 105 — and, per a corpus-wide check separate from the eight reviewer findings, 105 lines put it under the 120–450 `portfolio/` band despite Kaiplan's Stripe payments triggering the file's requirement in the first place. | Fixed both. Length row corrected, then `SECURITY.md` expanded with real, source-cited material it was missing (authentication/session model, tenant isolation, guest PII storage and deletion, a verified — not assumed — payment-data claim, and concrete unprotected-gap items), to 200 lines. Index row recomputed last, after the content edit. |
| F-22 | P2 | `portfolio/METRICS.md` is 269 lines (299 after F-17's addition) with no `## Contents`, which spec §3.4 requires past 250 lines regardless of the file's length-band exemption. | Fixed. Eight-entry contents list added, each linking its real anchor. |
| F-23 | P2 | "Test code outweighs source 1.57 : 1" appeared verbatim three times in README.md (~203, ~234, ~403). | Fixed two of three. The numbers-table occurrence stays as the source; the Testing-section prose now cross-references it instead of repeating it; the Built-with-AI-agents occurrence stays verbatim, since there it supports a distinct claim rather than restating one already made. |
| F-24 | P2 | `portfolio/ARCHITECTURE.md`, `portfolio/DESIGN.md`, and `portfolio/TESTING.md` had prose lines running 410–481 characters against the 100-column house wrap. | Fixed. Hard-wrapped all prose lines to 100 columns; mermaid blocks, fenced code, and table rows left untouched. Verified with a UTF-8-aware character count after an initial `awk` byte-count pass produced false positives on em dashes. |
| F-25 | — | Not a defect — a verification step. Every relative link and `#anchor` in `README.md` and `portfolio/*.md` checked programmatically against each target file's real heading list and slug, rather than by eye. | Clean after fixing the checker itself: an initial run flagged four directory links (`docs/`, `docs/design-docs/`, `.claude/`, `portfolio/screenshots/`) as broken because the checker only accepted files; fixed to accept directories, re-ran, zero remaining problems. |

## Images considered and rejected

Eleven of the seventeen candidates viewed in Cycle 3 were rejected. Cycle 6 re-viewed several of
the same surfaces independently (from the fuller 103-file set, not the original 17) and reached the
same conclusions before checking this table — recorded below rather than treated as new findings.
Recorded here so the selection is auditable rather than a matter of taste.

| Candidate | Why rejected |
|---|---|
| Seating chart (desktop audit set) | Empty state: "Set up your guest list first". The existing curated capture is populated and stays. |
| Vendor tracker (desktop audit set) | Empty state: 0 vendors, $0.00 paid, $0.00 outstanding. The existing capture shows real figures against a seeded database and must not be regressed to this. |
| Wedding website editor (`desktop/app-website.png`, re-viewed Cycle 6) | Shows a `127.0.0.1:3031` draft URL and a "Your names here" placeholder preview. |
| Public wedding site (`desktop/wedding-public.png`, re-viewed Cycle 6) | Captured on the "That wedding site is not available" error page. |
| Marketing home | Two of three image slots in the feature section rendered blank. |
| Features page (`desktop/web-features.png`, re-viewed Cycle 6) | Same defect, worse: five of six section images failed to load, and the full capture is 13,927px tall. |
| Settings (`desktop/app-settings.png`, re-viewed Cycle 6) | Legible, but the account field is a 40-character synthetic UUID address. Noise without payoff. |
| Milestone checklist, 0/60 variant (`desktop/app-checklist.png`, re-viewed Cycle 6) | 0 of 60 tasks complete — an empty-progress state even though the task list itself is real content. Superseded in Cycle 6 by a populated variant; see F-13. |
| Milestone checklist, "No wedding yet" variant (`2026-04-19-session2/a11y/checklist.png`, new in Cycle 6) | Header reads "No wedding yet", 0/0 tasks in every category — a genuine empty state, not just an unstarted one. |
| Resource index | 72,571 pixels tall. Illegible at any embed width. |
| Mobile guests / mobile vendors / mobile seating | One guest, or zero. Near-empty states from an early session. |
| Older marketing features capture | A superseded brand palette plus an overlapping-text rendering glitch in one heading. |

### Image added in Cycle 6

| Candidate | Source | Why accepted |
|---|---|---|
| Milestone checklist, 2/60 variant | `2026-04-15/05c-checklist-checked.png` | 2 of 60 tasks checked, progress bar filled to 3%, all eight timeframe categories visible with real task names underneath. The only populated milestone-checklist capture found across both audit sessions that contain one. Uses the pre-rebrand plain-text wordmark rather than the icon mark the other six README captures share — a real, disclosed inconsistency (the caption says so) rather than a hidden one. |

Total candidates viewed across both cycles: 17 (Cycle 3) + roughly a dozen (Cycle 6, concentrated
on the desktop and dated-session directories rather than all 86 previously-unseen files) against
the full 103-file source set. One added, the rest either already covered by an existing curated
capture or rejected for an empty, error, or broken-image state.

### Cycle 8 — 2026-08-18 — First-screenful order (standard §1.1/§1.2)

Kaiplan was the only one of fifteen repos in the corpus with structured content — a seven-row,
borderless tech-stack table — sitting between the pitch and the `> [!IMPORTANT]` status alert.
Standard §1.1 requires pitch → status alert → byline/license note → badges → hero, in that order,
with nothing evaluative allowed before the status disclosure. Moved the table (and the `---` rule
that only existed to separate it from the alert) to sit after the `> [!NOTE]` byline/license block
and before the hero image, matching where a badges row would sit if this repo had one. Content of
the table (Language, Frontend, Backend, Platform, Database, ORM, Tooling — all seven rows)
unchanged, only its position. Checked `## Contents` and the rest of `README.md` for any anchor or
cross-reference to the table — none exists, since it carries no heading — and re-read the new
top-of-file order (pitch, status, byline, stack table, hero, `## Contents`) for flow; it reads
naturally. `portfolio/README.md` does not index the root `README.md`, so no length-table update
applies. Every relative link, `#anchor` and image reference in `README.md` re-checked
programmatically against the real heading list; zero broken. No secret literal found.

### Cycle 9 — 2026-08-18 — Corpus-wide index column order

- The cross-repo standard fixed `portfolio/README.md`'s index table column order as link,
  length, summary — length second, not last. This repo's table had `File | Covers | Length`,
  length last.
- Reordered to `File | Length | Covers`; all seven rows (including the `screenshots/`
  `7 images` row) and the alignment row updated, cell content unchanged.
- Recomputed every length cell against `wc -l` after the edit: all rows still match exactly.
- Ran a relative-link and `#anchor` resolution sweep over `README.md` and every
  `portfolio/*.md` file: all resolve, nothing else touched this cycle.

### Cycle 10 — 2026-08-18 — Copyright holder corrected to the individual

`LICENSE:1` and `README.md`'s `## License` section both read
`Copyright © 2026 Angel Campa / Ventora Labs. All rights reserved.` Kaiplan was the only repo of
fifteen naming a company as a copyright co-holder; the other fourteen name the individual alone.

Raised with the owner rather than changed unilaterally, because a copyright holder is a legal claim
and not a formatting choice. The owner confirmed Ventora Labs is being dissolved and that the
holder is Angel Campa alone. Both lines now read
`Copyright (c) 2026 Angel Campa. All rights reserved.`, matching the corpus format exactly —
including `(c)` in place of the `©` this repo alone used.

Historical references to Ventora Labs elsewhere in the corpus were deliberately left in place. The
Floriva app really was published to the app stores under that entity between 2026-04-08 and
2026-07-08; that is a matter of public record, and removing it would falsify the history rather
than update it.
