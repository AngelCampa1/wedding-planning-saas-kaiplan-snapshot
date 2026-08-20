import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  useBillingCheckout,
  useBillingPortal,
  useBillingSummary,
} from "../../hooks/use-billing";
import {
  type CheckoutStatus,
  type PaidBillingPlan,
} from "../../lib/plan-handoff";
import type { BillingInterval } from "@kaiplan/shared";
import { PlanComparison } from "../../components/billing/plan-comparison";

export const Route = createFileRoute("/_authenticated/subscribe")({
  validateSearch: (search: { checkout?: unknown }) => {
    const checkout =
      search.checkout === "success" || search.checkout === "cancel"
        ? (search.checkout as CheckoutStatus)
        : undefined;
    return { checkout };
  },
  component: SubscribePage,
});

function getBannerCopy(status: CheckoutStatus) {
  if (status === "cancel") {
    return {
      title: "Checkout canceled.",
      body: "Nothing changed. You can reopen checkout whenever you're ready.",
    };
  }

  return {
    title: "Checkout completed.",
    body: "We're confirming your billing status with Stripe now.",
  };
}

export function SubscribePage() {
  const navigate = Route.useNavigate();
  const { checkout } = Route.useSearch();
  const billingSummaryQuery = useBillingSummary();
  const billingCheckout = useBillingCheckout();
  const billingPortal = useBillingPortal();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);

  useEffect(() => {
    if (billingSummaryQuery.isLoading || billingSummaryQuery.isError) {
      return;
    }

    if (
      !billingSummaryQuery.data?.billingGateRequired &&
      billingSummaryQuery.data?.trialDaysRemaining === null
    ) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [
    billingSummaryQuery.data?.billingGateRequired,
    billingSummaryQuery.data?.trialDaysRemaining,
    billingSummaryQuery.isError,
    billingSummaryQuery.isLoading,
    navigate,
  ]);

  useEffect(() => {
    if (checkout !== "success") {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function poll(attempt: number): Promise<void> {
      if (cancelled) {
        return;
      }

      const result = await billingSummaryQuery.refetch();
      if (cancelled) {
        return;
      }

      if (result.error) {
        if (attempt >= 9) {
          return;
        }

        timeoutId = setTimeout(() => {
          void poll(attempt + 1);
        }, 2000);
        return;
      }

      if (!result.data?.billingGateRequired) {
        await navigate({ to: "/dashboard", replace: true });
        return;
      }

      if (attempt >= 9) {
        return;
      }

      timeoutId = setTimeout(() => {
        void poll(attempt + 1);
      }, 2000);
    }

    void poll(0);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [billingSummaryQuery, checkout, navigate]);

  async function handleCheckout(
    targetPlan: PaidBillingPlan,
    interval: BillingInterval,
  ) {
    setCheckoutError(null);

    try {
      const { url } = await billingCheckout.mutateAsync({
        plan: targetPlan,
        interval: targetPlan === "lifetime" ? "month" : interval,
      });

      if (!url) {
        throw new Error("We couldn't open checkout. Please try again.");
      }

      window.location.assign(url);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "We couldn't open checkout. Please try again.",
      );
    }
  }

  async function handleManageBilling() {
    setPortalError(null);
    try {
      const { url } = await billingPortal.mutateAsync({
        returnTarget: "subscribe",
      });

      if (!url) {
        throw new Error(
          "We couldn't open billing management. Please try again.",
        );
      }

      window.location.assign(url);
    } catch (error) {
      setPortalError(
        error instanceof Error
          ? error.message
          : "We couldn't open billing management. Please try again.",
      );
    }
  }

  if (billingSummaryQuery.isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </main>
    );
  }

  const summary = billingSummaryQuery.data;

  return (
    <main className="flex-1 overflow-y-auto bg-surface px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.32em] text-muted-foreground">
            Billing
          </p>
          <h1 className="font-heading text-4xl text-foreground">
            Choose your plan.
          </h1>
        </div>

        {checkout ? (
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-sm font-medium text-foreground">
              {getBannerCopy(checkout).title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {getBannerCopy(checkout).body}
            </p>
          </div>
        ) : null}

        {checkoutError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-foreground">
            {checkoutError}
          </div>
        ) : null}

        {billingSummaryQuery.isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-foreground">
              We couldn&apos;t verify your billing status.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Retry to continue. We keep billing verification in front of the
              paywall when the summary request fails.
            </p>
            <button
              type="button"
              onClick={() => {
                void billingSummaryQuery.refetch();
              }}
              className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:border-foreground"
            >
              Retry billing check
            </button>
          </div>
        ) : null}

        {summary ? (
          <PlanComparison
            summary={summary}
            onCheckout={handleCheckout}
            isCheckingOut={billingCheckout.isPending}
          />
        ) : null}

        {summary?.canManageBilling ? (
          <div>
            <button
              type="button"
              onClick={() => {
                void handleManageBilling();
              }}
              disabled={billingPortal.isPending || billingSummaryQuery.isError}
              className="rounded-full border border-border px-4 py-3 text-sm font-medium text-foreground transition hover:border-foreground disabled:opacity-50"
            >
              {billingPortal.isPending
                ? "Opening billing..."
                : "Manage billing"}
            </button>
            {portalError ? (
              <p className="mt-2 text-sm text-destructive">{portalError}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}
