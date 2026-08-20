import { BILLING_PLAN_LABELS, type PricingTier } from "./constants";

type PlanPrice = {
  plan: PricingTier;
  name: string;
  price: string;
  annualPrice?: string;
  monthlyPriceCents?: number;
  annualPriceCents?: number;
  oneTimePriceCents?: number;
  pricingModel: "subscription" | "one-time";
};

export const PLAN_PRICING = {
  starter: {
    plan: "starter",
    name: BILLING_PLAN_LABELS.starter,
    price: "$20/mo",
    annualPrice: "$200/yr",
    monthlyPriceCents: 2000,
    annualPriceCents: 20000,
    pricingModel: "subscription",
  },
  pro: {
    plan: "pro",
    name: BILLING_PLAN_LABELS.pro,
    price: "$35/mo",
    annualPrice: "$350/yr",
    monthlyPriceCents: 3500,
    annualPriceCents: 35000,
    pricingModel: "subscription",
  },
  lifetime: {
    plan: "lifetime",
    name: BILLING_PLAN_LABELS.lifetime,
    price: "$100 once",
    annualPrice: undefined,
    monthlyPriceCents: undefined,
    annualPriceCents: undefined,
    oneTimePriceCents: 10000,
    pricingModel: "one-time",
  },
} as const satisfies Record<PricingTier, PlanPrice>;

export function getPlanPricing(plan: PricingTier): PlanPrice {
  return PLAN_PRICING[plan];
}
