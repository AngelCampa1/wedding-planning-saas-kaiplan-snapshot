import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  WeddingMember,
  InviteMemberInput,
  WeddingRole,
} from "@kaiplan/shared";

export type { WeddingMember };

function requireWeddingId(weddingId: string | null): string {
  if (!weddingId) {
    throw new Error("Cannot run member mutation without an active wedding.");
  }
  return weddingId;
}

export function useWeddingMembers(weddingId: string | null) {
  return useQuery<WeddingMember[]>({
    queryKey: ["wedding-members", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/members`),
    enabled: !!weddingId,
  });
}

export function useInviteMember(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InviteMemberInput) => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/members`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["wedding-members", weddingId],
      });
    },
  });
}

export function useRemoveMember(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/members/${memberId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["wedding-members", weddingId],
      });
    },
  });
}

export function useUpdateMemberRole(weddingId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: WeddingRole;
    }) => {
      const id = requireWeddingId(weddingId);
      return apiFetch(`/api/weddings/${id}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["wedding-members", weddingId],
      });
      void queryClient.invalidateQueries({ queryKey: ["weddings"] });
    },
  });
}
