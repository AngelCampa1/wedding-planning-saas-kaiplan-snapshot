import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "../ui/card";
import { Progress } from "../ui/progress";
import { formatMoney } from "../../lib/format-money";
import { useBudgetSummary } from "../../hooks/use-budget";

interface BudgetWidgetProps {
  weddingId: string | null;
  showStartHere?: boolean;
}

export function BudgetWidget({
  weddingId,
  showStartHere = false,
}: BudgetWidgetProps) {
  const {
    data: summary,
    isLoading,
    isError,
    refetch,
  } = useBudgetSummary(weddingId);

  if (isLoading) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="h-32 animate-pulse rounded-lg bg-muted/20" />
        </CardContent>
      </Card>
    );
  }

  if (isError && !summary) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Budget
            </h3>
          </div>
          <div className="flex flex-col items-start gap-3 py-2">
            <p className="text-sm text-foreground">
              We couldn't load your budget right now.
            </p>
            <p className="text-xs text-muted">Please refresh and try again.</p>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => void refetch()}
            >
              Retry budget
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isEmpty =
    !summary ||
    (summary.categories.length === 0 && summary.totalBudgetCents === 0);

  if (isEmpty) {
    return (
      <Card className="border-border/80">
        <CardContent>
          {showStartHere && (
            <span className="mb-2 inline-block rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
              Start here
            </span>
          )}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Budget
            </h3>
          </div>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted">
              Set your total budget and add categories to start tracking spend.
            </p>
            <Link
              to="/budget"
              className="text-sm font-medium text-primary hover:underline"
            >
              Add first category
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const overallProgress =
    summary.totalBudgetCents > 0
      ? Math.min(
          Math.round(
            (summary.totalQuotedCents / summary.totalBudgetCents) * 100,
          ),
          100,
        )
      : 0;

  const topCategories = summary.categories.slice(0, 3);

  return (
    <Card className="border-border/80">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Budget
          </h3>
          <Link
            to="/budget"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all &rarr;
          </Link>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted">Quoted</span>
            <span className="text-sm font-semibold text-foreground">
              {formatMoney(summary.totalQuotedCents)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Paid</span>
            <span className="text-sm font-semibold text-foreground">
              {formatMoney(summary.totalPaidCents)}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <Progress
            value={overallProgress}
            aria-label={`${overallProgress}% of budget quoted`}
          />
        </div>

        {topCategories.length > 0 && (
          <div className="flex flex-col gap-2">
            {topCategories.map((cat) => {
              const catProgress =
                cat.estimatedCents > 0
                  ? Math.min(
                      Math.round(
                        (cat.totalQuotedCents / cat.estimatedCents) * 100,
                      ),
                      100,
                    )
                  : 0;
              return (
                <div key={cat.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      {cat.name}
                    </span>
                    <span className="text-xs text-muted">
                      {formatMoney(cat.totalQuotedCents)}
                    </span>
                  </div>
                  <Progress
                    value={catProgress}
                    className="h-1.5"
                    aria-label={`${cat.name} ${catProgress}%`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
