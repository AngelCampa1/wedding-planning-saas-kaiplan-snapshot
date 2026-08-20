// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useGuests,
  useGuest,
  useGuestSummary,
  useCreateGuest,
  useUpdateGuest,
  useDeleteGuest,
  useDeleteGuestHousehold,
  useBulkUpdateRsvp,
  useImportGuestsCsv,
} from "../../src/hooks/use-guests";

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

describe("useGuests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches guests for a wedding", async () => {
    const guests = [{ id: "guest-1", firstName: "Alice", plusOnes: [] }];
    mockedApiFetch.mockResolvedValue(guests);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGuests("wedding-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(guests);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests",
    );
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    renderHook(() => useGuests(null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("passes side filter as query param", async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useGuests("wedding-1", { side: "bride" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests?side=bride",
    );
  });

  it("passes rsvpStatus filter as query param", async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useGuests("wedding-1", { rsvpStatus: "confirmed" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests?rsvpStatus=confirmed",
    );
  });

  it("passes groupName filter as query param", async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useGuests("wedding-1", { groupName: "Family" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests?groupName=Family",
    );
  });

  it("passes multiple filters as query params", async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useGuests("wedding-1", { side: "groom", rsvpStatus: "pending" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const calledUrl = mockedApiFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("side=groom");
    expect(calledUrl).toContain("rsvpStatus=pending");
  });
});

describe("useGuest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a single guest", async () => {
    const guest = { id: "guest-1", firstName: "Alice", plusOnes: [] };
    mockedApiFetch.mockResolvedValue(guest);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGuest("wedding-1", "guest-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(guest);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/guest-1",
    );
  });

  it("does not fetch when guestId is null", () => {
    mockedApiFetch.mockResolvedValue({});
    const { wrapper } = createWrapper();
    renderHook(() => useGuest("wedding-1", null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue({});
    const { wrapper } = createWrapper();
    renderHook(() => useGuest(null, "guest-1"), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useGuestSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches guest summary for a wedding", async () => {
    const summary = {
      totalGuests: 10,
      totalPrimary: 8,
      totalPlusOnes: 2,
      byRsvp: { confirmed: 5, declined: 2, pending: 3 },
      byDietary: {},
      bySide: { bride: 4, groom: 4, mutual: 2 },
    };
    mockedApiFetch.mockResolvedValue(summary);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useGuestSummary("wedding-1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summary);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/summary",
    );
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue({});
    const { wrapper } = createWrapper();
    renderHook(() => useGuestSummary(null), { wrapper });
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useCreateGuest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with POST and invalidates queries on success", async () => {
    const newGuest = { id: "guest-new", firstName: "Bob" };
    mockedApiFetch.mockResolvedValue(newGuest);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateGuest("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        firstName: "Bob",
        lastName: "Smith",
        side: "mutual",
        dietaryTags: [],
        rsvpStatus: "pending",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guests", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guest-summary", "wedding-1"],
    });
  });
});

describe("useUpdateGuest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with PATCH and invalidates queries on success", async () => {
    const updated = { id: "guest-1", firstName: "Alice Updated" };
    mockedApiFetch.mockResolvedValue(updated);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useUpdateGuest("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        guestId: "guest-1",
        data: { firstName: "Alice Updated" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/guest-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guests", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guest-summary", "wedding-1"],
    });
  });
});

describe("useDeleteGuest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with DELETE and invalidates queries on success", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteGuest("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate("guest-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/guest-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guests", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guest-summary", "wedding-1"],
    });
  });
});

describe("useDeleteGuestHousehold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with DELETE household endpoint and invalidates queries on success", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDeleteGuestHousehold("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate("guest-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/guest-1/household",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guests", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guest-summary", "wedding-1"],
    });
  });
});

describe("useBulkUpdateRsvp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with PATCH to bulk-rsvp endpoint and invalidates queries", async () => {
    mockedApiFetch.mockResolvedValue({ updated: 2 });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useBulkUpdateRsvp("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate([
        { id: "guest-1", rsvpStatus: "confirmed" },
        { id: "guest-2", rsvpStatus: "declined" },
      ]);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/bulk-rsvp",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guests", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guest-summary", "wedding-1"],
    });
  });
});

describe("useImportGuestsCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls API with POST FormData and invalidates queries on success", async () => {
    mockedApiFetch.mockResolvedValue({ imported: 5, errors: [] });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useImportGuestsCsv("wedding-1"), {
      wrapper,
    });

    const formData = new FormData();
    formData.append(
      "file",
      new Blob(["csv content"], { type: "text/csv" }),
      "guests.csv",
    );

    await act(async () => {
      result.current.mutate(formData);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/guests/import-csv",
      expect.objectContaining({
        method: "POST",
        body: formData,
        headers: {},
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guests", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["guest-summary", "wedding-1"],
    });
  });
});

describe("requireWeddingId guard for guest mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useCreateGuest throws when weddingId is null", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateGuest(null), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          firstName: "Test",
          lastName: "Guest",
          side: "partner1",
        }),
      ).rejects.toThrow(/without an active wedding/);
    });
  });

  it("useBulkUpdateRsvp throws when weddingId is null", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBulkUpdateRsvp(null), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync([{ id: "guest-1", rsvpStatus: "accepted" }]),
      ).rejects.toThrow(/without an active wedding/);
    });
  });
});
