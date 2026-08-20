# Exit-Intent Popup Page-Tailoring Implementation Plan


**Goal:** Make the existing exit-intent popup capture email-only and offer a single lead magnet tailored to the page being viewed, while preserving the already-working Turnstile protection and silent sequencer enrollment.

**Architecture:** Add a pure, unit-tested page→lead-magnet resolver in `@kaiplan/marketing`. The three popup call sites (landing-layout, article-layout, lead-magnet-page) compute one page-appropriate magnet from the route + page title and pass it as the single `leadMagnet`, dropping the global `leadMagnetOptions` list — which flips the popup (already capable) into email-only mode. Refresh popup copy through the mandatory writing skills. Verify in a browser and through the local e2e + coverage gates.

**Tech Stack:** Astro, React 19, TypeScript, Vitest, Tailwind, Cloudflare Workers (embedded marketing-api), Cloudflare Turnstile, Resend, Sequencer (CF Access).

---

## Context the implementer needs

- The popup component `packages/marketing/src/components/exit-intent-popup.tsx` already supports email-only mode: given a single `leadMagnet` and **no** `leadMagnetOptions`, `selectableLeadMagnets.length === 1`, `showResourcePicker` is `false`, and it submits that magnet's `leadMagnetSlug` + `leadMagnetTitle`. **Do not rewrite the popup's submit/Turnstile/suppress logic.**
- Lead-magnet knowledge is `leadMagnetKnowledge` in `packages/knowledge/src/marketing.ts` (entries: `{ slug, title, description }`). It is surfaced as `config.leadMagnetOptions` in `apps/web/src/config/site.ts`. There is **no** category field; map by keywords.
- The `LeadMagnet` type is exported from `packages/marketing/src/types`.
- Silent sequencer enrollment already happens server-side in `packages/marketing-api/src/routes/signup.ts` (`enrollSignupSequences`). **No copy or response anywhere may mention the sequence.** Do not change this behavior; only ensure the slug submitted by the popup is correct so the right nurture sequence is chosen.
- Both layouts already receive a `title` prop; use `title` + `Astro.url.pathname` as the resolver hint. `/free/[slug]` pages know their own magnet slug.

## File structure

- Create: `packages/marketing/src/lib/resolve-page-lead-magnet.ts` — pure resolver.
- Create: `packages/marketing/src/lib/resolve-page-lead-magnet.test.ts` — unit tests.
- Modify: `packages/marketing/src/lib/exit-popup-props.ts` — add a helper to build the single-magnet popup props (optional; or do inline in layouts).
- Modify: `packages/marketing/src/layouts/landing-layout.astro` — pass single resolved magnet, drop options.
- Modify: `packages/marketing/src/layouts/article-layout.astro` — same.
- Modify: `packages/marketing/src/components/lead-magnet-page.astro` — pass that page's own magnet, drop options.
- Modify: `packages/marketing/src/components/exit-intent-popup.test.tsx` — assert email-only single-magnet behavior.
- Modify: `apps/web/src/config/site.test.ts` — adjust expectations that the 16-option list is consumed by the popup.
- Modify: `apps/web/src/config/site.ts` — refreshed popup copy (after writing-skills pass).

---

### Task 1: Page→lead-magnet resolver

