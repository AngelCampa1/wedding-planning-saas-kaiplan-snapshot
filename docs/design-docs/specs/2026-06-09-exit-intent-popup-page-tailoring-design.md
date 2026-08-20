# Exit-Intent Popup — Page-Tailored Lead Magnet, Email-Only Capture

**Date:** 2026-06-09
**Status:** Draft for review
**Owner:** Angel Campa

## Problem

The canonical marketing site (`apps/web`, `@kaiplan/web`) is supposed to show an
exit-intent popup that captures a visitor's email, emails them a lead magnet, and
quietly enrolls them in a nurture email sequence. The founder reports it "seems
gone." Investigation shows the machinery exists and is wired, but two real gaps
remain, plus one unverified rendering concern:

1. **Lead magnets are not page-tailored.** Both `landing-layout.astro` and
   `article-layout.astro` pass the *entire* global list
   (`config.leadMagnetOptions` = all 16 magnets) into the popup, which then
   renders a radio chooser. This is a generic 16-item menu, not "the resource
   for the page you're viewing." (Requirement #4 unmet.)
2. **Capture is not email-only.** Because a multi-option list is passed, the
   popup shows a resource picker instead of a single email field.
   (Requirement #1 — "enter just their email" — unmet.)
3. **Live rendering unverified.** The popup is a `client:only="react"` island, so
   it is absent from server HTML by design (this is why a `curl` of the page
   shows nothing — not proof it's broken). Actual live/local behavior must be
   confirmed in a browser, and any real regression fixed.

## What already works (reuse, do not rebuild)

- Exit-intent triggers: desktop `mouseleave` (top edge, 5s arm delay) + mobile
  scroll-back. `packages/marketing/src/components/exit-intent-popup.tsx`.
- Cloudflare Turnstile protection, server-validated via `guardPublicForm`
  (`packages/marketing-api/src/lib/public-form-protection.ts`). (Requirement #3.)
- Lead-magnet email delivery via Resend
  (`packages/marketing-api/src/services/email.ts`, tokenized download URLs).
- **Silent** sequencer enrollment: `enrollSignupSequences` in
  `packages/marketing-api/src/routes/signup.ts` enrolls each signup into
  `kaiplan-fulfillment-welcome` and a nurture sequence
  (`leadMagnetMetadata[slug].nurtureSequenceId ?? "kaiplan-nurture-value-1"`) as
  background tasks. The visitor is never told about the sequence. (Requirement #2.)
- Suppress window (30 days), honeypot, rate limiting, PostHog analytics, signup
  attribution.

**Key enabler:** the popup *already* supports email-only mode. When it receives a
single `leadMagnet` and **no** `leadMagnetOptions`, `selectableLeadMagnets` has
length 1, `showResourcePicker` is false, and it submits that one magnet's
`leadMagnetSlug` + `leadMagnetTitle`. So tailoring is mostly a matter of passing
the right single magnet per page instead of the global list.

## Design

### 1. Page → lead-magnet resolver (new, pure, unit-tested)

New module `packages/marketing/src/lib/resolve-page-lead-magnet.ts`:

```ts
resolvePageLeadMagnet(input: {
  pathname: string;
  knowledge: LeadMagnet[];      // config.leadMagnetOptions source of truth
  hint?: string;                // optional page title/slug/topic from the page
  explicitSlug?: string;        // /free/[slug] and frontmatter override
}): LeadMagnet
```

Resolution order:
1. `explicitSlug` if it matches a known magnet (used by `/free/[slug]` so a lead
   magnet page offers its own resource, and by any page that sets a frontmatter
   override).
2. **Rule-based keyword match** over a normalized haystack built from
   `pathname` + `hint`. An ordered rule table maps keywords → slug. First
   matching rule wins so specific rules precede generic ones. Representative
   rules (final table lives in code, fully tested):
   - `hidden cost`, `hidden fee` → `hidden-cost-calculator-worksheet`
   - `budget`, `cost`, `afford`, `price`, `spend` → `budget-template`
   - `red flag`, `scam`, `avoid vendor` → `vendor-red-flag-checklist`
   - `contract` → `vendor-contract-review-checklist`
   - `vendor`, `photographer`, `caterer`, `florist`, `dj`, `planner` →
     `vendor-interview-question-list`
   - `timeline`, `day-of`, `schedule` → `wedding-timeline-template`
   - `checklist`, `to-do`, `steps`, `plan a wedding` → `complete-wedding-checklist`
   - `seating`, `seat`, `table chart` → `seating-chart-planning-template`
   - `rsvp`, `guest list` → `wedding-rsvp-tracker`
   - `venue` → `wedding-venue-comparison-worksheet`
   - `photo`, `shot list` → `wedding-photography-shot-list`
   - `vows` → `wedding-vows-writing-worksheet`
   - `honeymoon` → `honeymoon-budget-planner`
   - `beauty`, `hair`, `makeup`, `skincare` → `pre-wedding-beauty-timeline`
   - `coordinator`, `day-of coordinator` → `wedding-day-coordinator-notes`
   - `compare`, `alternative`, `vs`, `best app`, `app comparison` →
     `wedding-app-comparison-scorecard`
3. **Fallback:** `budget-template` (broad, highest-intent). If even that is
   missing from `knowledge`, fall back to the first entry.

The resolver is pure (no Astro, no DOM), so it gets ≥95% unit coverage in
`resolve-page-lead-magnet.test.ts`.

### 2. Layout wiring

`landing-layout.astro` and `article-layout.astro`:
- Compute `const pageLeadMagnet = resolvePageLeadMagnet({ pathname: Astro.url.pathname, knowledge: config.leadMagnetOptions ?? [], hint, explicitSlug })`.
- Add optional props `leadMagnetHint?: string` and `leadMagnetSlug?: string` so
  dynamic page templates (guides, best, compare, alternatives) can pass their
  page title/topic for sharper matching, and `/free/[slug]` can pin its own
  magnet. When unset, the resolver still works off `pathname`.
- Pass `leadMagnet={pageLeadMagnet}` to `<ExitIntentPopup>`.
- **Stop passing `leadMagnetOptions`** to the popup → forces email-only mode.

`lead-magnet-page.astro` (the `/free/[slug]` template, currently passes
`leadMagnetOptions={config.leadMagnetOptions}`): switch to the single
page-resolved magnet via `explicitSlug` of that page.

Dynamic templates that already know their subject (e.g.
`resources/guides/[slug].astro`, `resources/best/[slug].astro`,
`compare/**/[slug].astro`) pass `leadMagnetHint` = the page title/topic.

`config.leadMagnetOptions` stays as the **knowledge source** the resolver reads;
it is simply no longer handed to the popup as a chooser list.

### 3. Copy & design refresh (per repo marketing-copy rule)

- Refresh the popup copy in `apps/web/src/config/site.ts` (`config.copy.exitPopup`
  headline/description/ctaText/success messaging) and ensure per-magnet
  `description` text reads naturally. Because the magnet is now page-specific,
  copy should lean on the magnet's own title/description (the popup already
  prefers `selectedLeadMagnet.description`/`title` when present).
- Run the copy through the **`humanizer`** skill then **`third-grade-copy`** skill
  before finalizing (mandatory per the workspace-level `CLAUDE.md` and repo `CLAUDE.md`).
- Light visual polish only; preserve the design canon (pill buttons,
  `border-radius: 9999px`) and brand tokens. No structural redesign.

### 4. Verification

- Unit: new resolver tests; update `exit-intent-popup.test.tsx` for the
  single-magnet email-only path; update `site.test.ts` expectations that assert
  the 16-option list is consumed by the popup (it no longer is).
- Browser (Playwright/preview): on the local marketing dev server, confirm on
  several page types (home, a budget guide, a vendor guide, a compare page,
  `/free/[slug]`) that: popup appears on exit intent, shows **only** an email
  field, displays the page-appropriate magnet, passes Turnstile (dev bypass when
  key empty), submits the correct `leadMagnetSlug`, and shows success. Confirm
  the network call carries the expected slug per page.
- Confirm silent sequencer enrollment fires server-side (background task /
  log assertion in the marketing-api tests), and that **no** sequence wording
  appears anywhere in popup/email copy shown to the visitor.
- Run repo quality gates: `lint`, `typecheck`, package `test:coverage` (≥95% on
  touched files), local marketing e2e.

## Out of scope

- No changes to the sequencer service itself (a separate repository).
- No new lead magnets authored; mapping uses the existing 16.
- No change to Turnstile keys or the suppress-window policy.
- `packages/marketing`'s standalone story is unchanged; all edits serve the
  canonical `apps/web` stack that embeds `marketing-api`.

## Risks

- **Mapping coverage:** 100+ guides funnel through keyword rules. Mitigation:
  budget-template fallback is always sensible; dynamic templates pass a topic
  hint; rules are ordered and unit-tested with representative slugs.
- **Stale deploy vs. real bug:** if browser verification shows the popup already
  works live, the "missing" report was the suppress window / no real trigger —
  in that case scope narrows to tailoring + copy, and we still deploy.

## Workflow

Sub-agent driven per repo CLAUDE.md: scoped implementation in a worktree,
mandatory reviewer agent, multiple review/fix cycles until clean, merge to
`master`, worktree/branch cleanup, then deploy the touched Cloudflare project
(`kaiplan-web`). Prefer cheaper agent tiers (lite/editor) for bounded steps.
