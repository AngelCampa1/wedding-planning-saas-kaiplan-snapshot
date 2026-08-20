import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { getFeaturePlanLabel } from "../../lib/billing-labels";
import { TRIAL_PLAN_HINT } from "../../lib/billing-copy";
import { formatMoney } from "../../lib/format-money";
import { useBillingSummary } from "../../hooks/use-billing";
import { useVendorSummary } from "../../hooks/use-vendors";
import { Badge } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { WidgetLoadError } from "../dashboard/widget-load-error";

interface VendorWidgetProps {
  weddingId: string | null;
  showStartHere?: boolean;
}

export function VendorWidget({
  weddingId,
  showStartHere = false,
}: VendorWidgetProps) {
  const {
    data: billingSummary,
    isLoading: isBillingLoading,
    status: billingStatus,
  } = useBillingSummary();
  const hasResolvedPlan =
    (billingStatus === "success" || billingStatus === undefined) &&
    Boolean(billingSummary);
  const isLocked =
    hasResolvedPlan &&
    (billingSummary.features
      ? !billingSummary.features.includes("vendors")
      : billingSummary.plan === "free" || billingSummary.plan === "starter");
  const canLoadSummary = hasResolvedPlan && !isLocked;
  const vendorPlanLabel = getFeaturePlanLabel("vendors");
  const {
    data: summary,
    isLoading,
    error: summaryError,
  } = useVendorSummary(canLoadSummary ? weddingId : null);

  if (isBillingLoading || isLoading) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="h-32 animate-pulse rounded-lg bg-muted/20" />
        </CardContent>
      </Card>
    );
  }

  if (isLocked) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Vendors
            </h3>
            <Badge variant="neutral" className="uppercase tracking-wide">
              {vendorPlanLabel}
            </Badge>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted/20 text-muted">
              <Lock className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {`Unlock vendors with ${vendorPlanLabel}`}
              </p>
              <p className="text-sm text-muted">
                Track quotes, contracts, and payouts once you upgrade.
              </p>
              <p className="text-xs text-muted">{TRIAL_PLAN_HINT}</p>
            </div>
            <Link
              to="/settings"
              className="text-xs font-medium text-primary hover:underline"
            >
              View plans &rarr;
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (billingStatus === "error") {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Vendors
            </h3>
          </div>
          <WidgetLoadError title="Vendor access is temporarily unavailable" />
        </CardContent>
      </Card>
    );
  }

  if (summaryError) {
    return (
      <Card className="border-border/80">
        <CardContent>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Vendors
            </h3>
          </div>
          <WidgetLoadError title="Vendor summary is temporarily unavailable" />
        </CardContent>
      </Card>
    );
  }

  const isEmpty = !summary || summary.totalVendors === 0;

  if (isEmpty) {
    return (
      <Card className="border-border/80">
        <CardContent>
          {showStartHere && (
            <span className="mb-2 inline-block rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">
              Start here
            </span>
          )}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-sm font-semibold text-foreground">
              Vendors
            </h3>
          </div>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted">
              Track your venue, caterer, photographer, and more.
            </p>
            <Link
              to="/vendors"
              className="text-sm font-medium text-primary hover:underline"
            >
              Add vendor
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-sm font-semibold text-foreground">
            Vendors
          </h3>
          <Link
            to="/vendors"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <span className="text-xs text-muted">Tracked</span>
            <span className="text-sm font-semibold text-foreground">
              {summary.totalVendors}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Pending quotes</span>
            <span className="text-sm font-semibold text-foreground">
              {summary.pendingQuotes}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Signed contracts</span>
            <span className="text-sm font-semibold text-foreground">
              {summary.signedContracts}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted">Outstanding</span>
            <span className="text-sm font-semibold text-foreground">
              {formatMoney(summary.totalOutstandingCents)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
