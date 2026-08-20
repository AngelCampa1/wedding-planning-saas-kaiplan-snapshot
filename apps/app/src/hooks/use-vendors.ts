import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type {
  VendorSummary,
  VendorListItem,
  VendorDetail,
  CreateVendorInput,
  UpdateVendorInput,
  CreateVendorQuoteInput,
  UpdateVendorQuoteInput,
  CreateVendorPaymentInput,
  UpdateVendorPaymentInput,
} from "@kaiplan/shared";

export function useVendorSummary(weddingId: string | null) {
  return useQuery<VendorSummary>({
    queryKey: ["vendor-summary", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/vendors/summary`),
    enabled: !!weddingId,
  });
}

export function useVendors(weddingId: string | null) {
  return useQuery<VendorListItem[]>({
    queryKey: ["vendors", weddingId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/vendors`),
    enabled: !!weddingId,
  });
}

export function useVendorDetail(
  weddingId: string | null,
  vendorId: string | null,
) {
  return useQuery<VendorDetail>({
    queryKey: ["vendor-detail", weddingId, vendorId],
    queryFn: () => apiFetch(`/api/weddings/${weddingId}/vendors/${vendorId}`),
    enabled: !!weddingId && !!vendorId,
  });
}

function invalidateVendorQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  weddingId: string,
  vendorId?: string,
) {
  void queryClient.invalidateQueries({
    queryKey: ["vendor-summary", weddingId],
  });
  void queryClient.invalidateQueries({ queryKey: ["vendors", weddingId] });
  void queryClient.invalidateQueries({
    queryKey: ["budget-summary", weddingId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["budget-categories", weddingId],
  });
  if (vendorId) {
    void queryClient.invalidateQueries({
      queryKey: ["vendor-detail", weddingId, vendorId],
    });
  }
}

function requireId(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required`);
  }
}

export function useCreateVendor(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Partial<CreateVendorInput> & Record<string, unknown>,
    ) => {
      requireId(weddingId, "Wedding ID");
      return apiFetch(`/api/weddings/${weddingId}/vendors`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => invalidateVendorQueries(queryClient, weddingId),
  });
}

export function useUpdateVendor(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      vendorId,
      data,
    }: {
      vendorId: string;
      data: Partial<UpdateVendorInput> & Record<string, unknown>;
    }) => {
      requireId(weddingId, "Wedding ID");
      requireId(vendorId, "Vendor ID");
      return apiFetch(`/api/weddings/${weddingId}/vendors/${vendorId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_, { vendorId }) =>
      invalidateVendorQueries(queryClient, weddingId, vendorId),
  });
}

export function useDeleteVendor(weddingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vendorId: string) => {
      requireId(weddingId, "Wedding ID");
      requireId(vendorId, "Vendor ID");
      return apiFetch(`/api/weddings/${weddingId}/vendors/${vendorId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => invalidateVendorQueries(queryClient, weddingId),
  });
}

export function useCreateVendorQuote(weddingId: string, vendorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Partial<CreateVendorQuoteInput> & Record<string, unknown>,
    ) => {
      requireId(weddingId, "Wedding ID");
      requireId(vendorId, "Vendor ID");
      return apiFetch(`/api/weddings/${weddingId}/vendors/${vendorId}/quotes`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => invalidateVendorQueries(queryClient, weddingId, vendorId),
  });
}

export function useUpdateVendorQuote(weddingId: string, vendorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      quoteId,
      data,
    }: {
      quoteId: string;
      data: Partial<UpdateVendorQuoteInput> & Record<string, unknown>;
    }) => {
      requireId(weddingId, "Wedding ID");
      requireId(vendorId, "Vendor ID");
      requireId(quoteId, "Quote ID");
      return apiFetch(
        `/api/weddings/${weddingId}/vendors/${vendorId}/quotes/${quoteId}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      );
    },
    onSuccess: () => invalidateVendorQueries(queryClient, weddingId, vendorId),
  });
}

export function useDeleteVendorQuote(weddingId: string, vendorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quoteId: string) => {
      requireId(weddingId, "Wedding ID");
      requireId(vendorId, "Vendor ID");
      requireId(quoteId, "Quote ID");
      return apiFetch(
        `/api/weddings/${weddingId}/vendors/${vendorId}/quotes/${quoteId}`,
        {
          method: "DELETE",
        },
      );
    },
    onSuccess: () => invalidateVendorQueries(queryClient, weddingId, vendorId),
  });
}

export function useCreateVendorPayment(
  weddingId: string,
  vendorId: string,
  quoteId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      data: Partial<CreateVendorPaymentInput> & Record<string, unknown>,
    ) => {
      requireId(weddingId, "Wedding ID");
      requireId(vendorId, "Vendor ID");
      requireId(quoteId, "Quote ID");
      return apiFetch(
        `/api/weddings/${weddingId}/vendors/${vendorId}/quotes/${quoteId}/payments`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
    },
    onSuccess: () => invalidateVendorQueries(queryClient, weddingId, vendorId),
  });
}

export function useUpdateVendorPayment(
  weddingId: string,
  vendorId: string,
  quoteId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      paymentId,
      data,
    }: {
      paymentId: string;
      data: Partial<UpdateVendorPaymentInput> & Record<string, unknown>;
    }) => {
      requireId(weddingId, "Wedding ID");
      requireId(vendorId, "Vendor ID");
      requireId(quoteId, "Quote ID");
      requireId(paymentId, "Payment ID");
      return apiFetch(
        `/api/weddings/${weddingId}/vendors/${vendorId}/quotes/${quoteId}/payments/${paymentId}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      );
    },
    onSuccess: () => invalidateVendorQueries(queryClient, weddingId, vendorId),
  });
}

export function useDeleteVendorPayment(
  weddingId: string,
  vendorId: string,
  quoteId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (paymentId: string) => {
      requireId(weddingId, "Wedding ID");
      requireId(vendorId, "Vendor ID");
      requireId(quoteId, "Quote ID");
      requireId(paymentId, "Payment ID");
      return apiFetch(
        `/api/weddings/${weddingId}/vendors/${vendorId}/quotes/${quoteId}/payments/${paymentId}`,
        {
          method: "DELETE",
        },
      );
    },
    onSuccess: () => invalidateVendorQueries(queryClient, weddingId, vendorId),
  });
}
