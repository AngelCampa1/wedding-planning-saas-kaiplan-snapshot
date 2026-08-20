import { kaiplanPricingFacts } from "@kaiplan/knowledge/marketing";

const { plans: PLAN_PRICING } = kaiplanPricingFacts;

export interface ComparisonRow {
  feature: string;
  values: string[];
}

export const ALTERNATIVE_ONBOARDING_COPY = {
  competitor: "Vendor-first experience",
  kaiplan: "Ready in minutes",
} as const;

export const ALTERNATIVE_CONTRACT_COPY = {
  competitor: "Annual contract",
  kaiplan: `From ${PLAN_PRICING.starter.price} or ${PLAN_PRICING.lifetime.price}`,
} as const;

export const ALTERNATIVE_FOCUS_COPY = {
  competitor: "Ad-supported platform",
  kaiplan: "Built for couples",
} as const;

export const COMPARISON_SETUP_COPY = {
  competitorA: "Complex setup",
  competitorB: "Moderate setup",
  kaiplan: "Ready in minutes",
} as const;

export function buildAlternativeRows(
  competitorName: string,
  competitorPricing: string,
  kaiplanPricing: string,
): ComparisonRow[] {
  return [
    { feature: "Price", values: [competitorPricing, kaiplanPricing] },
    { feature: "Product", values: [competitorName, "Kaiplan"] },
    {
      feature: "Onboarding",
      values: [
        ALTERNATIVE_ONBOARDING_COPY.competitor,
        ALTERNATIVE_ONBOARDING_COPY.kaiplan,
      ],
    },
    {
      feature: "Contract",
      values: [
        ALTERNATIVE_CONTRACT_COPY.competitor,
        ALTERNATIVE_CONTRACT_COPY.kaiplan,
      ],
    },
    {
      feature: "Focus",
      values: [
        ALTERNATIVE_FOCUS_COPY.competitor,
        ALTERNATIVE_FOCUS_COPY.kaiplan,
      ],
    },
  ];
}

export function buildComparisonRows(
  competitorAName: string,
  competitorAPricing: string,
  competitorBName: string,
  competitorBPricing: string,
  kaiplanPricing: string,
): ComparisonRow[] {
  return [
    {
      feature: "Price",
      values: [competitorAPricing, competitorBPricing, kaiplanPricing],
    },
    {
      feature: "Product",
      values: [competitorAName, competitorBName, "Kaiplan"],
    },
    {
      feature: "Setup",
      values: [
        COMPARISON_SETUP_COPY.competitorA,
        COMPARISON_SETUP_COPY.competitorB,
        COMPARISON_SETUP_COPY.kaiplan,
      ],
    },
  ];
}
