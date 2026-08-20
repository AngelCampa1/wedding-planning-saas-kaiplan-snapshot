import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useWeddingWebsite,
  useSaveWeddingWebsite,
  usePublishWeddingWebsite,
  useUnpublishWeddingWebsite,
  useWeddingWebsiteSlugAvailability,
  useWeddingWebsiteHouseholdToken,
  useCreateWeddingWebsiteHouseholdToken,
  useWeddingWebsiteHeroUploadIntent,
  useSendWeddingWebsiteRsvpReminders,
} from "../../src/hooks/use-website";

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { apiFetch, ApiError } from "../../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

const draft = {
  weddingId: "wedding-1",
  slug: "anna-and-lee",
  template: "classic" as const,
  content: {
    hero: {
      title: "Anna & Lee",
      subtitle: "June 12, 2026",
      body: "Join us in Oaxaca.",
      ctaLabel: "RSVP",
    },
    story: { title: "Our Story", body: "We met in college." },
    venue: {
      name: "Casa Agave",
      address: "123 Garden Street",
      details: "Ceremony starts at sunset.",
      mapUrl: null,
    },
    registry: {
      title: "Registry",
      url: "https://registry.example.com",
      details: "Your presence is enough.",
    },
    rsvp: {
      visible: true,
      headline: "Please respond by May 1",
      details: "We can't wait to celebrate.",
    },
    heroImage: null,
  },
};

describe("website hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the API responds with an explicit empty draft payload", async () => {
    mockedApiFetch.mockResolvedValueOnce(null);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWeddingWebsite("wedding-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("returns null when no draft exists yet", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(404, "Not found"));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWeddingWebsite("wedding-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("surfaces non-404 draft errors", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(500, "Server exploded"));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWeddingWebsite("wedding-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(500);
  });

  it("surfaces 402 draft errors for upgrade handling", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(402, "Upgrade required"));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWeddingWebsite("wedding-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect((result.current.error as ApiError).status).toBe(402);
  });

  it("always saves a draft with POST (upsert) regardless of existing state", async () => {
    mockedApiFetch.mockResolvedValueOnce(draft);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveWeddingWebsite("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        slug: draft.slug,
        template: draft.template,
        content: draft.content,
      });
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/website",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("two concurrent POST saves do not race-condition each other", async () => {
    mockedApiFetch.mockResolvedValueOnce(draft).mockResolvedValueOnce(draft);

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveWeddingWebsite("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      await Promise.all([
        result.current.mutateAsync({
          slug: draft.slug,
          template: draft.template,
          content: draft.content,
        }),
        result.current.mutateAsync({
          slug: draft.slug,
          template: draft.template,
          content: draft.content,
        }),
      ]);
    });

    // Both calls use POST — no GET needed to decide the method (upsert semantics)
    const calls = mockedApiFetch.mock.calls;
    for (const call of calls) {
      expect(call[1]).toEqual(expect.objectContaining({ method: "POST" }));
    }
  });

  it("publishes and unpublishes the site", async () => {
    mockedApiFetch.mockResolvedValue(draft);
    const { wrapper } = createWrapper();
    const publish = renderHook(() => usePublishWeddingWebsite("wedding-1"), {
      wrapper,
    });
    const unpublish = renderHook(
      () => useUnpublishWeddingWebsite("wedding-1"),
      {
        wrapper,
      },
    );

    await act(async () => {
      await publish.result.current.mutateAsync();
      await unpublish.result.current.mutateAsync();
    });

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/weddings/wedding-1/website/publish",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/weddings/wedding-1/website/publish",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("requests helper website endpoints", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({
        slug: "anna-and-lee",
        valid: true,
        available: true,
        conflictWeddingId: null,
      })
      .mockResolvedValueOnce({
        token: "token-1",
        weddingId: "wedding-1",
        primaryGuestId: "guest-1",
        createdAt: "2026-04-08T10:00:00.000Z",
        updatedAt: "2026-04-08T10:00:00.000Z",
      })
      .mockResolvedValueOnce({
        token: "token-1",
        weddingId: "wedding-1",
        primaryGuestId: "guest-1",
        createdAt: "2026-04-08T10:00:00.000Z",
        updatedAt: "2026-04-08T10:00:00.000Z",
      })
      .mockResolvedValueOnce({
        imageId: "image-1",
        uploadUrl: "https://upload.example.com/direct",
        imageUrl: "https://imagedelivery.net/hash/image-1/public",
        expiresAt: "2026-04-08T10:15:00.000Z",
      })
      .mockResolvedValueOnce({
        results: [
          {
            primaryGuestId: "guest-1",
            guestEmail: "guest@example.com",
            status: "sent",
            emailId: "email-1",
            error: null,
          },
        ],
      });

    const { wrapper } = createWrapper();
    const slugCheck = renderHook(
      () => useWeddingWebsiteSlugAvailability("wedding-1"),
      { wrapper },
    );
    const tokenLookup = renderHook(
      () => useWeddingWebsiteHouseholdToken("wedding-1"),
      { wrapper },
    );
    const tokenCreate = renderHook(
      () => useCreateWeddingWebsiteHouseholdToken("wedding-1"),
      { wrapper },
    );
    const uploadIntent = renderHook(
      () => useWeddingWebsiteHeroUploadIntent("wedding-1"),
      { wrapper },
    );
    const reminders = renderHook(
      () => useSendWeddingWebsiteRsvpReminders("wedding-1"),
      { wrapper },
    );

    await act(async () => {
      await slugCheck.result.current.mutateAsync("anna-and-lee");
      await tokenLookup.result.current.mutateAsync("guest-1");
      await tokenCreate.result.current.mutateAsync("guest-1");
      await uploadIntent.result.current.mutateAsync({
        contentType: "image/jpeg",
        filename: "hero.jpg",
      });
      await reminders.result.current.mutateAsync({
        primaryGuestIds: ["guest-1"],
      });
    });

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/weddings/wedding-1/website/slug-availability?slug=anna-and-lee",
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/weddings/wedding-1/website/household-rsvp-token/guest-1",
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/weddings/wedding-1/website/household-rsvp-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ primaryGuestId: "guest-1" }),
      }),
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      4,
      "/api/weddings/wedding-1/website/hero-image-upload-intent",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          contentType: "image/jpeg",
          filename: "hero.jpg",
        }),
      }),
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      5,
      "/api/weddings/wedding-1/website/rsvp-reminders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          primaryGuestIds: ["guest-1"],
        }),
      }),
    );
  });
});
