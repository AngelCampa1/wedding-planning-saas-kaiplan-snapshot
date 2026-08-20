import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EmailPreferencesResponse,
  PublicEmailPreferencesResponse,
  UpdateEmailPreferencesInput,
} from "@kaiplan/shared";
import { apiFetch } from "../lib/api";

function invalidateEmailPreferences(
  queryClient: ReturnType<typeof useQueryClient>,
  token?: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["email-preferences"] });

  if (token) {
    void queryClient.invalidateQueries({
      queryKey: ["public-email-preferences", token],
    });
  }
}

export function useEmailPreferences() {
  return useQuery({
    queryKey: ["email-preferences"],
    queryFn: () => apiFetch<EmailPreferencesResponse>("/api/email/preferences"),
  });
}

export function useUpdateEmailPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateEmailPreferencesInput) =>
      apiFetch<EmailPreferencesResponse>("/api/email/preferences", {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => invalidateEmailPreferences(queryClient),
  });
}

export function usePublicEmailPreferences(token: string | null) {
  return useQuery({
    queryKey: ["public-email-preferences", token],
    queryFn: () =>
      apiFetch<PublicEmailPreferencesResponse>(
        `/api/public/email/preferences/${encodeURIComponent(token!)}`,
      ),
    enabled: !!token,
  });
}

export function useUpdatePublicEmailPreferences(token: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateEmailPreferencesInput) =>
      apiFetch<PublicEmailPreferencesResponse>(
        `/api/public/email/preferences/${encodeURIComponent(token!)}`,
        {
          method: "PATCH",
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () =>
      invalidateEmailPreferences(queryClient, token ?? undefined),
  });
}
