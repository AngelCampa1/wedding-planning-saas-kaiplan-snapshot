import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useWeddings,
  useCreateWedding,
  useArchiveWedding,
  useUnarchiveWedding,
} from "../../src/hooks/use-weddings";

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

const WEDDING_ROW = {
  id: "wedding-uuid-1",
  name: "My Wedding",
  date: "2025-06-15",
  budgetCents: 500000,
  currency: "USD",
  timezone: "America/New_York",
  createdBy: "user-1",
  archivedAt: null,
  status: "planning" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("useWeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches weddings for the authenticated user", async () => {
    const weddings = [{ ...WEDDING_ROW, role: "owner" }];
    mockedApiFetch.mockResolvedValue(weddings);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWeddings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(weddings);
    expect(mockedApiFetch).toHaveBeenCalledWith("/api/weddings");
  });

  it("returns empty array when user has no weddings", async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useWeddings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useCreateWedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with POST and invalidates weddings query on success", async () => {
    mockedApiFetch.mockResolvedValue(WEDDING_ROW);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateWedding(), { wrapper });

    await act(async () => {
      result.current.mutate({
        name: "Beach Wedding",
        date: "2025-08-20",
        budgetCents: 300000,
        currency: "USD",
        timezone: "America/New_York",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["weddings"] });
  });
});

describe("useArchiveWedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when weddingId is null", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useArchiveWedding(null), { wrapper });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain(
      "Cannot run wedding mutation without an active wedding.",
    );
  });

  it("calls POST /archive and invalidates weddings queries on success", async () => {
    const archivedWedding = {
      ...WEDDING_ROW,
      status: "archived" as const,
      archivedAt: "2026-04-14T00:00:00Z",
    };
    mockedApiFetch.mockResolvedValue(archivedWedding);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useArchiveWedding("wedding-uuid-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-uuid-1/archive",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["weddings"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["wedding", "wedding-uuid-1"],
    });
  });
});

describe("useUnarchiveWedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when weddingId is null", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUnarchiveWedding(null), { wrapper });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain(
      "Cannot run wedding mutation without an active wedding.",
    );
  });

  it("calls POST /unarchive and invalidates weddings queries on success", async () => {
    mockedApiFetch.mockResolvedValue(WEDDING_ROW);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUnarchiveWedding("wedding-uuid-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-uuid-1/unarchive",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["weddings"] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["wedding", "wedding-uuid-1"],
    });
  });
});
