import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BudgetWidget } from "../../../src/components/budget/budget-widget";
import type { BudgetSummary, BudgetCategoryWithTotals } from "@kaiplan/shared";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => createElement("a", { href: to, ...props }, children),
}));

vi.mock("../../../src/hooks/use-budget", () => ({
  useBudgetSummary: vi.fn(),
}));

import { useBudgetSummary } from "../../../src/hooks/use-budget";

const mockUseBudgetSummary = vi.mocked(useBudgetSummary);

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

function makeSummary(overrides: Partial<BudgetSummary> = {}): BudgetSummary {
  return {
    totalBudgetCents: 3000000,
    totalEstimatedCents: 2500000,
    totalQuotedCents: 1800000,
    totalPaidCents: 900000,
    unallocatedCents: 500000,
    categories: [
      makeCategory(),
      makeCategory({
        id: "cat-2",
        name: "Catering",
        estimatedCents: 1000000,
        totalQuotedCents: 800000,
      }),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BudgetWidget", () => {
  it("renders stats when data is available", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByText("$18,000.00")).toBeInTheDocument(); // quoted
    expect(screen.getByText("$9,000.00")).toBeInTheDocument(); // paid
  });

  it("renders category list", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(screen.getByText("Photography")).toBeInTheDocument();
    // Catering category's quoted amount displayed
    expect(screen.getByText("Catering")).toBeInTheDocument();
  });

  it("shows empty state with CTA when no categories", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: {
        totalBudgetCents: 0,
        totalEstimatedCents: 0,
        totalQuotedCents: 0,
        totalPaidCents: 0,
        unallocatedCents: 0,
        categories: [],
      },
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(
      screen.getByText(
        "Set your total budget and add categories to start tracking spend.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /add first category/i }),
    ).toHaveAttribute("href", "/budget");
  });

  it("shows empty state with CTA when data is undefined", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(
      screen.getByText(
        "Set your total budget and add categories to start tracking spend.",
      ),
    ).toBeInTheDocument();
  });

  it("shows Start here badge when showStartHere is true", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" showStartHere />);

    expect(screen.getByText("Start here")).toBeInTheDocument();
  });

  it("does not show Start here badge by default", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(screen.queryByText("Start here")).not.toBeInTheDocument();
  });

  it("shows an error state when the budget summary fails to load", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(
      screen.getByText("We couldn't load your budget right now."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/add categories to start tracking/i),
    ).not.toBeInTheDocument();
  });

  it("keeps the existing budget data visible during a background refetch failure", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(screen.getByText("$18,000.00")).toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't load your budget right now."),
    ).not.toBeInTheDocument();
  });

  it("link points to /budget", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/budget");
  });

  it("shows loading state", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useBudgetSummary>);

    const { container } = render(<BudgetWidget weddingId="w-1" />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows overall progress bar", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    // 1800000 / 3000000 = 60%
    const progressBars = screen.getAllByRole("progressbar");
    const overallBar = progressBars.find(
      (el) => el.getAttribute("aria-label") === "60% of budget quoted",
    );
    expect(overallBar).toBeTruthy();
  });

  it("handles zero budget with categories (0% progress)", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: makeSummary({
        totalBudgetCents: 0,
        categories: [makeCategory({ estimatedCents: 0 })],
      }),
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    const progressBars = screen.getAllByRole("progressbar");
    const overallBar = progressBars.find(
      (el) => el.getAttribute("aria-label") === "0% of budget quoted",
    );
    expect(overallBar).toBeTruthy();
  });

  it("handles category with zero estimated cents", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: makeSummary({
        categories: [
          makeCategory({ id: "c1", name: "Zero Cat", estimatedCents: 0 }),
        ],
      }),
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(screen.getByText("Zero Cat")).toBeInTheDocument();
    const progressBars = screen.getAllByRole("progressbar");
    const catBar = progressBars.find(
      (el) => el.getAttribute("aria-label") === "Zero Cat 0%",
    );
    expect(catBar).toBeTruthy();
  });

  it("calls refetch when Retry budget button is clicked", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as ReturnType<typeof useBudgetSummary>);
    render(<BudgetWidget weddingId="w-1" />);
    await user.click(screen.getByRole("button", { name: /retry budget/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("limits categories to top 3", () => {
    mockUseBudgetSummary.mockReturnValue({
      data: makeSummary({
        categories: [
          makeCategory({ id: "c1", name: "Cat 1" }),
          makeCategory({ id: "c2", name: "Cat 2" }),
          makeCategory({ id: "c3", name: "Cat 3" }),
          makeCategory({ id: "c4", name: "Cat 4" }),
        ],
      }),
      isLoading: false,
    } as ReturnType<typeof useBudgetSummary>);

    render(<BudgetWidget weddingId="w-1" />);

    expect(screen.getByText("Cat 1")).toBeInTheDocument();
    expect(screen.getByText("Cat 2")).toBeInTheDocument();
    expect(screen.getByText("Cat 3")).toBeInTheDocument();
    expect(screen.queryByText("Cat 4")).not.toBeInTheDocument();
  });
});
