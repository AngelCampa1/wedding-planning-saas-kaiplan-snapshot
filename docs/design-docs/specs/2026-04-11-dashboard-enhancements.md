# Dashboard Enhancements


**Goal:** Make the dashboard the first place a planner looks every session by adding a prominent wedding countdown hero, a quick-actions bar for the three most common next steps, and a fifth widget showing website publish status and pending RSVPs.

**Architecture:** All changes in `apps/app`. New `CountdownHero` and `QuickActions` components in `src/components/dashboard/`. New `WebsiteStatusWidget` in `src/components/website/`. No API changes — uses existing `useWeddingWebsite` and `useGuestSummary` hooks.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Tailwind CSS 4, Lucide React, Shadcn/UI

---

## Current Dashboard

```
Welcome back, {firstName}!
{weddingName}  [N days to go]

[BudgetWidget]    [GuestWidget]
[SeatingWidget]   [VendorWidget]
```

The countdown is tiny inline text. There are no quick actions. There is no website status visibility.

---

## New Dashboard Layout

```
[CountdownHero — full width]
[QuickActions row — full width]

[BudgetWidget]    [GuestWidget]
[SeatingWidget]   [VendorWidget]
[WebsiteStatusWidget — full width]
```

---

## Zero-Wedding Guard

The dashboard route currently shows broken-looking empty widgets when `weddings.length === 0`. Add a redirect: if `!isLoading && weddings.length === 0`, navigate to `/onboarding` using TanStack Router's `useNavigate`. This is consistent with how `onboarding.tsx` already redirects to `/dashboard` when a wedding exists.

```typescript
const navigate = useNavigate();
useEffect(() => {
  if (!isLoading && weddings.length === 0) {
    void navigate({ to: "/onboarding" });
  }
}, [isLoading, weddings.length, navigate]);
```

---

## Component: CountdownHero

**File:** `apps/app/src/components/dashboard/countdown-hero.tsx`

Replaces the current inline `{daysToGo}` text. Full-width card showing:

- Wedding name (large, `font-heading` Fraunces heading)
- Days countdown (very large number: "47 days to go")
- Wedding date formatted: "Saturday, June 7, 2026"
- If no date set: "Set your wedding date in Settings to start the countdown" with a `<Link to="/settings">` from TanStack Router
- If today is the wedding day (daysToGo === 0): "Today is your wedding day!"
- If wedding has passed (daysToGo < 0): "Congratulations! You did it."

**Visual:** Use `bg-primary/10` (Tailwind) for the card background tint. Keep the card layout consistent with other Shadcn/UI cards in the app (`rounded-xl border border-border`).

**Props:**
```typescript
interface CountdownHeroProps {
  weddingName: string;
  weddingDate: string | null; // ISO date string from API
}
```

`getDaysToGo` logic already exists in `dashboard.tsx` — extract it into this component.

---

## Component: QuickActions

**File:** `apps/app/src/components/dashboard/quick-actions.tsx`

A horizontal row of three action buttons:

1. **Add Guest** → `useNavigate` to `/guests`
2. **Edit Website** → `useNavigate` to `/website`
3. **Go to Seating** → `useNavigate` to `/seating`

Use Lucide icons: `UserPlus`, `Globe`, `Armchair`. Render as outlined `<Button variant="outline">` components in a `<div className="flex gap-3">`.

**Props:** None. Navigation is internal via `useNavigate` from `@tanstack/react-router`.

**Testing note:** Mock `useNavigate` from `@tanstack/react-router` in tests. Assert that the mock `navigate` function is called with `{ to: "/guests" }` etc. on button click. Do not test for `href` — `useNavigate` produces programmatic navigation, not anchor links.

---

## Component: WebsiteStatusWidget

**File:** `apps/app/src/components/website/website-status-widget.tsx`

Full-width card spanning the grid. Shows:

**If website is published** (`publishedSlug` is non-null):
- Green status indicator + "Published"
- RSVP pending count: `summary.byRsvp.pending + summary.byRsvp.invited`
- Confirmed count: `summary.byRsvp.accepted`
- Link to Website page: `<Link to="/website">`

**If website is not published:**
- Grey status indicator + "Not published"
- Body: "Publish your wedding website so guests can RSVP online."
- Button: "Set up website" → navigates to `/website`

**Loading state:** Use `animate-pulse` with a `<div className="h-20 rounded-xl bg-muted/40" />` placeholder — matching the existing loading patterns in `BudgetWidget`, `GuestWidget` etc. (`Skeleton` from Shadcn/UI is not installed; do not add it).

**Error state:** Return `null` — render nothing if queries fail. Do not show an error card; the other dashboard widgets will still be visible.

**Props:**
```typescript
interface WebsiteStatusWidgetProps {
  weddingId: string | null;
}
```

**Queries:**
- `useWeddingWebsite(weddingId)` — check `data?.publishedSlug` and `data?.publishedAt`
- `useGuestSummary(weddingId)` — already exists, returns `{ byRsvp: Record<RsvpStatus, number>, ... }`

---

## Dashboard Route Changes

`apps/app/src/routes/_authenticated/dashboard.tsx`:

1. Add zero-wedding guard (redirect to `/onboarding`)
2. Remove inline countdown logic (`getDaysToGo`, `daysToGo`, inline date text in JSX)
3. Add `<CountdownHero weddingName={activeWedding?.name ?? ""} weddingDate={activeWedding?.date ?? null} />`
4. Add `<QuickActions />` below CountdownHero
5. Add `<WebsiteStatusWidget weddingId={resolvedWeddingId} />` below the 4-widget grid
6. Widen `max-w-3xl` to `max-w-5xl` for better widget grid layout

---

## Testing

**`apps/app/__tests__/components/dashboard/countdown-hero.test.tsx`** (create)
- Renders wedding name and "N days to go" when date is set and daysToGo > 0
- Shows "Today is your wedding day!" when daysToGo === 0
- Shows "Congratulations! You did it." when daysToGo < 0
- Shows "Set your wedding date in Settings" prompt with link when date is null
- Does not render a raw negative number as the countdown

**`apps/app/__tests__/components/dashboard/quick-actions.test.tsx`** (create)
- Renders all three buttons (Add Guest, Edit Website, Go to Seating)
- Mock `useNavigate` from `@tanstack/react-router`; assert `navigate` is called with correct `to` path on each click

**`apps/app/__tests__/components/website/website-status-widget.test.tsx`** (create)
- Shows "Published" state with pending + confirmed counts when `publishedSlug` is set
- Pending count = `byRsvp.pending + byRsvp.invited` (test with non-zero values for each)
- Shows "Not published" state when `publishedSlug` is null
- Renders null (nothing) when the website query is in error state
- Shows loading placeholder when query is loading

95% coverage required on all new component files.

---

## Files to Create / Modify

| File | Change |
|------|--------|
| `apps/app/src/components/dashboard/countdown-hero.tsx` | Create |
| `apps/app/src/components/dashboard/quick-actions.tsx` | Create |
| `apps/app/src/components/website/website-status-widget.tsx` | Create |
| `apps/app/src/routes/_authenticated/dashboard.tsx` | Add zero-wedding guard; integrate new components; remove inline countdown; widen max-w |
| `apps/app/__tests__/components/dashboard/countdown-hero.test.tsx` | Create |
| `apps/app/__tests__/components/dashboard/quick-actions.test.tsx` | Create |
| `apps/app/__tests__/components/website/website-status-widget.test.tsx` | Create |
