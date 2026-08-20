# Design

The design system Kaiplan was built against: audience, brand personality, principles, and tokens.

## Users
Couples planning their wedding, often stressed, juggling dozens of decisions across venues,
vendors, guests, and budgets. They're not power users; they need a tool that feels intuitive from
the first click. Their context is emotional (it's their wedding) but the task is logistical
(tracking budgets, RSVPs, seating). Kaiplan bridges that gap: making the logistics feel manageable
and even enjoyable.

## Brand personality
**Warm, elegant, grounded.**

- **Warm:** Approachable, never clinical. The interface should feel like a trusted friend with good
  taste, not a spreadsheet.
- **Elegant:** Refined typography (Fraunces headings, DM Sans body), generous whitespace, considered
  details. Quality over quantity.
- **Grounded:** Earthy sage green (`#7C9A82`) and muted gold (`#C5A55A`) keep it natural and
  sophisticated, never flashy.

**Emotional goal:** Confident & supported. Couples should feel guided and reassured, like having a
wedding planner on call. Reduce anxiety, increase clarity.

## Aesthetic direction
**Visual tone:** Editorial elegance, inspired by Squarespace and Flodesk. Beautiful typography,
lots of breathing room, content-forward layouts. Every screen should feel considered, not generated.

**Theme:** Light mode. Warm off-white surface (`#f8f8f6`), soft borders, rounded-xl cards with
subtle shadows on hover. The palette is intentionally restrained (sage, gold, warm grays) so that
user content (names, dates, photos) takes center stage.

**Micro-interactions are a priority.** Hover states, transitions, loading feedback, and small
animated touches should be woven throughout. These moments of polish signal care and build delight:
they're not decorative, they're functional personality.

**Anti-references:**
- **NOT cutesy/Pinterest:** No pastel florals, no scrapbook energy. Wedding planning, not wedding
  mood-boarding.
- **NOT dense/enterprise-y:** No data overload, no cramped tables, no 12-column dashboards. Couples
  aren't analysts: keep it simple and scannable.

## Button geometry

Buttons are pills. Every button and button-styled CTA uses fully rounded geometry (`border-radius:
9999px`, `rounded-full`, or equivalent), including icon buttons, segmented and toggle controls, and
link-buttons. Cards, inputs, dialogs, tags, and content containers keep their own radii. Button-like
controls never use square, `rounded-md`, or `rounded-lg` corners.
## Design principles
1. **Calm over clever.** Every screen should reduce cognitive load. When in doubt, remove. White
   space is a feature, not waste.
2. **Guide, don't overwhelm.** Progressive disclosure: show what matters now, tuck the rest away.
   Couples should never feel lost or buried.
3. **Warmth in the details.** Micro-interactions, considered transitions, and typographic care make
   the difference between "functional" and "feels like someone cared." Invest in these moments.
4. **Content is the hero.** The UI is a frame, not the painting. Names, dates, budgets, guest lists:
   that's what couples came for. Design recedes so their wedding shines.
5. **Earn trust through consistency.** Same spacing, same radii, same motion curves everywhere.
   Predictability builds confidence. Break patterns only with intention.

## Palette evolution

Kaiplan shipped two palettes. The original was sage-and-gold; the product rebranded to
terracotta-and-moss partway through. Both are recorded here because the second one exists for a
reason.

The sage palette was pretty and completely undifferentiated. Every wedding product on the market is
sage green: it is the default signal for "tasteful wedding thing," which means it signals nothing.
Terracotta keeps the earthy, grounded quality the brand was after while actually being recognizable,
and it holds up better against user-uploaded photography, which is the dominant content on a wedding
website.

**Current palette**: the source of truth is `apps/app/src/styles/globals.css`.

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#B0432A` | Terracotta, buttons, active states, links |
| `--color-accent` | `#EEF0EB` | Light moss tint, highlights, badges |
| `--color-background` | `#F5F1EA` | Paper, page backgrounds |
| `--color-foreground` | `#171311` | Ink, body text, headings |
| `--color-muted` | `#EBE4D6` | Warm sand, secondary surfaces |
| `--font-heading` | Instrument Serif | Headings, elegant, high contrast |
| `--font-body` | Geist | Body, clean, geometric, readable |
| `--font-mono` | Geist Mono | Numerals, currency, tabular data |

**Original palette**: still visible in parts of the marketing site.

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#7C9A82` | Sage green |
| `--color-accent` | `#C5A55A` | Muted gold |
| `--color-surface` | `#f8f8f6` | Warm off-white |
| `--color-foreground` | `#1f2937` | Near-black |
| `--color-muted` | `#8A8478` | Warm gray |
| `--font-heading` | Fraunces, serif | Headings |
| `--font-body` | DM Sans, sans-serif | Body |

## Semantic state tokens

Added in the design-system normalization sweep. Both `apps/app` and `apps/web` expose the same
semantic names; later passes migrate hardcoded values to these.

| Token | Value (apps/app) | Usage |
|-------|------------------|-------|
| `--color-success` | `#4f6d57` | Muted moss, success affordances, confirm states |
| `--color-success-foreground` | `#ffffff` | Text on success base |
| `--color-success-soft` | `#e7efe8` | Pale sage badge background |
| `--color-success-soft-foreground` | `#2f4536` | Deep moss text on soft-success badges |
| `--color-warning` | `#8a6320` | Warm amber, warning affordances, caution |
| `--color-warning-foreground` | `#ffffff` | Text on warning base |
| `--color-warning-soft` | `#f5ecd4` | Pale cream badge background |
| `--color-warning-soft-foreground` | `#6b4f15` | Deep amber text on soft-warning badges |
| `--color-info` | `#5a6878` | Muted slate-blue, informational affordances |
| `--color-info-foreground` | `#ffffff` | Text on info base |
| `--color-info-soft` | `#e6eaef` | Pale slate badge background |
| `--color-info-soft-foreground` | `#2d3a4a` | Deep slate text on soft-info badges |
| `--radius-card` | `1rem` | Card / panel corners (rounded-2xl scale) |
| `--radius-control` | `9999px` | Button / input corners (rounded-md scale) |
| `--shadow-card` | `0 1px 2px rgba(31,41,55,0.04), 0 4px 12px rgba(31,41,55,0.06)` | Default card elevation, earthy double-layer |

In `apps/web`, the color tokens alias the existing scale (e.g. `--color-success:
var(--color-success-700)`) so the semantic names stay in sync across apps.

## apps/web token consumer surface (Path A)

New consumer code in `apps/web/src/pages/**` and `apps/web/src/components/**` should reach for the
**flat semantic tokens** defined in `apps/web/src/styles/global.css`, the same vocabulary that
`apps/app` uses:

- `--color-primary`, `--color-primary-foreground`
- `--color-accent`, `--color-accent-foreground`, `--color-accent-hover` (web-only extension for the
  deep-amber link/hover/deep-300 shade)
- `--color-background`, `--color-foreground`
- `--color-muted`, `--color-muted-foreground`
- `--color-border`, `--color-ring`
- `--color-destructive`, `--color-destructive-foreground`
- `--color-success{,-foreground,-soft,-soft-foreground}`
- `--color-warning{,-foreground,-soft,-soft-foreground}`
- `--color-info{,-foreground,-soft,-soft-foreground}`

The numeric scale tokens (`--color-primary-500`, `--color-accent-700`, `--color-neutral-200`, …)
remain declared in `global.css` but are considered **internal plumbing**: they feed the inherited
`@kaiplan/marketing/styles/globals.css` selectors (`.btn-secondary`, `.marketing-panel`,
`.marketing-chip`, `.editorial-*`, `.prose *`, dark-mode block) which bind directly to scale values.
New consumer code should not reference them; the audit-walked exceptions are documented inline.

The canonical flat-token source of truth is `apps/app/src/styles/globals.css`; changes to shared
semantics belong there first.

## Component conventions
- **Shadcn/UI** New York style, neutral base color
- **Icons:** Lucide React, 20px (`h-5 w-5`) default
- **Cards:** `rounded-xl`, subtle border, `hover:shadow-sm` transition
- **Buttons:** `rounded-full`, primary uses `bg-primary text-white`
- **Spacing:** Tailwind defaults: `p-5` cards, `gap-4` grids, `space-y-6` sections
- **Layout:** Sidebar (collapsible, 56→16 width) + top bar + centered content (`max-w-3xl`)