**Files:**
- Create: `packages/marketing/src/lib/resolve-page-lead-magnet.ts`
- Test: `packages/marketing/src/lib/resolve-page-lead-magnet.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { resolvePageLeadMagnet } from "./resolve-page-lead-magnet";
import type { LeadMagnet } from "../types";

const knowledge: LeadMagnet[] = [
  { slug: "budget-template", title: "Free Wedding Budget Template", description: "Track quotes and deposits." },
  { slug: "hidden-cost-calculator-worksheet", title: "Hidden Wedding Cost Calculator", description: "Find hidden fees." },
  { slug: "vendor-interview-question-list", title: "Vendor Interview Questions", description: "Ask sharper questions." },
  { slug: "vendor-contract-review-checklist", title: "Vendor Contract Review Checklist", description: "Review contracts." },
  { slug: "wedding-timeline-template", title: "Wedding Day Timeline Template", description: "Plan the day." },
  { slug: "seating-chart-planning-template", title: "Seating Chart Planning Template", description: "Plan seating." },
  { slug: "wedding-app-comparison-scorecard", title: "Wedding App Comparison Scorecard", description: "Compare apps." },
];

describe("resolvePageLeadMagnet", () => {
  it("uses explicitSlug when it matches", () => {
    expect(resolvePageLeadMagnet({ pathname: "/free/x", knowledge, explicitSlug: "seating-chart-planning-template" }).slug)
      .toBe("seating-chart-planning-template");
  });

  it("ignores explicitSlug when it does not match a known magnet", () => {
    expect(resolvePageLeadMagnet({ pathname: "/about", knowledge, explicitSlug: "nope" }).slug)
      .toBe("budget-template");
  });

  it("matches budget pages", () => {
    expect(resolvePageLeadMagnet({ pathname: "/resources/guides/wedding-budget-breakdown", knowledge }).slug)
      .toBe("budget-template");
  });

  it("prefers hidden-cost over generic budget when 'hidden cost' present", () => {
    expect(resolvePageLeadMagnet({ pathname: "/resources/guides/hidden-cost-of-weddings", knowledge }).slug)
      .toBe("hidden-cost-calculator-worksheet");
  });

  it("matches vendor pages", () => {
    expect(resolvePageLeadMagnet({ pathname: "/resources/guides/how-to-choose-a-photographer", knowledge }).slug)
      .toBe("vendor-interview-question-list");
  });

  it("prefers contract magnet when 'contract' present", () => {
    expect(resolvePageLeadMagnet({ pathname: "/resources/guides/vendor-contract-tips", knowledge }).slug)
      .toBe("vendor-contract-review-checklist");
  });

  it("matches timeline pages", () => {
    expect(resolvePageLeadMagnet({ pathname: "/", knowledge, hint: "Wedding Day Timeline Guide" }).slug)
      .toBe("wedding-timeline-template");
  });

  it("matches compare pages to the comparison scorecard", () => {
    expect(resolvePageLeadMagnet({ pathname: "/compare/alternatives/zola", knowledge }).slug)
      .toBe("wedding-app-comparison-scorecard");
  });

  it("falls back to budget-template for unknown topics", () => {
    expect(resolvePageLeadMagnet({ pathname: "/privacy", knowledge }).slug).toBe("budget-template");
  });

  it("falls back to first entry when budget-template absent", () => {
    const noBudget = knowledge.filter((k) => k.slug !== "budget-template");
    expect(resolvePageLeadMagnet({ pathname: "/privacy", knowledge: noBudget }).slug)
      .toBe(noBudget[0]!.slug);
  });

  it("returns a stable fallback when knowledge is empty", () => {
    const result = resolvePageLeadMagnet({ pathname: "/x", knowledge: [] });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `pnpm --filter @kaiplan/marketing exec vitest run src/lib/resolve-page-lead-magnet.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the resolver**

