import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import {
  billingSummarySchema,
  billingHistoryResponseSchema,
  type BillingHistoryResponse,
  type BillingSummary,
  type CheckoutSessionResponse,
  type CreateCheckoutSessionInput,
} from "@kaiplan/shared";

export function useBillingSummary() {
  return useQuery<BillingSummary>({
    queryKey: ["billing-summary"],
    queryFn: () => apiFetch("/api/billing", { schema: billingSummarySchema }),
  });
}

export function useBillingHistory() {
  return useQuery<BillingHistoryResponse>({
    queryKey: ["billing-history"],
    queryFn: () =>
      apiFetch("/api/billing/history", {
        schema: billingHistoryResponseSchema,
      }),
  });
}

export function useBillingCheckout() {
  const queryClient = useQueryClient();
  return useMutation<
    CheckoutSessionResponse,
    Error,
    CreateCheckoutSessionInput
  >({
    mutationFn: (data) =>
      apiFetch("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-history"] });
    },
  });
}

export function useBillingPortal() {
  const queryClient = useQueryClient();
  return useMutation<
    CheckoutSessionResponse,
    Error,
    { returnTarget?: "settings" | "subscribe" } | void
  >({
    mutationFn: (data) =>
      apiFetch("/api/billing/portal", {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["billing-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["billing-history"] });
    },
  });
}
