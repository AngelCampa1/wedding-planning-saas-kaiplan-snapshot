import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageSpinner } from "../../components/ui/page-spinner";
import { BudgetSummaryBar } from "../../components/budget/budget-summary-bar";
import { BudgetCategoryGrid } from "../../components/budget/budget-category-grid";
import { BudgetCategoryPanel } from "../../components/budget/budget-category-panel";
import { BudgetCategoryForm } from "../../components/budget/budget-category-form";
import { Button } from "../../components/ui/button";
import { useWeddings } from "../../hooks/use-weddings";
import { useActiveWedding } from "../../lib/wedding-context";
import {
  useBudgetSummary,
  useBudgetCategories,
  useCreateCategory,
} from "../../hooks/use-budget";

export const Route = createFileRoute("/_authenticated/budget")({
  component: BudgetPage,
});

const SEED_CATEGORIES = [
  "Venue",
  "Catering",
  "Photography",
  "Florist",
  "Music / DJ",
  "Attire",
  "Invitations",
  "Transport",
  "Honeymoon",
] as const;

export function BudgetPage() {
  const { data: weddings = [], isLoading: weddingsLoading } = useWeddings();
  const { activeWeddingId } = useActiveWedding();

  const resolvedWeddingId =
    activeWeddingId ?? (weddings.length > 0 ? weddings[0]!.id : null);
  const activeWedding =
    weddings.find((wedding) => wedding.id === resolvedWeddingId) ?? null;
  const canMutate = activeWedding !== null && activeWedding.role !== "viewer";

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useBudgetSummary(resolvedWeddingId);
  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useBudgetCategories(resolvedWeddingId);
  const resolvedCategories = categories ?? [];

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [selectedSeeds, setSelectedSeeds] = useState<Set<string>>(new Set());

  const createCategory = useCreateCategory(resolvedWeddingId ?? "");

  const selectedCategory =
    resolvedCategories.find((c) => c.id === selectedCategoryId) ?? null;
  const isPanelOpen = selectedCategoryId !== null;
  const showBudgetError =
    (summaryError && !summary) || (categoriesError && categories === undefined);

  const isLoading = weddingsLoading || summaryLoading || categoriesLoading;

  if (isLoading) {
    return <PageSpinner />;
  }

  if (!resolvedWeddingId || !activeWedding) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-background p-6 text-center">
          <h1 className="font-heading text-xl font-semibold text-foreground">
            Create a wedding first
          </h1>
          <p className="mt-2 text-sm text-muted">
            The budget attaches to a wedding workspace. Create or select a
            wedding before tracking categories, quotes, and payments.
          </p>
          <Button asChild className="mt-4">
            <Link to="/onboarding">Create wedding</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (showBudgetError) {
    return (
      <>
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-card border border-border/80 bg-card p-8 text-card-foreground shadow-card">
              <h1 className="font-heading text-2xl font-semibold text-foreground">
                Budget
              </h1>
              <p className="mt-4 text-base font-medium text-foreground">
                We couldn't load your budget right now.
              </p>
              <p className="mt-2 text-sm text-muted">
                Please refresh and try again in a moment.
              </p>
              <Button
                className="mt-5"
                onClick={() => {
                  void refetchSummary();
                  void refetchCategories();
                }}
              >
                Retry budget
              </Button>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-heading text-2xl font-semibold text-foreground">
              Budget
            </h1>
            {resolvedCategories.length > 0 && canMutate && (
              <Button
                onClick={() => setShowCategoryForm(true)}
                data-help-key="budget-add-category"
                data-tour="budget-add-category"
              >
                Add category
              </Button>
            )}
          </div>

          {summary && (
            <div data-help-key="budget-summary" data-tour="budget-summary">
              <BudgetSummaryBar summary={summary} />
            </div>
          )}

          {resolvedCategories.length === 0 ? (
            <div className="rounded-card border border-border bg-background p-6 shadow-card">
              <h2 className="font-heading text-xl text-foreground">
                Build your budget
              </h2>
              <p className="mt-2 text-sm text-muted">
                Start by adding categories — or let us seed the common ones for
                you.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {SEED_CATEGORIES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() =>
                      canMutate &&
                      setSelectedSeeds((prev) => {
                        const next = new Set(prev);
                        if (next.has(name)) {
                          next.delete(name);
                        } else {
                          next.add(name);
                        }
                        return next;
                      })
                    }
                    disabled={!canMutate}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      selectedSeeds.has(name)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-secondary-foreground hover:border-primary/50 hover:bg-primary/10"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  disabled={
                    selectedSeeds.size === 0 ||
                    createCategory.isPending ||
                    !canMutate
                  }
                  onClick={async () => {
                    try {
                      for (const name of selectedSeeds) {
                        await createCategory.mutateAsync({
                          name,
                          estimatedCents: 0,
                        });
                      }
                      setSelectedSeeds(new Set());
                    } catch {
                      // mutateAsync surfaces the error via createCategory.error
                    }
                  }}
                  data-help-key="budget-add-category"
                  data-tour="budget-add-category"
                >
                  Add {selectedSeeds.size} selected{" "}
                  {selectedSeeds.size === 1 ? "category" : "categories"}
                </Button>
                {canMutate ? (
                  <button
                    type="button"
                    onClick={() => setShowCategoryForm(true)}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Add a custom category manually
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div data-help-key="budget-category-panel">
              <BudgetCategoryGrid
                categories={resolvedCategories}
                onSelectCategory={(id) => setSelectedCategoryId(id)}
                onAddCategory={() => setShowCategoryForm(true)}
                canMutate={canMutate}
              />
            </div>
          )}
        </div>
      </main>

      {resolvedWeddingId && (
        <BudgetCategoryPanel
          weddingId={resolvedWeddingId}
          category={selectedCategory}
          open={isPanelOpen}
          onOpenChange={(open) => {
            if (!open) setSelectedCategoryId(null);
          }}
          canMutate={canMutate}
        />
      )}

      {canMutate ? (
        <BudgetCategoryForm
          open={showCategoryForm}
          onOpenChange={setShowCategoryForm}
          onSubmit={(data) => {
            createCategory.mutate(data, {
              onSuccess: () => setShowCategoryForm(false),
            });
          }}
          isSubmitting={createCategory.isPending}
        />
      ) : null}
    </>
  );
}