```ts
import type { LeadMagnet } from "../types";

interface ResolveInput {
  pathname: string;
  knowledge: LeadMagnet[];
  hint?: string;
  explicitSlug?: string;
}

// Ordered: first match wins, so specific rules precede generic ones.
const RULES: ReadonlyArray<{ slug: string; keywords: readonly string[] }> = [
  { slug: "hidden-cost-calculator-worksheet", keywords: ["hidden cost", "hidden fee", "hidden-cost"] },
  { slug: "vendor-contract-review-checklist", keywords: ["contract"] },
  { slug: "vendor-red-flag-checklist", keywords: ["red flag", "red-flag", "scam"] },
  { slug: "wedding-app-comparison-scorecard", keywords: ["compare", "comparison", "alternative", "vs-", "/vs/", "best app", "best-app", "app-comparison"] },
  { slug: "seating-chart-planning-template", keywords: ["seating", "seat chart", "table chart"] },
  { slug: "wedding-timeline-template", keywords: ["timeline", "day-of", "day of", "schedule"] },
  { slug: "complete-wedding-checklist", keywords: ["checklist", "to-do", "todo", "plan a wedding", "planning steps"] },
  { slug: "wedding-rsvp-tracker", keywords: ["rsvp", "guest list", "guest-list"] },
  { slug: "wedding-venue-comparison-worksheet", keywords: ["venue"] },
  { slug: "wedding-photography-shot-list", keywords: ["shot list", "shot-list", "photo list", "photography checklist"] },
  { slug: "wedding-vows-writing-worksheet", keywords: ["vow", "vows"] },
  { slug: "honeymoon-budget-planner", keywords: ["honeymoon"] },
  { slug: "pre-wedding-beauty-timeline", keywords: ["beauty", "hair", "makeup", "skincare"] },
  { slug: "wedding-day-coordinator-notes", keywords: ["coordinator", "day-of coordinator"] },
  { slug: "vendor-interview-question-list", keywords: ["vendor", "photographer", "caterer", "catering", "florist", "florals", "dj", "band", "planner", "officiant", "videographer"] },
  { slug: "budget-template", keywords: ["budget", "cost", "afford", "price", "pricing", "spend", "money"] },
];

const FALLBACK_SLUG = "budget-template";

function bySlug(knowledge: LeadMagnet[], slug: string): LeadMagnet | undefined {
  return knowledge.find((entry) => entry.slug === slug);
}

export function resolvePageLeadMagnet(input: ResolveInput): LeadMagnet | null {
  const { pathname, knowledge, hint, explicitSlug } = input;
  if (knowledge.length === 0) return null;

  if (explicitSlug) {
    const explicit = bySlug(knowledge, explicitSlug);
    if (explicit) return explicit;
  }

  const haystack = `${pathname} ${hint ?? ""}`.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      const match = bySlug(knowledge, rule.slug);
      if (match) return match;
    }
  }

  return bySlug(knowledge, FALLBACK_SLUG) ?? knowledge[0] ?? null;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `pnpm --filter @kaiplan/marketing exec vitest run src/lib/resolve-page-lead-magnet.test.ts`
Expected: PASS (all). If a test fails, adjust rule ordering/keywords — do not weaken assertions.

- [ ] **Step 5: Commit**

```bash
git add packages/marketing/src/lib/resolve-page-lead-magnet.ts packages/marketing/src/lib/resolve-page-lead-magnet.test.ts
git commit -m "feat(marketing): page-tailored lead magnet resolver"
```

---

### Task 2: Wire landing-layout to single page magnet

**Files:**
- Modify: `packages/marketing/src/layouts/landing-layout.astro`

- [ ] **Step 1: Import the resolver and compute the page magnet**

In the frontmatter (after `exitPopupProps` is computed, near line 49-52), add:

```ts
import { resolvePageLeadMagnet } from "../lib/resolve-page-lead-magnet";
// ...
const pageLeadMagnet = resolvePageLeadMagnet({
  pathname: Astro.url.pathname,
  knowledge: config.leadMagnetOptions ?? [],
  hint: title ?? config.tagline,
  explicitSlug: Astro.props.leadMagnetSlug,
});
```

Add `leadMagnetSlug?: string;` to the `Props` interface and destructure it.

- [ ] **Step 2: Update the popup invocation (lines ~129-139)**

Replace the `<ExitIntentPopup ... leadMagnet={config.leadMagnet} leadMagnetOptions={config.leadMagnetOptions} ... />` with:

```astro
{
  exitPopupProps && pageLeadMagnet && (
    <ExitIntentPopup
      apiUrl={Astro.url.origin}
      siteName={config.name}
      leadMagnet={pageLeadMagnet}
      {...exitPopupProps}
    />
  )
}
```

Note: `leadMagnetOptions` is intentionally removed so the popup renders email-only.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @kaiplan/marketing run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/marketing/src/layouts/landing-layout.astro
git commit -m "feat(marketing): landing layout serves single page-tailored magnet (email-only)"
```

