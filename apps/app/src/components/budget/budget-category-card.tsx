import type { BudgetCategoryWithTotals } from "@kaiplan/shared";
import { Card } from "../ui/card";
import { Progress } from "../ui/progress";
import { formatMoney } from "../../lib/format-money";

interface BudgetCategoryCardProps {
  category: BudgetCategoryWithTotals;
  onClick: () => void;
}

export function BudgetCategoryCard({
  category,
  onClick,
}: BudgetCategoryCardProps) {
  const progress =
    category.estimatedCents > 0
      ? Math.min(
          Math.round(
            (category.totalQuotedCents / category.estimatedCents) * 100,
          ),
          100,
        )
      : 0;

  return (
    <Card
      asChild
      className="gap-3 p-5 text-left"
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full"
        data-testid="budget-category-card"
      >
        <h2 className="font-heading text-sm font-semibold text-foreground">
          {category.name}
        </h2>
        <Progress value={progress} aria-label={`${progress}% quoted`} />
        <p className="text-xs text-muted">
          {formatMoney(category.totalQuotedCents)} /{" "}
          {formatMoney(category.estimatedCents)}
        </p>
      </button>
    </Card>
  );
}
