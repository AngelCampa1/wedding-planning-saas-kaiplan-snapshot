import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

import {
  useBillingSummary,
  useBillingHistory,
  useBillingCheckout,
  useBillingPortal,
} from "../../src/hooks/use-billing";

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

interface WrapperBundle {
  queryClient: QueryClient;
  invalidateSpy: ReturnType<typeof vi.fn>;
  wrapper: (props: { children: ReactNode }) => ReturnType<typeof createElement>;
}

function createWrapper(): WrapperBundle {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.fn(queryClient.invalidateQueries.bind(queryClient));
  queryClient.invalidateQueries =
    invalidateSpy as unknown as typeof queryClient.invalidateQueries;
  return {
    queryClient,
    invalidateSpy,
    wrapper: function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
    },
  };
}

describe("billing hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the billing summary", async () => {
    const summary = {
      plan: "starter",
      status: "active",
      stripeCustomerId: "cus_123",
      currentPeriodEnd: "2026-05-01T00:00:00.000Z",
      features: ["vendors"],
      canManageBilling: true,
    };
    mockedApiFetch.mockResolvedValue(summary);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBillingSummary(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summary);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/billing",
      expect.objectContaining({
        schema: expect.objectContaining({ parse: expect.any(Function) }),
      }),
    );
  });

  it("fetches billing history", async () => {
    const history = {
      items: [
        {
          id: "inv_1",
          type: "invoice",
          amountCents: 12500,
          currency: "usd",
          status: "paid",
          createdAt: "2026-04-01T00:00:00.000Z",
          hostedUrl: "https://example.com/invoice",
        },
      ],
    };
    mockedApiFetch.mockResolvedValue(history);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBillingHistory(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(history);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/billing/history",
      expect.objectContaining({
        schema: expect.objectContaining({ parse: expect.any(Function) }),
      }),
    );
  });

  it("starts checkout for a paid plan", async () => {
    mockedApiFetch.mockResolvedValue({ url: "https://checkout.example.com" });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBillingCheckout(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ plan: "pro" });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
      }),
    );
  });

  it("invalidates billing summary and history after checkout succeeds", async () => {
    mockedApiFetch.mockResolvedValue({ url: "https://checkout.example.com" });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useBillingCheckout(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ plan: "pro" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["billing-summary"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["billing-history"],
    });
  });

  it("opens the billing portal", async () => {
    mockedApiFetch.mockResolvedValue({ url: "https://portal.example.com" });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useBillingPortal(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/billing/portal",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("invalidates billing summary and history after portal succeeds", async () => {
    mockedApiFetch.mockResolvedValue({ url: "https://portal.example.com" });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useBillingPortal(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["billing-summary"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["billing-history"],
    });
  });
});
