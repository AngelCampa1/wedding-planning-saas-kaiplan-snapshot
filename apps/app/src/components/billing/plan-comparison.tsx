import { useState } from "react";
import {
  BILLING_PLAN_FEATURES,
  PRICING_TIERS,
  type BillingFeature,
  type BillingInterval,
} from "@kaiplan/shared";
import type { BillingSummary } from "@kaiplan/shared";
import { kaiplanOffering } from "@kaiplan/knowledge";
import type { PaidBillingPlan } from "../../lib/plan-handoff";
import { Badge } from "../ui/badge";
import { PlanConfirmationDialog } from "./plan-confirmation-dialog";
import { FEATURE_LABELS } from "../../lib/billing-labels";

interface PlanComparisonProps {
  summary: BillingSummary;
  onCheckout: (
    plan: PaidBillingPlan,
    interval: BillingInterval,
  ) => Promise<void>;
  isCheckingOut: boolean;
  initialPlan?: PaidBillingPlan;
  defaultInterval?: BillingInterval;
}

type PlanCardDef = {
  plan: PaidBillingPlan;
  title: string;
  price: string;
  description: string;
  ctaText: string;
};

const PAID_PLANS: PaidBillingPlan[] = [...PRICING_TIERS];

const PLAN_CARDS: PlanCardDef[] = PAID_PLANS.map((plan) => ({
  plan,
  title: kaiplanOffering.plans[plan].name,
  price: kaiplanOffering.plans[plan].price,
  description: kaiplanOffering.plans[plan].shortDescription,
  ctaText: kaiplanOffering.plans[plan].ctaTextApp,
}));

export function computePlanBadge(
  plan: PaidBillingPlan,
  summary: BillingSummary,
): { label: string; variant: "default" | "secondary" | "neutral" } | null {
  if (summary.trialDaysRemaining !== null && plan === "pro") {
    return { label: "Trial", variant: "default" };
  }

  if (summary.plan === plan && summary.status === "active") {
    return { label: "Current", variant: "neutral" };
  }

  return null;
}

export function PlanComparison({
  summary,
  onCheckout,
  isCheckingOut,
  initialPlan,
  defaultInterval = "year",
}: PlanComparisonProps) {
  const [selectedPlan, setSelectedPlan] = useState<PaidBillingPlan | null>(
    initialPlan ?? null,
  );
  const [dialogOpen, setDialogOpen] = useState(Boolean(initialPlan));

  function handleChoosePlan(plan: PaidBillingPlan) {
    setSelectedPlan(plan);
    setDialogOpen(true);
  }

  function handleDialogClose(open: boolean) {
    setDialogOpen(open);
    if (!open) {
      setSelectedPlan(null);
    }
  }

  function handleStayOnPro() {
    setDialogOpen(false);
    setSelectedPlan(null);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {PLAN_CARDS.map((card) => {
          const badge = computePlanBadge(card.plan, summary);
          const planFeatures = BILLING_PLAN_FEATURES[
            card.plan
          ] as BillingFeature[];

          return (
            <div
              key={card.plan}
              className="rounded-3xl border border-border bg-background p-6 shadow-sm flex flex-col"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-heading text-4xl text-foreground">
                    <span>{card.price}</span>
                  </p>
                </div>
                {badge ? (
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                ) : null}
              </div>

              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {card.description}
              </p>

              {planFeatures.length > 0 ? (
                <ul className="mt-4 space-y-2 flex-1">
                  {planFeatures.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <span className="mt-0.5 text-primary" aria-hidden="true">
                        &#10003;
                      </span>
                      {FEATURE_LABELS[feature]}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm leading-6 text-foreground flex-1">
                  Budget, guests, checklist, seating
                </p>
              )}

              <button
                type="button"
                onClick={() => handleChoosePlan(card.plan)}
                disabled={isCheckingOut}
                className="mt-6 w-full rounded-full bg-foreground px-4 py-3 text-sm font-medium text-background transition hover:bg-foreground/90 disabled:opacity-50"
              >
                {card.ctaText}
              </button>
            </div>
          );
        })}
      </div>

      {selectedPlan ? (
        <PlanConfirmationDialog
          plan={selectedPlan}
          summary={summary}
          initialInterval={defaultInterval}
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          onCheckout={onCheckout}
          onStayOnPro={handleStayOnPro}
          isCheckingOut={isCheckingOut}
        />
      ) : null}
    </>
  );
}
