import type { BudgetSummary } from "@kaiplan/shared";
import { formatMoney } from "../../lib/format-money";
import { MetricStrip, type MetricItem } from "../ui/metric-strip";
import { Progress } from "../ui/progress";

interface BudgetSummaryBarProps {
  summary: BudgetSummary;
}

export function BudgetSummaryBar({ summary }: BudgetSummaryBarProps) {
  const remaining = summary.totalBudgetCents - summary.totalPaidCents;
  const progressPercent =
    summary.totalBudgetCents > 0
      ? Math.min(
          Math.round(
            (summary.totalQuotedCents / summary.totalBudgetCents) * 100,
          ),
          100,
        )
      : 0;

  const items: MetricItem[] = [
    { label: "Total Budget", value: formatMoney(summary.totalBudgetCents) },
    { label: "Quoted", value: formatMoney(summary.totalQuotedCents) },
    { label: "Paid", value: formatMoney(summary.totalPaidCents) },
    { label: "Remaining", value: formatMoney(remaining) },
    {
      label: "Unallocated",
      value: formatMoney(summary.unallocatedCents),
      tone: "accent",
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="budget-summary-bar">
      <MetricStrip items={items} columns={5} />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Quoted vs Budget</span>
          <span data-testid="progress-percent">{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} aria-label="Budget progress" />
      </div>
    </div>
  );
}
