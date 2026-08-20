import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const routeContext = {
  auth: {
    user: {
      name: "Angel Campa",
      email: "angel@example.com",
    },
  },
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useRouteContext: () => routeContext,
  }),
  Link: ({
    to,
    children,
  }: {
    to: string;
    children: import("react").ReactNode;
  }) => <a href={to}>{children}</a>,
}));

vi.mock("../../src/components/top-bar", () => ({
  TopBar: () => <div>Top bar</div>,
}));

vi.mock("../../src/components/budget/budget-summary-bar", () => ({
  BudgetSummaryBar: () => <div>Summary bar</div>,
}));

vi.mock("../../src/components/budget/budget-category-grid", () => ({
  BudgetCategoryGrid: () => <div>Category grid</div>,
}));

vi.mock("../../src/components/budget/budget-category-panel", () => ({
  BudgetCategoryPanel: () => null,
}));

vi.mock("../../src/components/budget/budget-category-form", () => ({
  BudgetCategoryForm: () => null,
}));

vi.mock("../../src/lib/wedding-context", () => ({
  useActiveWedding: vi.fn(),
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useWeddings: vi.fn(),
}));

vi.mock("../../src/hooks/use-budget", () => ({
  useBudgetSummary: vi.fn(),
  useBudgetCategories: vi.fn(),
  useCreateCategory: vi.fn(),
}));

import { useActiveWedding } from "../../src/lib/wedding-context";
import { useWeddings } from "../../src/hooks/use-weddings";
import {
  useBudgetCategories,
  useBudgetSummary,
  useCreateCategory,
} from "../../src/hooks/use-budget";
import { BudgetPage } from "../../src/routes/_authenticated/budget";

const mockedUseActiveWedding = vi.mocked(useActiveWedding);
const mockedUseWeddings = vi.mocked(useWeddings);
const mockedUseBudgetSummary = vi.mocked(useBudgetSummary);
const mockedUseBudgetCategories = vi.mocked(useBudgetCategories);
const mockedUseCreateCategory = vi.mocked(useCreateCategory);

describe("BudgetPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseWeddings.mockReturnValue({
      data: [{ id: "wedding-1", name: "Angel & Sam", role: "owner" }],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: "wedding-1",
      setActiveWeddingId: vi.fn(),
      setWeddingSwitchGuard: vi.fn(),
    } as ReturnType<typeof useActiveWedding>);
    mockedUseCreateCategory.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useCreateCategory>);
  });

  it("shows an error state when the budget queries fail", () => {
    mockedUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetSummary>);
    mockedUseBudgetCategories.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetCategories>);

    render(<BudgetPage />);

    expect(
      screen.getByText("We couldn't load your budget right now."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Build your budget")).not.toBeInTheDocument();
  });

  it("shows a create-wedding state instead of an empty budget when no wedding exists", () => {
    mockedUseWeddings.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: null,
      setActiveWeddingId: vi.fn(),
      setWeddingSwitchGuard: vi.fn(),
    } as ReturnType<typeof useActiveWedding>);
    mockedUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetSummary>);
    mockedUseBudgetCategories.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetCategories>);

    render(<BudgetPage />);

    expect(screen.getByText("Create a wedding first")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create wedding" }),
    ).toHaveAttribute("href", "/onboarding");
    expect(screen.queryByText("Build your budget")).not.toBeInTheDocument();
  });

  it("retries both budget queries from the error state", async () => {
    const user = userEvent.setup();
    const retrySummary = vi.fn();
    const retryCategories = vi.fn();

    mockedUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: retrySummary,
    } as ReturnType<typeof useBudgetSummary>);
    mockedUseBudgetCategories.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: retryCategories,
    } as ReturnType<typeof useBudgetCategories>);

    render(<BudgetPage />);

    await user.click(screen.getByRole("button", { name: "Retry budget" }));

    expect(retrySummary).toHaveBeenCalledTimes(1);
    expect(retryCategories).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing budget view visible during a background refetch failure", () => {
    mockedUseBudgetSummary.mockReturnValue({
      data: {
        totalBudgetCents: 3800000,
        totalEstimatedCents: 0,
        totalQuotedCents: 0,
        totalPaidCents: 0,
        unallocatedCents: 3800000,
        categories: [],
      },
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetSummary>);
    mockedUseBudgetCategories.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetCategories>);

    render(<BudgetPage />);

    expect(screen.getByText("Build your budget")).toBeInTheDocument();
    expect(
      screen.queryByText("We couldn't load your budget right now."),
    ).not.toBeInTheDocument();
  });

  it("guides the user when no budget categories exist yet", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({});
    mockedUseCreateCategory.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
    } as ReturnType<typeof useCreateCategory>);
    mockedUseBudgetSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetSummary>);
    mockedUseBudgetCategories.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetCategories>);

    render(<BudgetPage />);

    expect(screen.getByText("Build your budget")).toBeInTheDocument();
    expect(screen.getByText("Venue")).toBeInTheDocument();

    const addBtn = screen.getByRole("button", {
      name: /add 0 selected categories/i,
    });
    expect(addBtn).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Venue" }));
    await user.click(screen.getByRole("button", { name: "Catering" }));

    expect(
      screen.getByRole("button", { name: /add 2 selected categories/i }),
    ).not.toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: /add 2 selected categories/i }),
    );

    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync).toHaveBeenCalledWith({
      name: "Venue",
      estimatedCents: 0,
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      name: "Catering",
      estimatedCents: 0,
    });
  });
});
