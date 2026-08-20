import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageSpinner } from "../../components/ui/page-spinner";
import { useCreateWedding, useWeddings } from "../../hooks/use-weddings";
import { buildPlanSearch, readPlanSearch } from "../../lib/plan-handoff";
import { writeHelpMode } from "../../lib/tour-storage";

export const Route = createFileRoute("/_authenticated/onboarding")({
  validateSearch: (search: {
    plan?: unknown;
    interval?: unknown;
    checkout?: unknown;
  }) => readPlanSearch(search),
  component: OnboardingPage,
});

export function OnboardingPage() {
  const navigate = useNavigate();
  const { plan, interval } = Route.useSearch();
  const weddingsQuery = useWeddings();
  const createWedding = useCreateWedding();

  const hasNavigated = useRef(false);
  const [weddingName, setWeddingName] = useState("");
  const [date, setDate] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  useEffect(() => {
    if (
      weddingsQuery.isLoading ||
      (weddingsQuery.data?.length ?? 0) === 0 ||
      hasNavigated.current
    ) {
      return;
    }

    hasNavigated.current = true;
    void navigate({
      to: plan ? "/settings" : "/dashboard",
      search: buildPlanSearch(plan, interval),
    });
  }, [interval, navigate, plan, weddingsQuery.data, weddingsQuery.isLoading]);

  if (weddingsQuery.isLoading) {
    return <PageSpinner minHeight />;
  }

  if ((weddingsQuery.data?.length ?? 0) > 0) {
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBudgetError(null);

    if (budget) {
      const parsed = parseFloat(budget);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setBudgetError("Please enter a valid non-negative budget amount.");
        return;
      }
    }

    try {
      await createWedding.mutateAsync({
        name: weddingName,
        date: date || null,
        budgetCents: budget ? Math.round(parseFloat(budget) * 100) : 0,
        currency: "USD",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      });
      writeHelpMode(true);
      hasNavigated.current = true;
      await navigate({
        to: plan ? "/settings" : "/dashboard",
        search: buildPlanSearch(plan, interval),
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to create your wedding. Please try again.",
      );
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-foreground">
            Let&apos;s set up your wedding
          </h1>
          <p className="mt-2 text-muted">
            Takes 30 seconds. Everything can be edited later.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="feedback-banner feedback-banner--error">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="weddingName"
              className="block text-sm font-medium text-foreground"
            >
              What do you want to call this workspace?{" "}
              <span className="text-destructive">*</span>
            </label>
            <input
              id="weddingName"
              type="text"
              required
              value={weddingName}
              onChange={(e) => setWeddingName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. Alex & Jordan — June 2026"
            />
          </div>

          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-foreground"
            >
              Wedding date{" "}
              <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-muted">
              Helps us build your countdown
            </p>
          </div>

          <div>
            <label
              htmlFor="budget"
              className="block text-sm font-medium text-foreground"
            >
              Budget <span className="text-muted font-normal">(optional)</span>
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                $
              </span>
              <input
                id="budget"
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(e) => {
                  setBudget(e.target.value);
                  setBudgetError(null);
                }}
                className="block w-full rounded-lg border border-input bg-background py-2 pl-7 pr-3 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="25000"
              />
              {budgetError ? (
                <p className="mt-1 text-xs text-destructive">{budgetError}</p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  We&apos;ll track how much is allocated vs. left
                </p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={createWedding.isPending}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {createWedding.isPending ? "Setting up..." : "Start planning"}
          </button>
        </form>
      </div>
    </div>
  );
}
