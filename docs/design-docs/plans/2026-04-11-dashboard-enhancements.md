# Dashboard Enhancements Implementation Plan


**Goal:** Add a full-width countdown hero, a quick-actions row, a fifth website-status widget, and a zero-wedding guard that redirects to `/onboarding` when no weddings exist.

**Architecture:** New `CountdownHero` and `QuickActions` components in `apps/app/src/components/dashboard/`. New `WebsiteStatusWidget` in `apps/app/src/components/website/`. Route file `dashboard.tsx` gets guard + integration + layout update. No API changes.

**Tech Stack:** React 19, TanStack Router (`useNavigate`), TanStack Query, Tailwind CSS 4, Lucide React, Shadcn/UI

---

## Task 1: `CountdownHero` component

**Files:**
- Create: `apps/app/src/components/dashboard/countdown-hero.tsx`
- Create: `apps/app/__tests__/components/dashboard/countdown-hero.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `apps/app/__tests__/components/dashboard/countdown-hero.test.tsx`:

  ```tsx
  import { describe, expect, it } from "vitest";
  import { render, screen } from "@testing-library/react";
  import { MemoryRouter } from "react-router-dom";
  import { CountdownHero } from "../../../src/components/dashboard/countdown-hero";

  // Helper: fixed date so tests don't drift
  // We'll mock getDaysToGo via a future date far enough away
  const FAR_FUTURE = "2099-12-31";
  const PAST_DATE = "2000-01-01";

  describe("CountdownHero", () => {
    it("renders wedding name and days-to-go when date is set and future", () => {
      render(<CountdownHero weddingName="Ava & Sam" weddingDate={FAR_FUTURE} />);
      expect(screen.getByText("Ava & Sam")).toBeInTheDocument();
      expect(screen.getByText(/days to go/i)).toBeInTheDocument();
    });

    it("shows 'Today is your wedding day!' when daysToGo is 0", () => {
      // Pass today's date as ISO string
      const today = new Date();
      const iso = today.toISOString().split("T")[0];
      render(<CountdownHero weddingName="Test Wedding" weddingDate={iso!} />);
      expect(screen.getByText("Today is your wedding day!")).toBeInTheDocument();
    });

    it("shows 'Congratulations! You did it.' when daysToGo < 0", () => {
      render(<CountdownHero weddingName="Past Wedding" weddingDate={PAST_DATE} />);
      expect(screen.getByText("Congratulations! You did it.")).toBeInTheDocument();
    });

    it("does not render a raw negative number as countdown", () => {
      render(<CountdownHero weddingName="Past Wedding" weddingDate={PAST_DATE} />);
      expect(screen.queryByText(/-\d+ days to go/i)).not.toBeInTheDocument();
    });

    it("shows settings link prompt when weddingDate is null", () => {
      render(<CountdownHero weddingName="No Date Wedding" weddingDate={null} />);
      expect(
        screen.getByText(/set your wedding date in settings/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
    });
  });
  ```

  **Note:** The component uses `<Link to="/settings">` from `@tanstack/react-router`. In tests, wrap with a TanStack Router test provider or mock the `Link` component. Check the existing test files (e.g., `apps/app/__tests__/components/guest/`) to see how TanStack Router is mocked in tests and replicate that pattern.

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/dashboard/countdown-hero.test.tsx
  ```

  Expected: import fails — file doesn't exist.

- [ ] **Step 3: Create the component**

  Create `apps/app/src/components/dashboard/countdown-hero.tsx`:

  ```tsx
  import { Link } from "@tanstack/react-router";

  interface CountdownHeroProps {
    weddingName: string;
    weddingDate: string | null;
  }

  function getDaysToGo(dateStr: string): number {
    const weddingDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    weddingDate.setHours(0, 0, 0, 0);
    const diff = weddingDate.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  export function CountdownHero({ weddingName, weddingDate }: CountdownHeroProps) {
    const daysToGo = weddingDate ? getDaysToGo(weddingDate) : null;

    const formattedDate = weddingDate
      ? (() => {
          const [year, month, day] = weddingDate.split("-").map(Number);
          const d = new Date(year, (month ?? 1) - 1, day ?? 1);
          return d.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        })()
      : null;

    return (
      <div className="rounded-xl border border-border bg-primary/10 p-6">
        <h2 className="font-heading text-2xl font-semibold text-foreground">
          {weddingName}
        </h2>

        {daysToGo === null ? (
          <p className="mt-2 text-muted-foreground">
            Set your wedding date in{" "}
            <Link to="/settings" className="underline">
              Settings
            </Link>{" "}
            to start the countdown.
          </p>
        ) : daysToGo === 0 ? (
          <p className="mt-2 text-3xl font-bold text-primary">
            Today is your wedding day!
          </p>
        ) : daysToGo < 0 ? (
          <p className="mt-2 text-3xl font-bold text-primary">
            Congratulations! You did it.
          </p>
        ) : (
          <>
            <p className="mt-2 text-5xl font-bold text-primary">
              {daysToGo} <span className="text-2xl font-medium">days to go</span>
            </p>
            {formattedDate && (
              <p className="mt-2 text-sm text-muted-foreground">{formattedDate}</p>
            )}
          </>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: Fix test imports to match TanStack Router mock pattern**

  Read an existing test that uses TanStack Router (e.g., `apps/app/__tests__/routes/guests-route.test.tsx`) to find how the router is set up in tests. Update `countdown-hero.test.tsx` to use the same wrapper/mock.

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/dashboard/countdown-hero.test.tsx
  ```

- [ ] **Step 6: Check coverage**

  ```bash
  pnpm --filter @kaiplan/app test:coverage -- --reporter=text 2>&1 | grep countdown-hero
  ```

  Expected: ≥ 95%.

- [ ] **Step 7: Commit**

  ```bash
  git add apps/app/src/components/dashboard/countdown-hero.tsx apps/app/__tests__/components/dashboard/countdown-hero.test.tsx
  git commit -m "feat(app): add CountdownHero component"
  ```

---

## Task 2: `QuickActions` component

**Files:**
- Create: `apps/app/src/components/dashboard/quick-actions.tsx`
- Create: `apps/app/__tests__/components/dashboard/quick-actions.test.tsx`

- [ ] **Step 1: Write failing tests**

  Create `apps/app/__tests__/components/dashboard/quick-actions.test.tsx`:

  ```tsx
  import { describe, expect, it, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { QuickActions } from "../../../src/components/dashboard/quick-actions";

  const mockNavigate = vi.fn();
  vi.mock("@tanstack/react-router", async (importOriginal) => {
    const original = await importOriginal<typeof import("@tanstack/react-router")>();
    return {
      ...original,
      useNavigate: () => mockNavigate,
    };
  });

  describe("QuickActions", () => {
    it("renders all three action buttons", () => {
      render(<QuickActions />);
      expect(screen.getByRole("button", { name: /add guest/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /edit website/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /go to seating/i })).toBeInTheDocument();
    });

    it("navigates to /guests when Add Guest is clicked", async () => {
      const user = userEvent.setup();
      render(<QuickActions />);
      await user.click(screen.getByRole("button", { name: /add guest/i }));
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/guests" });
    });

    it("navigates to /website when Edit Website is clicked", async () => {
      const user = userEvent.setup();
      render(<QuickActions />);
      await user.click(screen.getByRole("button", { name: /edit website/i }));
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/website" });
    });

    it("navigates to /seating when Go to Seating is clicked", async () => {
      const user = userEvent.setup();
      render(<QuickActions />);
      await user.click(screen.getByRole("button", { name: /go to seating/i }));
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/seating" });
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/dashboard/quick-actions.test.tsx
  ```

- [ ] **Step 3: Create the component**

  Create `apps/app/src/components/dashboard/quick-actions.tsx`:

  ```tsx
  import { useNavigate } from "@tanstack/react-router";
  import { Armchair, Globe, UserPlus } from "lucide-react";
  import { Button } from "../ui/button";

  export function QuickActions() {
    const navigate = useNavigate();

    return (
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => void navigate({ to: "/guests" })}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          Add Guest
        </Button>
        <Button
          variant="outline"
          onClick={() => void navigate({ to: "/website" })}
        >
          <Globe className="mr-2 h-4 w-4" />
          Edit Website
        </Button>
        <Button
          variant="outline"
          onClick={() => void navigate({ to: "/seating" })}
        >
          <Armchair className="mr-2 h-4 w-4" />
          Go to Seating
        </Button>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/dashboard/quick-actions.test.tsx
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/app/src/components/dashboard/quick-actions.tsx apps/app/__tests__/components/dashboard/quick-actions.test.tsx
  git commit -m "feat(app): add QuickActions component"
  ```

---

## Task 3: `WebsiteStatusWidget` component

**Files:**
- Create: `apps/app/src/components/website/website-status-widget.tsx`
- Create: `apps/app/__tests__/components/website/website-status-widget.test.tsx`

- [ ] **Step 1: Read useWeddingWebsite and useGuestSummary hook signatures**

  Read `apps/app/src/hooks/use-website.ts` lines 35–50 and `apps/app/src/hooks/use-guests.ts` lines 41–60 to confirm the exact return types of `useWeddingWebsite` and `useGuestSummary`.

- [ ] **Step 2: Write failing tests**

  Create `apps/app/__tests__/components/website/website-status-widget.test.tsx`:

  ```tsx
  import { describe, expect, it, vi } from "vitest";
  import { render, screen } from "@testing-library/react";
  import { WebsiteStatusWidget } from "../../../src/components/website/website-status-widget";
  import { useWeddingWebsite } from "../../../src/hooks/use-website";
  import { useGuestSummary } from "../../../src/hooks/use-guests";

  vi.mock("../../../src/hooks/use-website");
  vi.mock("../../../src/hooks/use-guests");

  const mockUseWeddingWebsite = vi.mocked(useWeddingWebsite);
  const mockUseGuestSummary = vi.mocked(useGuestSummary);

  function makeWebsiteData(overrides = {}) {
    return {
      publishedSlug: "ava-sam-2026",
      publishedAt: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  function makeSummary(overrides = {}) {
    return {
      byRsvp: { pending: 3, invited: 2, accepted: 10, declined: 1 },
      ...overrides,
    };
  }

  describe("WebsiteStatusWidget", () => {
    it("shows Published state with pending + confirmed counts when publishedSlug is set", () => {
      mockUseWeddingWebsite.mockReturnValue({
        data: makeWebsiteData(),
        isLoading: false,
        isError: false,
        error: null,
      } as ReturnType<typeof useWeddingWebsite>);
      mockUseGuestSummary.mockReturnValue({
        data: makeSummary(),
        isLoading: false,
        isError: false,
        error: null,
      } as ReturnType<typeof useGuestSummary>);

      render(<WebsiteStatusWidget weddingId="w-1" />);

      expect(screen.getByText("Published")).toBeInTheDocument();
      // pending (3) + invited (2) = 5
      expect(screen.getByText(/5/)).toBeInTheDocument();
      // accepted = 10
      expect(screen.getByText(/10/)).toBeInTheDocument();
    });

    it("pending count equals byRsvp.pending + byRsvp.invited", () => {
      mockUseWeddingWebsite.mockReturnValue({
        data: makeWebsiteData(),
        isLoading: false,
        isError: false,
        error: null,
      } as ReturnType<typeof useWeddingWebsite>);
      mockUseGuestSummary.mockReturnValue({
        data: makeSummary({ byRsvp: { pending: 7, invited: 4, accepted: 2, declined: 0 } }),
        isLoading: false,
        isError: false,
        error: null,
      } as ReturnType<typeof useGuestSummary>);

      render(<WebsiteStatusWidget weddingId="w-1" />);
      // 7 + 4 = 11
      expect(screen.getByText(/11/)).toBeInTheDocument();
    });

    it("shows Not published state when publishedSlug is null", () => {
      mockUseWeddingWebsite.mockReturnValue({
        data: makeWebsiteData({ publishedSlug: null }),
        isLoading: false,
        isError: false,
        error: null,
      } as ReturnType<typeof useWeddingWebsite>);
      mockUseGuestSummary.mockReturnValue({
        data: makeSummary(),
        isLoading: false,
        isError: false,
        error: null,
      } as ReturnType<typeof useGuestSummary>);

      render(<WebsiteStatusWidget weddingId="w-1" />);
      expect(screen.getByText("Not published")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /set up website/i })).toBeInTheDocument();
    });

    it("renders null when website query is in error state", () => {
      mockUseWeddingWebsite.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("failed"),
      } as ReturnType<typeof useWeddingWebsite>);
      mockUseGuestSummary.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: false,
        error: null,
      } as ReturnType<typeof useGuestSummary>);

      const { container } = render(<WebsiteStatusWidget weddingId="w-1" />);
      expect(container).toBeEmptyDOMElement();
    });

    it("shows loading placeholder when query is loading", () => {
      mockUseWeddingWebsite.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as ReturnType<typeof useWeddingWebsite>);
      mockUseGuestSummary.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
      } as ReturnType<typeof useGuestSummary>);

      const { container } = render(<WebsiteStatusWidget weddingId="w-1" />);
      expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 3: Run tests to confirm they fail**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/website/website-status-widget.test.tsx
  ```

- [ ] **Step 4: Create the component**

  Create `apps/app/src/components/website/website-status-widget.tsx`:

  ```tsx
  import { Link, useNavigate } from "@tanstack/react-router";
  import { Button } from "../ui/button";
  import { useWeddingWebsite } from "../../hooks/use-website";
  import { useGuestSummary } from "../../hooks/use-guests";

  interface WebsiteStatusWidgetProps {
    weddingId: string | null;
  }

  export function WebsiteStatusWidget({ weddingId }: WebsiteStatusWidgetProps) {
    const navigate = useNavigate();
    const { data: website, isLoading: websiteLoading, isError: websiteError } =
      useWeddingWebsite(weddingId);
    const { data: summary, isLoading: summaryLoading } =
      useGuestSummary(weddingId);

    if (websiteError) return null;

    if (websiteLoading || summaryLoading) {
      return <div className="h-20 rounded-xl bg-muted/40 animate-pulse" />;
    }

    const isPublished = !!website?.publishedSlug;
    const pendingCount = (summary?.byRsvp.pending ?? 0) + (summary?.byRsvp.invited ?? 0);
    const confirmedCount = summary?.byRsvp.accepted ?? 0;

    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <span
            className={`h-2.5 w-2.5 rounded-full ${isPublished ? "bg-green-500" : "bg-muted"}`}
          />
          <span className="font-semibold text-foreground">
            {isPublished ? "Published" : "Not published"}
          </span>
        </div>

        {isPublished ? (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{pendingCount}</span>{" "}
              awaiting RSVP
            </p>
            <p>
              <span className="font-medium text-foreground">{confirmedCount}</span>{" "}
              confirmed
            </p>
            <Link to="/website" className="mt-3 inline-block text-primary underline-offset-4 hover:underline">
              Manage website
            </Link>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Publish your wedding website so guests can RSVP online.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigate({ to: "/website" })}
            >
              Set up website
            </Button>
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  pnpm --filter @kaiplan/app test __tests__/components/website/website-status-widget.test.tsx
  ```

- [ ] **Step 6: Check coverage**

  ```bash
  pnpm --filter @kaiplan/app test:coverage -- --reporter=text 2>&1 | grep website-status-widget
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add apps/app/src/components/website/website-status-widget.tsx apps/app/__tests__/components/website/website-status-widget.test.tsx
  git commit -m "feat(app): add WebsiteStatusWidget component"
  ```

---

## Task 4: Integrate into dashboard route

**Files:**
- Modify: `apps/app/src/routes/_authenticated/dashboard.tsx`

- [ ] **Step 1: Read the current route file**

  Read `apps/app/src/routes/_authenticated/dashboard.tsx` in full.

- [ ] **Step 2: Add zero-wedding guard, remove inline countdown, integrate components**

  Replace the file content:

  ```tsx
  import { createFileRoute, useNavigate } from "@tanstack/react-router";
  import { useEffect } from "react";
  import { TopBar } from "../../components/top-bar";
  import { BudgetWidget } from "../../components/budget/budget-widget";
  import { GuestWidget } from "../../components/guest/guest-widget";
  import { SeatingWidget } from "../../components/seating/seating-widget";
  import { VendorWidget } from "../../components/vendor/vendor-widget";
  import { CountdownHero } from "../../components/dashboard/countdown-hero";
  import { QuickActions } from "../../components/dashboard/quick-actions";
  import { WebsiteStatusWidget } from "../../components/website/website-status-widget";
  import { useWeddings } from "../../hooks/use-weddings";
  import { useActiveWedding } from "../../lib/wedding-context";

  export const Route = createFileRoute("/_authenticated/dashboard")({
    component: DashboardPage,
  });

  function DashboardPage() {
    const { auth } = Route.useRouteContext();
    const user = auth.user!;
    const navigate = useNavigate();
    const { data: weddings = [], isLoading } = useWeddings();
    const { activeWeddingId, setActiveWeddingId } = useActiveWedding();

    const resolvedWeddingId =
      activeWeddingId ?? (weddings.length > 0 ? weddings[0].id : null);

    const activeWedding =
      weddings.find((w) => w.id === resolvedWeddingId) ?? null;

    const firstName = user.name.split(" ")[0];

    useEffect(() => {
      if (!isLoading && weddings.length === 0) {
        void navigate({ to: "/onboarding" });
      }
    }, [isLoading, weddings.length, navigate]);

    if (isLoading) {
      return (
        <div className="flex h-screen items-center justify-center bg-surface">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }

    return (
      <>
        <TopBar
          user={{ name: user.name, email: user.email }}
          weddings={weddings}
          activeWeddingId={resolvedWeddingId ?? ""}
          onSelectWedding={(id) => setActiveWeddingId(id)}
        />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                Welcome back, {firstName}!
              </h1>
            </div>

            <CountdownHero
              weddingName={activeWedding?.name ?? ""}
              weddingDate={activeWedding?.date ?? null}
            />

            <QuickActions />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <BudgetWidget weddingId={resolvedWeddingId} />
              <GuestWidget weddingId={resolvedWeddingId} />
              <SeatingWidget weddingId={resolvedWeddingId} />
              <VendorWidget weddingId={resolvedWeddingId} />
            </div>

            <WebsiteStatusWidget weddingId={resolvedWeddingId} />
          </div>
        </main>
      </>
    );
  }
  ```

  Note: `dashboard.tsx` is a route file (in `routes/`) — it is **excluded from coverage requirements** per CLAUDE.md.

- [ ] **Step 3: Run typecheck**

  ```bash
  pnpm --filter @kaiplan/app run typecheck
  ```

  Fix any type errors.

- [ ] **Step 4: Run all app tests**

  ```bash
  pnpm --filter @kaiplan/app test
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add apps/app/src/routes/_authenticated/dashboard.tsx
  git commit -m "feat(app): integrate CountdownHero, QuickActions, WebsiteStatusWidget into dashboard"
  ```

---

## Task 5: Full quality gate

- [ ] **Step 1: Run app coverage**

  ```bash
  pnpm --filter @kaiplan/app test:coverage -- --reporter=text 2>&1 | grep -E "countdown-hero|quick-actions|website-status-widget"
  ```

  Expected: ≥ 95% each.

- [ ] **Step 2: Run lint and typecheck**

  ```bash
  pnpm run lint && pnpm run typecheck
  ```

- [ ] **Step 3: Commit any coverage fixes**

  ```bash
  git add apps/app/
  git commit -m "test(app): close coverage gaps on dashboard components"
  ```

---

## Verification

1. `pnpm --filter @kaiplan/app test:coverage` — `countdown-hero.tsx`, `quick-actions.tsx`, `website-status-widget.tsx` ≥ 95%
2. `pnpm run typecheck` — clean
3. `pnpm run lint` — clean
4. Dashboard renders CountdownHero + QuickActions above the widget grid
5. Widget grid is now `max-w-5xl` (was `max-w-3xl`)
6. Empty-wedding case redirects to `/onboarding`
