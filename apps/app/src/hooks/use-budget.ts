import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  BudgetSummary,
  BudgetCategoryWithTotals,
  BudgetItem,
  CreateBudgetCategoryInput,
  UpdateBudgetCategoryInput,
  CreateBudgetItemInput,
  UpdateBudgetItemInput,
} from "@kaiplan/shared";

function invalidateBudgetVendorQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  weddingId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["vendor-summary", weddingId],
  });
  void queryClient.invalidateQueries({ queryKey: ["vendors", weddingId] });
}

export function useBudgetSummary(weddingId: string | null) {
  return useQuery<BudgetSummary>({
    queryKey: ["budget-summary", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/budget/summary`),
    enabled: !!weddingId,
  });
}

export function useBudgetCategories(weddingId: string | null) {
  return useQuery<BudgetCategoryWithTotals[]>({
    queryKey: ["budget-categories", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/budget/categories`),
    enabled: !!weddingId,
  });
}

export function useBudgetItems(
  weddingId: string | null,
  categoryId: string | null,
) {
  return useQuery<BudgetItem[]>({
    queryKey: ["budget-items", weddingId, categoryId],
    queryFn: () =>
      apiFetch(
        `/api/weddings/${weddingId}/budget/categories/${categoryId}/items`,
      ),
    enabled: !!weddingId && !!categoryId,
  });
}

export function useCreateCategory(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBudgetCategoryInput) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["budget-categories", weddingId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-summary", weddingId],
      });
      invalidateBudgetVendorQueries(queryClient, weddingId);
    },
  });
}

export function useUpdateCategory(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      data,
    }: {
      categoryId: string;
      data: UpdateBudgetCategoryInput;
    }) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories/${categoryId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["budget-categories", weddingId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-summary", weddingId],
      });
      invalidateBudgetVendorQueries(queryClient, weddingId);
    },
  });
}

export function useDeleteCategory(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) =>
      apiFetch(`/api/weddings/${weddingId}/budget/categories/${categoryId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["budget-categories", weddingId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-summary", weddingId],
      });
      invalidateBudgetVendorQueries(queryClient, weddingId);
    },
  });
}

export function useCreateItem(weddingId: string, categoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBudgetItemInput) =>
      apiFetch(
        `/api/weddings/${weddingId}/budget/categories/${categoryId}/items`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["budget-items", weddingId, categoryId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-categories", weddingId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-summary", weddingId],
      });
      invalidateBudgetVendorQueries(queryClient, weddingId);
    },
  });
}

export function useUpdateItem(weddingId: string, categoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: string;
      data: UpdateBudgetItemInput;
    }) =>
      apiFetch(
        `/api/weddings/${weddingId}/budget/categories/${categoryId}/items/${itemId}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["budget-items", weddingId, categoryId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-categories", weddingId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-summary", weddingId],
      });
      invalidateBudgetVendorQueries(queryClient, weddingId);
    },
  });
}

export function useDeleteItem(weddingId: string, categoryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiFetch(
        `/api/weddings/${weddingId}/budget/categories/${categoryId}/items/${itemId}`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["budget-items", weddingId, categoryId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-categories", weddingId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["budget-summary", weddingId],
      });
      invalidateBudgetVendorQueries(queryClient, weddingId);
    },
  });
}
