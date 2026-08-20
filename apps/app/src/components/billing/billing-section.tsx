import type {
  BillingHistoryResponse,
  BillingPlan,
  BillingSummary,
} from "@kaiplan/shared";
import { BILLING_PLAN_LABELS } from "@kaiplan/shared";
import { LIFETIME_PLAN_HINT, TRIAL_PLAN_HINT } from "../../lib/billing-copy";
import { FEATURE_LABELS } from "../../lib/billing-labels";
import { formatMoney } from "../../lib/format-money";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Separator } from "../ui/separator";

interface BillingSectionProps {
  summary?: BillingSummary;
  history?: BillingHistoryResponse;
  isLoading: boolean;
  nextPlan: BillingPlan | null;
  onUpgrade: (plan: BillingPlan) => void;
  onManageBilling: () => void;
  isUpgrading: boolean;
  isManaging: boolean;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function resolveFeatureLabel(feature: string) {
  return feature in FEATURE_LABELS
    ? FEATURE_LABELS[feature as keyof typeof FEATURE_LABELS]
    : feature;
}

function formatStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getPeriodLabel(status: string) {
  return status === "active" || status === "trialing"
    ? "Next renewal"
    : "Expiration";
}

export function BillingSection({
  summary,
  history,
  isLoading,
  nextPlan,
  onUpgrade,
  onManageBilling,
  isUpgrading,
  isManaging,
}: BillingSectionProps) {
  if (isLoading) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Billing
        </h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Card>
            <CardContent>
              <div className="h-6 w-40 animate-pulse rounded bg-muted/20" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-32 animate-pulse rounded bg-muted/20" />
                <div className="h-4 w-48 animate-pulse rounded bg-muted/20" />
                <div className="h-4 w-28 animate-pulse rounded bg-muted/20" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="h-6 w-40 animate-pulse rounded bg-muted/20" />
              <div className="mt-4 space-y-3">
                <div className="h-4 w-full animate-pulse rounded bg-muted/20" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-muted/20" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted/20" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Billing
        </h2>
        <Card>
          <CardContent>
            <p className="text-sm text-muted">
              Billing details are unavailable.
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const paymentHistory = history?.items ?? [];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Billing
      </h2>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="gap-0">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-base">Subscription</CardTitle>
            <CardDescription>
              Manage your plan, status, and renewal details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted">Current plan</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {BILLING_PLAN_LABELS[summary.plan]}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Billing status</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatStatus(summary.status)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">
                  {getPeriodLabel(summary.status)}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {formatDate(summary.currentPeriodEnd)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Customer id</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {summary.stripeCustomerId ?? "Not connected"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted">Included features</p>
              {summary.features.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {summary.features.map((feature) => (
                    <Badge key={feature} variant="neutral">
                      {resolveFeatureLabel(feature)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted">No paid features yet.</p>
              )}
            </div>

            <Separator />

            <div className="flex flex-wrap gap-3">
              {nextPlan && (
                <div className="flex flex-col gap-1">
                  <Button
                    onClick={() => onUpgrade(nextPlan)}
                    disabled={isUpgrading}
                  >
                    {isUpgrading
                      ? "Starting checkout..."
                      : `Upgrade to ${BILLING_PLAN_LABELS[nextPlan]}`}
                  </Button>
                  <p className="text-xs text-muted">
                    {nextPlan === "lifetime"
                      ? LIFETIME_PLAN_HINT
                      : TRIAL_PLAN_HINT}
                  </p>
                </div>
              )}
              {summary.canManageBilling && (
                <Button
                  variant="outline"
                  onClick={onManageBilling}
                  disabled={isManaging}
                >
                  {isManaging ? "Opening portal..." : "Manage billing"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-base">Payment history</CardTitle>
            <CardDescription>
              Recent invoices and payment events from Stripe.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            {paymentHistory.length === 0 ? (
              <p className="text-sm text-muted">No payment history yet.</p>
            ) : (
              <div className="space-y-4">
                {paymentHistory.map((item, index) => (
                  <div key={item.id}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {item.type === "invoice"
                            ? `Invoice ${item.id}`
                            : `Payment intent ${item.id}`}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDate(item.createdAt)} -{" "}
                          {formatStatus(item.status)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {formatMoney(
                          item.amountCents,
                          item.currency.toUpperCase(),
                        )}
                      </p>
                    </div>
                    {item.hostedUrl ? (
                      <a
                        href={item.hostedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                      >
                        View receipt
                      </a>
                    ) : null}
                    {index < paymentHistory.length - 1 ? (
                      <Separator className="mt-4" />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
