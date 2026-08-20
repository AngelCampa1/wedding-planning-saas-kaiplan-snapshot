import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useVendorSummary,
  useVendors,
  useVendorDetail,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor,
  useCreateVendorQuote,
  useUpdateVendorQuote,
  useDeleteVendorQuote,
  useCreateVendorPayment,
  useUpdateVendorPayment,
  useDeleteVendorPayment,
} from "../../src/hooks/use-vendors";

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

describe("vendor hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches vendor summary", async () => {
    const summary = {
      totalVendors: 3,
      pendingQuotes: 1,
      signedContracts: 2,
      totalPaidCents: 175000,
      totalOutstandingCents: 95000,
    };
    mockedApiFetch.mockResolvedValue(summary);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useVendorSummary("wedding-1"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/summary",
    );
    expect(result.current.data).toEqual(summary);
  });

  it("fetches vendor list", async () => {
    const vendors = [{ id: "vendor-1", companyName: "Golden Hour Photo" }];
    mockedApiFetch.mockResolvedValue(vendors);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useVendors("wedding-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors",
    );
    expect(result.current.data).toEqual(vendors);
  });

  it("fetches vendor detail", async () => {
    const detail = { id: "vendor-1", companyName: "Golden Hour Photo" };
    mockedApiFetch.mockResolvedValue(detail);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useVendorDetail("wedding-1", "vendor-1"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1",
    );
    expect(result.current.data).toEqual(detail);
  });

  it("creates a vendor and invalidates vendor queries", async () => {
    mockedApiFetch.mockResolvedValue({ id: "vendor-1" });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateVendor("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        primaryContactName: "Sofia Ramos",
        companyName: "Golden Hour Photo",
        categoryId: "cat-1",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors",
      expect.objectContaining({ method: "POST" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vendor-summary", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vendors", "wedding-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["budget-summary", "wedding-1"],
    });
  });

  it("updates a vendor and invalidates detail", async () => {
    mockedApiFetch.mockResolvedValue({ id: "vendor-1" });
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateVendor("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate({
        vendorId: "vendor-1",
        data: { contractStatus: "signed" },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vendor-detail", "wedding-1", "vendor-1"],
    });
  });

  it("deletes a vendor", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteVendor("wedding-1"), {
      wrapper,
    });

    await act(async () => {
      result.current.mutate("vendor-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["vendors", "wedding-1"],
    });
  });

  it("creates and updates quote records", async () => {
    mockedApiFetch.mockResolvedValue({ id: "quote-1" });
    const { wrapper } = createWrapper();
    const createResult = renderHook(
      () => useCreateVendorQuote("wedding-1", "vendor-1"),
      { wrapper },
    );

    await act(async () => {
      createResult.result.current.mutate({
        amountCents: 250000,
        quotedAt: "2026-04-07",
        status: "accepted",
        budgetItemId: "item-1",
      });
    });

    await waitFor(() =>
      expect(createResult.result.current.isSuccess).toBe(true),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1/quotes",
      expect.objectContaining({ method: "POST" }),
    );

    const updateResult = renderHook(
      () => useUpdateVendorQuote("wedding-1", "vendor-1"),
      { wrapper },
    );

    await act(async () => {
      updateResult.result.current.mutate({
        quoteId: "quote-1",
        data: { status: "rejected" },
      });
    });

    await waitFor(() =>
      expect(updateResult.result.current.isSuccess).toBe(true),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1/quotes/quote-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("rejects vendor quote mutations before apiFetch when required IDs are empty", async () => {
    const { wrapper } = createWrapper();
    const createResult = renderHook(
      () => useCreateVendorQuote("", "vendor-1"),
      {
        wrapper,
      },
    );

    await act(async () => {
      createResult.result.current.mutate({
        amountCents: 250000,
        quotedAt: "2026-04-07",
        status: "accepted",
      });
    });

    await waitFor(() => expect(createResult.result.current.isError).toBe(true));
    expect(mockedApiFetch).not.toHaveBeenCalled();

    const updateResult = renderHook(
      () => useUpdateVendorQuote("wedding-1", "vendor-1"),
      { wrapper },
    );

    await act(async () => {
      updateResult.result.current.mutate({
        quoteId: "",
        data: { status: "rejected" },
      });
    });

    await waitFor(() => expect(updateResult.result.current.isError).toBe(true));
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it("deletes quote records", async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useDeleteVendorQuote("wedding-1", "vendor-1"),
      { wrapper },
    );

    await act(async () => {
      result.current.mutate("quote-1");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1/quotes/quote-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("creates, updates, and deletes vendor payments", async () => {
    mockedApiFetch.mockResolvedValue({ id: "payment-1" });
    const { wrapper } = createWrapper();
    const createResult = renderHook(
      () => useCreateVendorPayment("wedding-1", "vendor-1", "quote-1"),
      { wrapper },
    );

    await act(async () => {
      createResult.result.current.mutate({
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      });
    });

    await waitFor(() =>
      expect(createResult.result.current.isSuccess).toBe(true),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1/quotes/quote-1/payments",
      expect.objectContaining({ method: "POST" }),
    );

    const updateResult = renderHook(
      () => useUpdateVendorPayment("wedding-1", "vendor-1", "quote-1"),
      { wrapper },
    );

    await act(async () => {
      updateResult.result.current.mutate({
        paymentId: "payment-1",
        data: { amountCents: 60000 },
      });
    });

    await waitFor(() =>
      expect(updateResult.result.current.isSuccess).toBe(true),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1/quotes/quote-1/payments/payment-1",
      expect.objectContaining({ method: "PATCH" }),
    );

    const deleteResult = renderHook(
      () => useDeleteVendorPayment("wedding-1", "vendor-1", "quote-1"),
      { wrapper },
    );

    await act(async () => {
      deleteResult.result.current.mutate("payment-1");
    });

    await waitFor(() =>
      expect(deleteResult.result.current.isSuccess).toBe(true),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/api/weddings/wedding-1/vendors/vendor-1/quotes/quote-1/payments/payment-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("rejects vendor payment mutations before apiFetch when required IDs are empty", async () => {
    const { wrapper } = createWrapper();
    const createResult = renderHook(
      () => useCreateVendorPayment("wedding-1", "vendor-1", ""),
      { wrapper },
    );

    await act(async () => {
      createResult.result.current.mutate({
        paymentType: "deposit",
        amountCents: 50000,
        paidAt: "2026-04-07",
      });
    });

    await waitFor(() => expect(createResult.result.current.isError).toBe(true));
    expect(mockedApiFetch).not.toHaveBeenCalled();

    const deleteResult = renderHook(
      () => useDeleteVendorPayment("wedding-1", "vendor-1", "quote-1"),
      { wrapper },
    );

    await act(async () => {
      deleteResult.result.current.mutate("");
    });

    await waitFor(() => expect(deleteResult.result.current.isError).toBe(true));
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
