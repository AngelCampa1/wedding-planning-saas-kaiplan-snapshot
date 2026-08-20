import {
  BILLING_FEATURE_LABELS,
  BILLING_PLAN_FEATURES,
  BILLING_PLAN_LABELS,
  PRICING_TIERS,
  type BillingFeature,
} from "@kaiplan/shared";

export const FEATURE_LABELS: Record<BillingFeature, string> = {
  vendors: BILLING_FEATURE_LABELS.vendors,
  extraPlanner: BILLING_FEATURE_LABELS.extraPlanner,
  weddingWebsite: BILLING_FEATURE_LABELS.weddingWebsite,
};

function formatPlanLabelList(planLabels: string[]): string {
  if (planLabels.length <= 1) {
    return planLabels[0] ?? "";
  }

  return `${planLabels.slice(0, -1).join(", ")} or ${planLabels.at(-1)}`;
}

export const __billingLabelsTestExports = {
  formatPlanLabelList,
};

export function getFeaturePlanLabel(feature: BillingFeature): string {
  return formatPlanLabelList(
    PRICING_TIERS.filter((plan) =>
      BILLING_PLAN_FEATURES[plan].includes(feature),
    ).map((plan) => BILLING_PLAN_LABELS[plan]),
  );
}
