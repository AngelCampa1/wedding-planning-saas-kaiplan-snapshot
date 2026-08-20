import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useEmailPreferences,
  usePublicEmailPreferences,
  useUpdateEmailPreferences,
  useUpdatePublicEmailPreferences,
} from "../../src/hooks/use-email-preferences";

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return {
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
    },
  };
}

describe("email preference hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads authenticated and public email preferences", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({
        email: "planner@example.com",
        preferences: {
          memberInvite: true,
          rsvpConfirmation: true,
          rsvpReminder: false,
        },
      })
      .mockResolvedValueOnce({
        email: "guest@example.com",
        allowedTypes: ["rsvpConfirmation", "rsvpReminder"],
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: true,
        },
      });

    const { wrapper } = createWrapper();
    const authenticated = renderHook(() => useEmailPreferences(), { wrapper });
    const publicQuery = renderHook(
      () => usePublicEmailPreferences("token-123"),
      { wrapper },
    );

    await waitFor(() =>
      expect(authenticated.result.current.isSuccess).toBe(true),
    );
    await waitFor(() =>
      expect(publicQuery.result.current.isSuccess).toBe(true),
    );

    expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/email/preferences");
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/public/email/preferences/token-123",
    );
  });

  it("updates authenticated and public email preferences", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({
        email: "planner@example.com",
        preferences: {
          memberInvite: false,
          rsvpConfirmation: true,
          rsvpReminder: false,
        },
      })
      .mockResolvedValueOnce({
        email: "guest@example.com",
        allowedTypes: ["memberInvite"],
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      });

    const { wrapper } = createWrapper();
    const authenticated = renderHook(() => useUpdateEmailPreferences(), {
      wrapper,
    });
    const publicMutation = renderHook(
      () => useUpdatePublicEmailPreferences("token-123"),
      { wrapper },
    );

    await act(async () => {
      await authenticated.result.current.mutateAsync({
        preferences: {
          memberInvite: false,
          rsvpConfirmation: true,
          rsvpReminder: false,
        },
      });
      await publicMutation.result.current.mutateAsync({
        preferences: {
          memberInvite: true,
          rsvpConfirmation: false,
          rsvpReminder: false,
        },
      });
    });

    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/email/preferences",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    expect(mockedApiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/public/email/preferences/token-123",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });

  it("does not fetch public preferences without a token", async () => {
    const { wrapper } = createWrapper();
    const query = renderHook(() => usePublicEmailPreferences(null), {
      wrapper,
    });

    expect(query.result.current.fetchStatus).toBe("idle");
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("can update public preferences even when the token is absent", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      email: "guest@example.com",
      allowedTypes: ["memberInvite"],
      preferences: {
        memberInvite: false,
        rsvpConfirmation: true,
        rsvpReminder: true,
      },
    });

    const { wrapper } = createWrapper();
    const mutation = renderHook(() => useUpdatePublicEmailPreferences(null), {
      wrapper,
    });

    await act(async () => {
      await mutation.result.current.mutateAsync({
        preferences: {
          memberInvite: false,
          rsvpConfirmation: true,
          rsvpReminder: true,
        },
      });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/public/email/preferences/null",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });
});
