import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  WeddingWithRole,
  CreateWeddingInput,
  Wedding,
} from "@kaiplan/shared";

function requireWeddingId(weddingId: string | null): string {
  if (!weddingId) {
    throw new Error("Cannot run wedding mutation without an active wedding.");
  }
  return weddingId;
}

export function useWeddings() {
  return useQuery<WeddingWithRole[]>({
    queryKey: ["weddings"],
    queryFn: () => apiFetch("/api/weddings"),
  });
}

export function useCreateWedding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateWeddingInput) =>
      apiFetch("/api/weddings", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["weddings"] });
    },
  });
}

export function useArchiveWedding(weddingId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<Wedding, Error, void>({
    mutationFn: () => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/archive`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["weddings"] });
      void queryClient.invalidateQueries({ queryKey: ["wedding", weddingId] });
    },
  });
}

export function useUnarchiveWedding(weddingId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<Wedding, Error, void>({
    mutationFn: () => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/unarchive`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["weddings"] });
      void queryClient.invalidateQueries({ queryKey: ["wedding", weddingId] });
    },
  });
}
