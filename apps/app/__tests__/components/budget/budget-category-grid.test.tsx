import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BudgetCategoryGrid } from "../../../src/components/budget/budget-category-grid";
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

describe("BudgetCategoryGrid", () => {
  it("renders category cards", () => {
    render(
      <BudgetCategoryGrid
        categories={[
          makeCategory(),
          makeCategory({ id: "cat-2", name: "Catering" }),
        ]}
        onSelectCategory={() => {}}
        onAddCategory={() => {}}
      />,
    );

    expect(screen.getByText("Photography")).toBeInTheDocument();
    expect(screen.getByText("Catering")).toBeInTheDocument();
  });

  it("renders add category card", () => {
    render(
      <BudgetCategoryGrid
        categories={[]}
        onSelectCategory={() => {}}
        onAddCategory={() => {}}
      />,
    );

    expect(screen.getByTestId("add-category-card")).toBeInTheDocument();
    expect(screen.getByText("Add category")).toBeInTheDocument();
  });

  it("calls onSelectCategory when a category is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <BudgetCategoryGrid
        categories={[makeCategory()]}
        onSelectCategory={onSelect}
        onAddCategory={() => {}}
      />,
    );

    await user.click(screen.getByText("Photography"));
    expect(onSelect).toHaveBeenCalledWith("cat-1");
  });

  it("calls onAddCategory when add card is clicked", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(
      <BudgetCategoryGrid
        categories={[]}
        onSelectCategory={() => {}}
        onAddCategory={onAdd}
      />,
    );

    await user.click(screen.getByTestId("add-category-card"));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("hides the add category card when mutation is disabled", () => {
    render(
      <BudgetCategoryGrid
        categories={[makeCategory()]}
        onSelectCategory={() => {}}
        onAddCategory={() => {}}
        canMutate={false}
      />,
    );

    expect(screen.queryByTestId("add-category-card")).not.toBeInTheDocument();
  });
});
