import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GetSeatingResponse, SeatingChart } from "@kaiplan/shared";
import { apiFetch } from "../lib/api";

export function useSeatingChart(weddingId: string | null) {
  return useQuery<GetSeatingResponse>({
    queryKey: ["seating-chart", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/seating`),
    enabled: !!weddingId,
  });
}

export function useSaveSeatingChart(weddingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (chart: SeatingChart) =>
      apiFetch<GetSeatingResponse>(`/api/weddings/${weddingId}/seating`, {
        method: "PUT",
        body: JSON.stringify(chart),
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(["seating-chart", weddingId], response);
      void queryClient.invalidateQueries({
        queryKey: ["seating-chart", weddingId],
      });
    },
  });
}
