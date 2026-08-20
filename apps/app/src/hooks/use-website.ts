import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  HouseholdRsvpToken,
  ManualRsvpReminderRequest,
  ManualRsvpReminderResponse,
  WeddingWebsiteDraft,
  WeddingWebsiteImageUploadIntent,
  WeddingWebsiteSlugAvailability,
} from "@kaiplan/shared";
import { ApiError, apiFetch } from "../lib/api";

async function fetchWebsiteDraft(
  weddingId: string,
): Promise<WeddingWebsiteDraft | null> {
  try {
    return await apiFetch<WeddingWebsiteDraft>(
      `/api/weddings/${weddingId}/website`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

function invalidateWebsiteQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  weddingId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["website", weddingId] });
  void queryClient.invalidateQueries({ queryKey: ["website-slug", weddingId] });
}

export function useWeddingWebsite(weddingId: string | null) {
  return useQuery<WeddingWebsiteDraft | null>({
    queryKey: ["website", weddingId],
    queryFn: () => fetchWebsiteDraft(weddingId!),
    enabled: !!weddingId,
  });
}

export function useSaveWeddingWebsite(weddingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (draft: Omit<WeddingWebsiteDraft, "weddingId">) =>
      apiFetch<WeddingWebsiteDraft>(`/api/weddings/${weddingId}/website`, {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    onSuccess: () => invalidateWebsiteQueries(queryClient, weddingId),
  });
}

export function usePublishWeddingWebsite(weddingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<WeddingWebsiteDraft>(
        `/api/weddings/${weddingId}/website/publish`,
        {
          method: "POST",
        },
      ),
    onSuccess: () => invalidateWebsiteQueries(queryClient, weddingId),
  });
}

export function useUnpublishWeddingWebsite(weddingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiFetch<WeddingWebsiteDraft>(
        `/api/weddings/${weddingId}/website/publish`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: () => invalidateWebsiteQueries(queryClient, weddingId),
  });
}

export function useWeddingWebsiteSlugAvailability(weddingId: string) {
  return useMutation({
    mutationFn: (slug: string) =>
      apiFetch<WeddingWebsiteSlugAvailability>(
        `/api/weddings/${weddingId}/website/slug-availability?slug=${encodeURIComponent(slug)}`,
      ),
  });
}

export function useWeddingWebsiteHouseholdToken(weddingId: string) {
  return useMutation({
    mutationFn: (primaryGuestId: string) =>
      apiFetch<HouseholdRsvpToken>(
        `/api/weddings/${weddingId}/website/household-rsvp-token/${primaryGuestId}`,
      ),
  });
}

export function useCreateWeddingWebsiteHouseholdToken(weddingId: string) {
  return useMutation({
    mutationFn: (primaryGuestId: string) =>
      apiFetch<HouseholdRsvpToken>(
        `/api/weddings/${weddingId}/website/household-rsvp-token`,
        {
          method: "POST",
          body: JSON.stringify({ primaryGuestId }),
        },
      ),
  });
}

export function useWeddingWebsiteHeroUploadIntent(weddingId: string) {
  return useMutation({
    mutationFn: (input: { contentType: string; filename?: string }) =>
      apiFetch<WeddingWebsiteImageUploadIntent>(
        `/api/weddings/${weddingId}/website/hero-image-upload-intent`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
  });
}

export function useSendWeddingWebsiteRsvpReminders(weddingId: string) {
  return useMutation({
    mutationFn: (input: ManualRsvpReminderRequest) =>
      apiFetch<ManualRsvpReminderResponse>(
        `/api/weddings/${weddingId}/website/rsvp-reminders`,
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      ),
  });
}
