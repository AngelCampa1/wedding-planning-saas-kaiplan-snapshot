import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageSpinner } from "../../components/ui/page-spinner";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { BudgetWidget } from "../../components/budget/budget-widget";
import { GuestWidget } from "../../components/guest/guest-widget";
import { SeatingWidget } from "../../components/seating/seating-widget";
import { VendorWidget } from "../../components/vendor/vendor-widget";
import { CountdownHero } from "../../components/dashboard/countdown-hero";
import { QuickActions } from "../../components/dashboard/quick-actions";
import { WebsiteStatusWidget } from "../../components/website/website-status-widget";
import { useBudgetCategories } from "../../hooks/use-budget";
import { useChecklist } from "../../hooks/use-checklist";
import { useGuests } from "../../hooks/use-guests";
import { useVendors } from "../../hooks/use-vendors";
import { useWeddingWebsite } from "../../hooks/use-website";
import { useWeddings } from "../../hooks/use-weddings";
import { hasOpenedSeating } from "../../lib/tour-storage";
import { useActiveWedding } from "../../lib/wedding-context";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

export function DashboardPage() {
  const { auth } = Route.useRouteContext();
  const user = auth.user ?? { name: "", email: "", id: "" };
  const navigate = useNavigate();
  const { data: weddings = [], isLoading, isSuccess, isError } = useWeddings();
  const { activeWeddingId } = useActiveWedding();

  const resolvedWeddingId =
    activeWeddingId ?? (weddings.length > 0 ? weddings[0]!.id : null);

  const activeWedding =
    weddings.find((w) => w.id === resolvedWeddingId) ?? null;
  const checklistQuery = useChecklist(resolvedWeddingId);
  const budgetCategoriesQuery = useBudgetCategories(resolvedWeddingId);
  const guestsQuery = useGuests(resolvedWeddingId);
  const vendorsQuery = useVendors(resolvedWeddingId);
  const websiteQuery = useWeddingWebsite(resolvedWeddingId);

  const firstName = user.name.split(" ")[0];

  useEffect(() => {
    if (isSuccess && weddings.length === 0) {
      void navigate({ to: "/onboarding" });
    }
  }, [isSuccess, weddings.length, navigate]);

  if (isLoading) {
    return <PageSpinner />;
  }

  if (isError) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <p className="text-sm text-muted-foreground">
          Failed to load your weddings. Please refresh the page.
        </p>
      </div>
    );
  }

  const budgetReady = (budgetCategoriesQuery.data?.length ?? 0) > 0;
  const guestsReady = (guestsQuery.data?.length ?? 0) > 0;
  const vendorsReady = (vendorsQuery.data?.length ?? 0) > 0;
  const seatingReady = hasOpenedSeating();
  const websiteReady = Boolean(
    websiteQuery.data?.slug ||
    websiteQuery.data?.content.hero.title ||
    websiteQuery.data?.content.hero.body,
  );
  const startHere = !budgetReady
    ? "budget"
    : !guestsReady
      ? "guests"
      : !vendorsReady
        ? "vendors"
        : !seatingReady
          ? "seating"
          : null;

  return (
    <>
      <main className="flex-1 overflow-y-auto px-6 py-8 sm:py-12">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-body text-kicker text-muted-foreground">
            Welcome back, {firstName}
          </h1>

          <CountdownHero
            weddingName={activeWedding?.name ?? ""}
            weddingDate={activeWedding?.date ?? null}
          />

          <div className="mt-8 sm:mt-12">
            <QuickActions />
          </div>

          <FirstStepsChecklist
            weddingReady={Boolean(activeWedding)}
            checklistReady={(checklistQuery.data?.totalCount ?? 0) > 0}
            budgetReady={budgetReady}
            guestsReady={guestsReady}
            vendorsReady={vendorsReady}
            seatingReady={seatingReady}
            websiteReady={websiteReady}
          />

          <div
            className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4"
            data-help-key="dashboard-modules"
            data-tour="dashboard-modules"
          >
            <BudgetWidget
              weddingId={resolvedWeddingId}
              showStartHere={startHere === "budget"}
            />
            <GuestWidget
              weddingId={resolvedWeddingId}
              showStartHere={startHere === "guests"}
            />
            <SeatingWidget
              weddingId={resolvedWeddingId}
              showStartHere={startHere === "seating"}
            />
            <VendorWidget
              weddingId={resolvedWeddingId}
              showStartHere={startHere === "vendors"}
            />
          </div>

          <div className="mt-6">
            <WebsiteStatusWidget weddingId={resolvedWeddingId} />
          </div>
        </div>
      </main>
    </>
  );
}

function FirstStepsChecklist({
  weddingReady,
  checklistReady,
  budgetReady,
  guestsReady,
  vendorsReady,
  seatingReady,
  websiteReady,
}: {
  weddingReady: boolean;
  checklistReady: boolean;
  budgetReady: boolean;
  guestsReady: boolean;
  vendorsReady: boolean;
  seatingReady: boolean;
  websiteReady: boolean;
}) {
  const steps: Array<{
    label: string;
    done: boolean;
    href:
      | "/checklist"
      | "/budget"
      | "/guests"
      | "/vendors"
      | "/seating"
      | "/website"
      | null;
  }> = [
    { label: "Create the wedding workspace", done: weddingReady, href: null },
    {
      label: "Open your milestone checklist",
      done: checklistReady,
      href: "/checklist",
    },
    {
      label: "Add the first budget category",
      done: budgetReady,
      href: "/budget",
    },
    { label: "Add or import guests", done: guestsReady, href: "/guests" },
    { label: "Add the first vendor", done: vendorsReady, href: "/vendors" },
    { label: "Open the seating chart", done: seatingReady, href: "/seating" },
    {
      label: "Start the wedding website draft",
      done: websiteReady,
      href: "/website",
    },
  ];
  const completedCount = steps.filter((step) => step.done).length;
  const nextIncompleteIndex = steps.findIndex((step) => !step.done);

  return (
    <section className="mt-8 rounded-card border border-border bg-background p-5 shadow-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted">
            First steps
          </p>
          <h2 className="mt-2 font-heading text-xl text-foreground">
            A gentle path into the planner.
          </h2>
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {completedCount} / {steps.length} complete
        </p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => {
          const Icon = step.done ? CheckCircle2 : Circle;
          const isNext = index === nextIncompleteIndex;
          const rowClass = `flex items-center gap-2 rounded-control px-3 py-2 text-sm ${
            isNext
              ? "border border-primary/30 bg-primary/10 text-foreground"
              : "bg-secondary text-secondary-foreground"
          }`;
          const iconClass = `h-4 w-4 shrink-0 ${
            step.done ? "text-primary" : isNext ? "text-primary" : "text-muted"
          }`;

          if (!step.done && step.href) {
            return (
              <Link
                key={step.label}
                to={step.href}
                className={`${rowClass} hover:opacity-80`}
              >
                <Icon className={iconClass} />
                <span className="flex-1">{step.label}</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
              </Link>
            );
          }

          return (
            <div key={step.label} className={rowClass}>
              <Icon className={iconClass} />
              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
