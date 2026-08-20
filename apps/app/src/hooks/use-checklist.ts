import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  ChecklistResponse,
  CreateChecklistTaskInput,
  UpdateChecklistTaskInput,
} from "@kaiplan/shared";

export function useChecklist(weddingId: string | null) {
  return useQuery<ChecklistResponse>({
    queryKey: ["checklist", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/checklist`),
    enabled: !!weddingId,
  });
}

export function useCreateChecklistTask(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateChecklistTaskInput) =>
      apiFetch(`/api/weddings/${weddingId}/checklist`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["checklist", weddingId],
      });
    },
  });
}

export function useUpdateChecklistTask(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      data,
    }: {
      taskId: string;
      data: UpdateChecklistTaskInput;
    }) =>
      apiFetch(`/api/weddings/${weddingId}/checklist/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["checklist", weddingId],
      });
    },
  });
}

export function useDeleteChecklistTask(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      apiFetch(`/api/weddings/${weddingId}/checklist/${taskId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["checklist", weddingId],
      });
    },
  });
}

export function useSeedChecklist(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/api/weddings/${weddingId}/checklist/seed`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["checklist", weddingId],
      });
    },
  });
}
