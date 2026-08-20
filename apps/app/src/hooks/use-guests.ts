import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  GuestWithPlusOnes,
  GuestSummary,
  CreateGuestInput,
  UpdateGuestInput,
  BulkUpdateRsvpInput,
} from "@kaiplan/shared";

interface GuestFilters {
  side?: string;
  rsvpStatus?: string;
  groupName?: string;
}

export interface GuestCsvImportResult {
  imported: number;
  errors: { row: number; reason: string }[];
}

export function useGuests(weddingId: string | null, filters?: GuestFilters) {
  return useQuery<GuestWithPlusOnes[]>({
    queryKey: ["guests", weddingId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.side) params.set("side", filters.side);
      if (filters?.rsvpStatus) params.set("rsvpStatus", filters.rsvpStatus);
      if (filters?.groupName) params.set("groupName", filters.groupName);
      const qs = params.toString();
      const url = `/api/weddings/${weddingId}/guests${qs ? `?${qs}` : ""}`;
      return apiFetch(url);
    },
    enabled: !!weddingId,
  });
}

export function useGuest(weddingId: string | null, guestId: string | null) {
  return useQuery<GuestWithPlusOnes>({
    queryKey: ["guest", weddingId, guestId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/guests/${guestId}`),
    enabled: !!weddingId && !!guestId,
  });
}

export function useGuestSummary(weddingId: string | null) {
  return useQuery<GuestSummary>({
    queryKey: ["guest-summary", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/guests/summary`),
    enabled: !!weddingId,
  });
}

function requireWeddingId(weddingId: string | null): string {
  if (!weddingId) {
    throw new Error("Cannot run guest mutation without an active wedding.");
  }
  return weddingId;
}

export function useCreateGuest(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGuestInput) => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/guests`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      void queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useUpdateGuest(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      guestId,
      data,
    }: {
      guestId: string;
      data: UpdateGuestInput;
    }) => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/guests/${guestId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      void queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useDeleteGuest(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guestId: string) => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/guests/${guestId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      void queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useDeleteGuestHousehold(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guestId: string) => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/guests/${guestId}/household`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      void queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useBulkUpdateRsvp(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkUpdateRsvpInput) => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/guests/bulk-rsvp`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      void queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}

export function useImportGuestsCsv(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => {
      const id = requireWeddingId(weddingId);
      return apiFetch<GuestCsvImportResult>(
        `/api/weddings/${id}/guests/import-csv`,
        {
          method: "POST",
          body: formData,
          headers: {},
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guests", weddingId] });
      void queryClient.invalidateQueries({
        queryKey: ["guest-summary", weddingId],
      });
    },
  });
}
