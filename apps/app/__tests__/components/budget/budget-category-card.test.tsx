import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BudgetCategoryCard } from "../../../src/components/budget/budget-category-card";
import type { BudgetCategoryWithTotals } from "@kaiplan/shared";

function makeCategory(
  overrides: Partial<BudgetCategoryWithTotals> = {},
): BudgetCategoryWithTotals {
  return {
    id: "cat-1",
    weddingId: "w-1",
    name: "Photography",
    estimatedCents: 500000,
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    totalItemEstimatedCents: 400000,
    totalQuotedCents: 250000,
    totalPaidCents: 100000,
    itemCount: 2,
    ...overrides,
  };
}

describe("BudgetCategoryCard", () => {
  it("renders category name", () => {
    render(<BudgetCategoryCard category={makeCategory()} onClick={() => {}} />);
    expect(screen.getByText("Photography")).toBeInTheDocument();
  });

  it("shows progress percentage via role", () => {
    // 250000 / 500000 = 50%
    render(<BudgetCategoryCard category={makeCategory()} onClick={() => {}} />);
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-label", "50% quoted");
  });

  it("shows formatted quoted / budget", () => {
    render(<BudgetCategoryCard category={makeCategory()} onClick={() => {}} />);
    const label = screen.getByText(/\$2,500\.00 \/ \$5,000\.00/);
    expect(label).toBeInTheDocument();
  });

  it("fires click handler when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<BudgetCategoryCard category={makeCategory()} onClick={onClick} />);

    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("handles zero estimated cents (0% progress)", () => {
    render(
      <BudgetCategoryCard
        category={makeCategory({ estimatedCents: 0, totalQuotedCents: 100 })}
        onClick={() => {}}
      />,
    );
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-label", "0% quoted");
  });

  it("uses the Card substrate on the clickable button", () => {
    render(<BudgetCategoryCard category={makeCategory()} onClick={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("data-slot", "card");
  });

  it("caps progress at 100% when quoted exceeds estimated", () => {
    render(
      <BudgetCategoryCard
        category={makeCategory({
          estimatedCents: 100000,
          totalQuotedCents: 200000,
        })}
        onClick={() => {}}
      />,
    );
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-label", "100% quoted");
  });
});
