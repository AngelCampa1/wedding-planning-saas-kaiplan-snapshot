import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useWeddingMembers,
  useInviteMember,
  useRemoveMember,
  useUpdateMemberRole,
} from "../../src/hooks/use-wedding-members";

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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

const MEMBER_ROW = {
  id: "member-uuid-1",
  weddingId: "wedding-1",
  userId: "user-1",
  role: "owner" as const,
  invitedEmail: null,
  acceptedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
};

describe("useWeddingMembers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches members for a wedding", async () => {
    const members = [MEMBER_ROW];
    mockedApiFetch.mockResolvedValue(members);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWeddingMembers("wedding-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(members);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/members",
    );
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useWeddingMembers(null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("returns empty array when no members", async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWeddingMembers("wedding-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useInviteMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with POST and invalidates queries on success", async () => {
    const inviteResponse = {
      ...MEMBER_ROW,
      role: "editor" as const,
      userId: null,
      acceptedAt: null,
    };
    mockedApiFetch.mockResolvedValue(inviteResponse);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useInviteMember("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ email: "editor@example.com", role: "editor" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/members",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["wedding-members", "wedding-1"],
    });
  });
});

describe("useRemoveMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with DELETE and invalidates queries on success", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveMember("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate("member-uuid-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/members/member-uuid-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["wedding-members", "wedding-1"],
    });
  });
});

describe("useUpdateMemberRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with PATCH and invalidates members and weddings", async () => {
    mockedApiFetch.mockResolvedValue({ ...MEMBER_ROW, role: "viewer" });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateMemberRole("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({ memberId: "member-uuid-1", role: "viewer" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/members/member-uuid-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ role: "viewer" }),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["wedding-members", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["weddings"] });
  });
});

describe("requireWeddingId guard", () => {
  it("useInviteMember throws when weddingId is null", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useInviteMember(null), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          email: "user@example.com",
          role: "editor",
        }),
      ).rejects.toThrow(/without an active wedding/);
    });
  });

  it("useRemoveMember throws when weddingId is null", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRemoveMember(null), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync("member-1")).rejects.toThrow(
        /without an active wedding/,
      );
    });
  });

  it("useUpdateMemberRole throws when weddingId is null", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateMemberRole(null), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          memberId: "member-1",
          role: "viewer",
        }),
      ).rejects.toThrow(/without an active wedding/);
    });
  });
});
