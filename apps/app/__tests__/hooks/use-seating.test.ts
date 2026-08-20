import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GetSeatingResponse, SeatingChart } from "@kaiplan/shared";
import {
  useSaveSeatingChart,
  useSeatingChart,
} from "../../src/hooks/use-seating";

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

function makeChart(): SeatingChart {
  return {
    width: 1200,
    height: 800,
    tables: [],
  };
}

describe("useSeatingChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the current seating chart for a wedding", async () => {
    const response: GetSeatingResponse = {
      chart: makeChart(),
      summary: {
        tableCount: 0,
        seatCount: 0,
        assignedSeatCount: 0,
        unassignedSeatCount: 0,
      },
    };
    mockedApiFetch.mockResolvedValue(response);
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSeatingChart("wedding-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(response);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/seating",
    );
  });

  it("does not fetch when weddingId is null", () => {
    mockedApiFetch.mockResolvedValue({
      chart: makeChart(),
      summary: {
        tableCount: 0,
        seatCount: 0,
        assignedSeatCount: 0,
        unassignedSeatCount: 0,
      },
    });
    const { wrapper } = createWrapper();

    renderHook(() => useSeatingChart(null), { wrapper });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe("useSaveSeatingChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates the saved chart response into the seating query cache", async () => {
    const response: GetSeatingResponse = {
      chart: makeChart(),
      summary: {
        tableCount: 0,
        seatCount: 0,
        assignedSeatCount: 0,
        unassignedSeatCount: 0,
      },
    };
    mockedApiFetch.mockResolvedValue(response);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    const { result } = renderHook(() => useSaveSeatingChart("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate(makeChart());
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/seating",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ["seating-chart", "wedding-1"],
      response,
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["seating-chart", "wedding-1"],
    });
  });
});