---

### Task 3: Wire article-layout to single page magnet

**Files:**
- Modify: `packages/marketing/src/layouts/article-layout.astro`

- [ ] **Step 1: Mirror Task 2 changes**

Add the import, compute `pageLeadMagnet` the same way (hint = `title ?? config.tagline`, `explicitSlug: Astro.props.leadMagnetSlug`), add `leadMagnetSlug?: string` to Props, and replace the popup invocation (lines ~194-201) to pass `leadMagnet={pageLeadMagnet}` and drop `leadMagnetOptions`, guarding on `pageLeadMagnet`.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @kaiplan/marketing run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/marketing/src/layouts/article-layout.astro
git commit -m "feat(marketing): article layout serves single page-tailored magnet (email-only)"
```

---

### Task 4: Wire lead-magnet-page to its own magnet

**Files:**
- Modify: `packages/marketing/src/components/lead-magnet-page.astro`

- [ ] **Step 1: Resolve to the page's own magnet**

This template renders `/free/[slug]`. It already knows the page's lead magnet slug (from its props/frontmatter — locate the variable holding the current magnet slug; it is the `leadMagnetSlug`/`slug` used elsewhere in the file). Compute:

```ts
import { resolvePageLeadMagnet } from "../lib/resolve-page-lead-magnet";
const pageLeadMagnet = resolvePageLeadMagnet({
  pathname: Astro.url.pathname,
  knowledge: config.leadMagnetOptions ?? [],
  explicitSlug: /* the current page's magnet slug variable */,
  hint: Astro.url.pathname,
});
```

- [ ] **Step 2: Update popup invocation (lines ~172-180)**

Pass `leadMagnet={pageLeadMagnet}`, drop `leadMagnetOptions`, guard on `pageLeadMagnet`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @kaiplan/marketing run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/marketing/src/components/lead-magnet-page.astro
git commit -m "feat(marketing): lead magnet page popup offers its own resource (email-only)"
```

---

### Task 5: Update popup + config tests for email-only

**Files:**
- Modify: `packages/marketing/src/components/exit-intent-popup.test.tsx`
- Modify: `apps/web/src/config/site.test.ts`

- [ ] **Step 1: Add/adjust popup test for single-magnet email-only**

Add a test asserting that when rendered with a single `leadMagnet` and no `leadMagnetOptions`, there is no resource picker (no radio group) and the email field is present, and that submitting posts the magnet's slug. Reuse existing test setup in the file. Example assertion core:

```tsx
// given <ExitIntentPopup leadMagnet={{slug:"budget-template", title:"Budget Template"}} ... /> (no leadMagnetOptions)
expect(screen.queryByRole("radio")).toBeNull();
expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument();
```

