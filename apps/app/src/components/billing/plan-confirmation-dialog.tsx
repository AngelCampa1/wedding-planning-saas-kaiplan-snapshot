import { useState } from "react";
import {
  BILLING_INTERVAL_LABELS,
  BILLING_INTERVALS,
  BILLING_PLAN_FEATURES,
  BILLING_PLAN_LABELS,
  type BillingFeature,
  type BillingInterval,
} from "@kaiplan/shared";
import type { BillingSummary } from "@kaiplan/shared";
import { kaiplanOffering } from "@kaiplan/knowledge";
import type { PaidBillingPlan } from "../../lib/plan-handoff";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { FEATURE_LABELS, getFeaturePlanLabel } from "../../lib/billing-labels";

interface PlanConfirmationDialogProps {
  plan: PaidBillingPlan;
  summary: BillingSummary;
  initialInterval?: BillingInterval;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckout: (
    plan: PaidBillingPlan,
    interval: BillingInterval,
  ) => Promise<void>;
  onStayOnPro: () => void;
  isCheckingOut: boolean;
}

export function computeLostFeatures(
  plan: PaidBillingPlan,
  featuresUsed: BillingFeature[],
): BillingFeature[] {
  const planFeatures = BILLING_PLAN_FEATURES[plan] as BillingFeature[];
  return featuresUsed.filter((f) => !planFeatures.includes(f));
}

export function PlanConfirmationDialog({
  plan,
  summary,
  initialInterval = "year",
  open,
  onOpenChange,
  onCheckout,
  onStayOnPro,
  isCheckingOut,
}: PlanConfirmationDialogProps) {
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);

  const planFeatures = BILLING_PLAN_FEATURES[plan] as BillingFeature[];
  const lostFeatures = computeLostFeatures(plan, summary.featuresUsed);
  const hasLostFeatures = lostFeatures.length > 0;

  const {
    name: title,
    price,
    cadence,
    shortDescription,
  } = kaiplanOffering.plans[plan];

  function handleCheckout() {
    void onCheckout(plan, plan === "lifetime" ? "month" : interval);
  }

  function handleStayOnPro() {
    onStayOnPro();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">
            You&apos;re choosing {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{price}</span>{" "}
            &middot; {cadence}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
              What you get
            </p>
            {planFeatures.length > 0 ? (
              <ul className="mt-3 space-y-2">
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
              <p className="mt-3 text-sm text-foreground">{shortDescription}</p>
            )}
          </div>

          {hasLostFeatures ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-destructive">
                What you&apos;ll lose
              </p>
              <ul className="mt-3 space-y-2">
                {lostFeatures.map((feature) => (
                  <li key={feature} className="text-sm text-foreground">
                    {`${FEATURE_LABELS[feature]} — only on ${getFeaturePlanLabel(feature)}`}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan !== "lifetime" ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                Billing interval
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1">
                {BILLING_INTERVALS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setInterval(option)}
                    className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                      interval === option
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    {BILLING_INTERVAL_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {hasLostFeatures ? (
            <>
              <Button
                onClick={handleStayOnPro}
                disabled={isCheckingOut}
                className="w-full"
              >
                Stay on {BILLING_PLAN_LABELS.pro} instead
              </Button>
              <button
                type="button"
                onClick={handleCheckout}
                disabled={isCheckingOut}
                className="w-full py-2 text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              >
                {isCheckingOut
                  ? "Opening checkout..."
                  : `Continue to ${title} anyway`}
              </button>
            </>
          ) : (
            <Button
              onClick={handleCheckout}
              disabled={isCheckingOut}
              className="w-full"
            >
              {isCheckingOut ? "Opening checkout..." : "Continue to checkout"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
