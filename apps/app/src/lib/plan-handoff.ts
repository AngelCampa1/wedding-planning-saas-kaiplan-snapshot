import {
  BILLING_INTERVALS,
  PRICING_TIERS,
  type BillingInterval,
  type BillingPlan,
} from "@kaiplan/shared";

export type PaidBillingPlan = Exclude<BillingPlan, "free">;
export type CheckoutStatus = "success" | "cancel";

const checkoutStatuses = [
  "success",
  "cancel",
] as const satisfies readonly CheckoutStatus[];

export interface PlanSearch {
  plan?: PaidBillingPlan;
  interval?: BillingInterval;
  checkout?: CheckoutStatus;
}

export function isPaidBillingPlan(value: unknown): value is PaidBillingPlan {
  return (
    typeof value === "string" &&
    PRICING_TIERS.includes(value as PaidBillingPlan)
  );
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return (
    typeof value === "string" &&
    BILLING_INTERVALS.includes(value as BillingInterval)
  );
}

export function isCheckoutStatus(value: unknown): value is CheckoutStatus {
  return (
    typeof value === "string" &&
    checkoutStatuses.includes(value as CheckoutStatus)
  );
}

export function readPlanSearch(
  search:
    | { plan?: unknown; interval?: unknown; checkout?: unknown }
    | undefined,
): PlanSearch {
  if (!search) {
    return {};
  }

  const nextSearch: PlanSearch = {};

  if (isPaidBillingPlan(search.plan)) {
    nextSearch.plan = search.plan;
  }

  if (isBillingInterval(search.interval)) {
    nextSearch.interval = search.interval;
  }

  if (isCheckoutStatus(search.checkout)) {
    nextSearch.checkout = search.checkout;
  }

  return nextSearch;
}

export function buildPlanSearch(
  plan: PaidBillingPlan | undefined,
  interval?: BillingInterval,
): PlanSearch | undefined {
  if (!plan) {
    return undefined;
  }
  return interval ? { plan, interval } : { plan };
}

export function buildPathWithPlan(
  path: string,
  plan: PaidBillingPlan | undefined,
  interval?: BillingInterval,
): string {
  if (!plan) {
    return path;
  }

  const params: Record<string, string> = { plan };
  if (interval) {
    params.interval = interval;
  }
  const searchParams = new URLSearchParams(params);
  return `${path}?${searchParams.toString()}`;
}