(Match the file's existing query patterns and submit-mock approach for the slug assertion.)

- [ ] **Step 2: Fix site.test.ts expectations**

The test at `apps/web/src/config/site.test.ts:240` asserts `leadMagnetOptions` has length 16 — that knowledge list is still valid and stays (the resolver reads it), so keep that assertion. Update/remove only any assertion that the popup is *handed* the full options list, if present. Keep `leadMagnetOptions` populated in config.

- [ ] **Step 3: Run affected tests**

Run: `pnpm --filter @kaiplan/marketing exec vitest run src/components/exit-intent-popup.test.tsx`
Run: `pnpm --filter @kaiplan/web exec vitest run src/config/site.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/marketing/src/components/exit-intent-popup.test.tsx apps/web/src/config/site.test.ts
git commit -m "test(marketing): cover email-only single-magnet popup path"
```

---

### Task 6: Copy refresh (mandatory writing skills)

**Files:**
- Modify: `apps/web/src/config/site.ts` (`config.copy.exitPopup`)

- [ ] **Step 1: Draft refreshed popup copy**

Rewrite headline/description/ctaText/success messaging so it reads naturally and leans on the page magnet (the popup already prefers the magnet's own title/description). Keep it email-only framing ("Get the free [resource]. Just your email."). **Never** mention any email sequence.

- [ ] **Step 2: Run the humanizer skill on the drafted copy**

Use the `humanizer` skill; apply its edits.

- [ ] **Step 3: Run the third-grade-copy skill on the result**

Use the `third-grade-copy` skill; apply its edits.

- [ ] **Step 4: Apply to config and typecheck**

Run: `pnpm --filter @kaiplan/web run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/config/site.ts
git commit -m "copy(marketing): refresh exit-popup copy (humanizer + third-grade pass)"
```

---

### Task 7: Quality gates

- [ ] **Step 1: Lint + typecheck workspace**

Run: `pnpm run lint`
Run: `pnpm run typecheck`
Expected: PASS.

- [ ] **Step 2: Coverage on touched packages**

Run: `pnpm --filter @kaiplan/marketing test:coverage`
Run: `pnpm --filter @kaiplan/web test:coverage`
Expected: PASS, ≥95% on touched files (new resolver included).

- [ ] **Step 3: Commit any test top-ups**

```bash
git add -A
git commit -m "test(marketing): coverage top-ups for popup tailoring"
```

---

### Task 8: Browser + e2e verification

- [ ] **Step 1: Start the marketing dev server**

Run the canonical web dev server on Kaiplan's reserved port (3030). Use the preview tooling to drive a browser.

- [ ] **Step 2: Verify per-page behavior**

On each of: `/` (home), a budget guide, a vendor/photographer guide, a `/compare/...` page, and a `/free/[slug]` page — trigger exit intent (mouse to top edge), and confirm:
  - popup appears, shows **only** an email field (no resource radio list),
  - the displayed resource matches the page topic,
  - Turnstile renders (or dev-bypass when `PUBLIC_TURNSTILE_SITE_KEY` empty),
  - submitting a test email posts the **page-appropriate** `leadMagnetSlug` (check the network request),
  - success state shows.
  Clear `localStorage` between pages to bypass the suppress window.

- [ ] **Step 3: Confirm silent enrollment + no sequence wording**

Confirm (via marketing-api tests or local logs) that signup triggers background sequencer enrollment, and grep the popup + email copy to confirm **no** mention of a sequence/drip/automation is visible to the visitor.

- [ ] **Step 4: Run local marketing e2e**

Run the repo's local marketing e2e suite (default Kaiplan 3030/5030). Expected: PASS.

---

### Task 9: Review, merge, deploy

- [ ] **Step 1: Reviewer agent**

Dispatch a code-review agent over the diff. Fix every finding; re-review until clean.

- [ ] **Step 2: Merge to master**

Merge the worktree to `master` per repo workflow.

- [ ] **Step 3: Cleanup**

Kill dev/preview servers, remove the worktree and its branch, confirm with `git worktree list` and `git branch`.

- [ ] **Step 4: Deploy**

Deploy the touched Cloudflare project `kaiplan-web` (`pnpm run deploy:touched` or `deploy:web`). Confirm the popup behavior on the live site post-deploy.

---

## Self-review notes

- **Spec coverage:** Req #1 email-only → Tasks 2-5; Req #2 silent sequence → unchanged server path, guarded in Task 8 Step 3; Req #3 Turnstile → unchanged, verified Task 8; Req #4 page tailoring → Tasks 1-4. Copy refresh → Task 6. Verify/deploy → Tasks 7-9.
- **Placeholders:** Task 4 Step 1 leaves the exact slug-source variable to be located in `lead-magnet-page.astro` — the implementer must read the file and use the existing current-magnet slug; this is a lookup, not an undefined contract.
- **Type consistency:** resolver returns `LeadMagnet | null`; all call sites guard on truthiness before rendering the popup.
