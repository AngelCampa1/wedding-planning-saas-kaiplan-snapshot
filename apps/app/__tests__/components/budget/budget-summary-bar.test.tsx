import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BudgetSummaryBar } from "../../../src/components/budget/budget-summary-bar";
import type { BudgetSummary } from "@kaiplan/shared";

function makeSummary(overrides: Partial<BudgetSummary> = {}): BudgetSummary {
  return {
    totalBudgetCents: 3000000,
    totalEstimatedCents: 2500000,
    totalQuotedCents: 1800000,
    totalPaidCents: 900000,
    unallocatedCents: 500000,
    categories: [],
    ...overrides,
  };
}

describe("BudgetSummaryBar", () => {
  it("renders all stat values correctly", () => {
    render(<BudgetSummaryBar summary={makeSummary()} />);

    expect(screen.getByText("Total Budget")).toBeInTheDocument();
    expect(screen.getByText("$30,000.00")).toBeInTheDocument();

    expect(screen.getByText("Quoted")).toBeInTheDocument();
    expect(screen.getByText("$18,000.00")).toBeInTheDocument();

    expect(screen.getByText("Paid")).toBeInTheDocument();
    expect(screen.getByText("$9,000.00")).toBeInTheDocument();

    expect(screen.getByText("Remaining")).toBeInTheDocument();
    // Remaining = totalBudgetCents - totalPaidCents = 3000000 - 900000 = 2100000
    expect(screen.getByText("$21,000.00")).toBeInTheDocument();

    expect(screen.getByText("Unallocated")).toBeInTheDocument();
    expect(screen.getByText("$5,000.00")).toBeInTheDocument();
  });

  it("handles zero state", () => {
    render(
      <BudgetSummaryBar
        summary={makeSummary({
          totalBudgetCents: 0,
          totalEstimatedCents: 0,
          totalQuotedCents: 0,
          totalPaidCents: 0,
          unallocatedCents: 0,
        })}
      />,
    );

    const zeroDollars = screen.getAllByText("$0.00");
    expect(zeroDollars).toHaveLength(5);
  });

  it("renders the summary bar container", () => {
    render(<BudgetSummaryBar summary={makeSummary()} />);
    expect(screen.getByTestId("budget-summary-bar")).toBeInTheDocument();
  });

  it("renders progress bar with correct percentage", () => {
    // totalQuotedCents=1800000, totalBudgetCents=3000000 → 60%
    render(<BudgetSummaryBar summary={makeSummary()} />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByTestId("progress-percent")).toHaveTextContent("60%");
    expect(screen.getByText("Quoted vs Budget")).toBeInTheDocument();
  });

  it("renders 0% progress when budget is zero", () => {
    render(
      <BudgetSummaryBar
        summary={makeSummary({ totalBudgetCents: 0, totalQuotedCents: 0 })}
      />,
    );

    expect(screen.getByTestId("progress-percent")).toHaveTextContent("0%");
  });

  it("caps progress at 100% when quoted exceeds budget", () => {
    render(
      <BudgetSummaryBar
        summary={makeSummary({
          totalBudgetCents: 1000000,
          totalQuotedCents: 1500000,
        })}
      />,
    );

    expect(screen.getByTestId("progress-percent")).toHaveTextContent("100%");
  });
});
