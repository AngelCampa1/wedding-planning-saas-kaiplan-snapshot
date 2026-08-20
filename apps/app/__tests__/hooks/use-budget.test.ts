import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useBudgetSummary,
  useBudgetCategories,
  useBudgetItems,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useCreateItem,
  useUpdateItem,
  useDeleteItem,
} from "../../src/hooks/use-budget";

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
    },
  };
}

describe("useBudgetSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches budget summary for a wedding", async () => {
    const summary = {
      totalBudgetCents: 3000000,
      totalEstimatedCents: 500000,
      totalQuotedCents: 420000,
      totalPaidCents: 150000,
      unallocatedCents: 2500000,
      categories: [],
    };
    mockedApiFetch.mockResolvedValue(summary);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBudgetSummary("wedding-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summary);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/summary",
    );
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue({});
    const { wrapper } = createWrapper();
    renderHook(() => useBudgetSummary(null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useBudgetCategories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches categories for a wedding", async () => {
    const categories = [{ id: "cat-1", name: "Photography" }];
    mockedApiFetch.mockResolvedValue(categories);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBudgetCategories("wedding-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(categories);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories",
    );
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useBudgetCategories(null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useBudgetItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches items for a category", async () => {
    const items = [{ id: "item-1", name: "Photographer" }];
    mockedApiFetch.mockResolvedValue(items);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBudgetItems("wedding-1", "cat-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(items);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories/cat-1/items",
    );
  });

  it("does not fetch when categoryId is null", () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useBudgetItems("wedding-1", null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useBudgetItems(null, "cat-1"), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useCreateCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API and invalidates queries on success", async () => {
    const newCategory = { id: "cat-new", name: "Catering" };
    mockedApiFetch.mockResolvedValue(newCategory);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateCategory("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ name: "Catering", estimatedCents: 100000 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-categories", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-summary", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vendor-summary", "wedding-1"],
    });
  });
});

describe("useUpdateCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with PATCH and invalidates queries on success", async () => {
    const updated = { id: "cat-1", name: "Updated Photography" };
    mockedApiFetch.mockResolvedValue(updated);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCategory("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        categoryId: "cat-1",
        data: { name: "Updated Photography" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories/cat-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-categories", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-summary", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vendor-summary", "wedding-1"],
    });
  });
});

describe("useDeleteCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with DELETE and invalidates queries on success", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteCategory("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate("cat-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories/cat-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-categories", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-summary", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vendor-summary", "wedding-1"],
    });
  });
});

describe("useCreateItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with POST and invalidates queries on success", async () => {
    const newItem = { id: "item-new", name: "Photographer" };
    mockedApiFetch.mockResolvedValue(newItem);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateItem("wedding-1", "cat-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        name: "Photographer",
        estimatedCents: 200000,
        quotedCents: 180000,
        paidCents: 0,
        notes: null,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories/cat-1/items",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-items", "wedding-1", "cat-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-categories", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-summary", "wedding-1"],
    });
  });
});

describe("useUpdateItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with PATCH and invalidates queries on success", async () => {
    const updated = { id: "item-1", name: "Updated Photographer" };
    mockedApiFetch.mockResolvedValue(updated);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateItem("wedding-1", "cat-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        itemId: "item-1",
        data: { name: "Updated Photographer" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories/cat-1/items/item-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-items", "wedding-1", "cat-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-categories", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-summary", "wedding-1"],
    });
  });
});

describe("useDeleteItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with DELETE and invalidates queries on success", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteItem("wedding-1", "cat-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate("item-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/budget/categories/cat-1/items/item-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-items", "wedding-1", "cat-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-categories", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-summary", "wedding-1"],
    });
  });
});
