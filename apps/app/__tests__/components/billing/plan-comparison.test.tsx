import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PlanComparison,
  computePlanBadge,
} from "../../../src/components/billing/plan-comparison";
import {
  BILLING_FEATURE_LABELS,
  BILLING_PLAN_LABELS,
  type BillingSummary,
} from "@kaiplan/shared";
import { kaiplanOffering } from "@kaiplan/knowledge";
import type { PaidBillingPlan } from "../../../src/lib/plan-handoff";

// PlanConfirmationDialog uses Radix UI Dialog which needs proper portal support.
// Mock it to a simple passthrough so we can test interactions without Radix portal issues.
vi.mock("../../../src/components/billing/plan-confirmation-dialog", () => ({
  PlanConfirmationDialog: ({
    plan,
    open,
    onOpenChange,
    onCheckout,
    initialInterval,
    onStayOnPro,
    isCheckingOut,
  }: {
    plan: PaidBillingPlan;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCheckout: (
      plan: PaidBillingPlan,
      interval: "month" | "year",
    ) => Promise<void>;
    initialInterval: "month" | "year";
    onStayOnPro: () => void;
    isCheckingOut: boolean;
  }) =>
    open ? (
      <div
        data-testid="confirmation-dialog"
        data-plan={plan}
        data-initial-interval={initialInterval}
        data-checking-out={isCheckingOut}
      >
        <span>Dialog for {plan}</span>
        <button onClick={() => onOpenChange(false)}>Close</button>
        <button onClick={() => onOpenChange(true)}>Reopen</button>
        <button onClick={onStayOnPro}>Stay on Pro</button>
        <button onClick={() => void onCheckout(plan, "month")}>Checkout</button>
      </div>
    ) : null,
}));

function makeSummary(overrides?: Partial<BillingSummary>): BillingSummary {
  return {
    plan: "free",
    status: "inactive",
    stripeCustomerId: null,
    currentPeriodEnd: null,
    billingGateRequired: false,
    features: [],
    canManageBilling: false,
    trialDaysRemaining: null,
    featuresUsed: [],
    ...overrides,
  };
}

describe("computePlanBadge", () => {
  it('returns "Trial" badge when plan is "pro" and trialDaysRemaining > 0', () => {
    const summary = makeSummary({ trialDaysRemaining: 7 });
    const result = computePlanBadge("pro", summary);
    expect(result).not.toBeNull();
    expect(result?.label).toBe("Trial");
    expect(result?.variant).toBe("default");
  });

  it('returns "Trial" badge when plan is "pro" and trialDaysRemaining is 0', () => {
    const summary = makeSummary({ trialDaysRemaining: 0 });
    const result = computePlanBadge("pro", summary);
    expect(result).not.toBeNull();
    expect(result?.label).toBe("Trial");
  });

  it('does not return "Trial" badge for non-pro plans even when trialDaysRemaining > 0', () => {
    const summary = makeSummary({ trialDaysRemaining: 7 });
    const starterBadge = computePlanBadge("starter", summary);
    const lifetimeBadge = computePlanBadge("lifetime", summary);
    // They're not "Trial" (but may be "Current" if plan matches active)
    expect(starterBadge?.label).not.toBe("Trial");
    expect(lifetimeBadge?.label).not.toBe("Trial");
  });

  it('returns "Current" badge when plan matches summary.plan and status is active', () => {
    const summary = makeSummary({
      plan: "starter",
      status: "active",
      trialDaysRemaining: null,
    });
    const result = computePlanBadge("starter", summary);
    expect(result).not.toBeNull();
    expect(result?.label).toBe("Current");
    expect(result?.variant).toBe("neutral");
  });

  it('returns "Current" badge for pro plan when active and no trial', () => {
    const summary = makeSummary({
      plan: "pro",
      status: "active",
      trialDaysRemaining: null,
    });
    const result = computePlanBadge("pro", summary);
    expect(result).not.toBeNull();
    expect(result?.label).toBe("Current");
  });

  it("returns null when plan does not match summary.plan", () => {
    const summary = makeSummary({
      plan: "starter",
      status: "active",
      trialDaysRemaining: null,
    });
    const result = computePlanBadge("pro", summary);
    expect(result).toBeNull();
  });

  it("returns null when plan matches but status is not active", () => {
    const summary = makeSummary({
      plan: "starter",
      status: "inactive",
      trialDaysRemaining: null,
    });
    const result = computePlanBadge("starter", summary);
    expect(result).toBeNull();
  });

  it("returns null when trialDaysRemaining is null and plan does not match", () => {
    const summary = makeSummary({
      plan: "free",
      status: "inactive",
      trialDaysRemaining: null,
    });
    const result = computePlanBadge("pro", summary);
    expect(result).toBeNull();
  });

  it("Trial badge takes priority over Current for pro when trialDaysRemaining is not null", () => {
    // Even if plan is "pro" and status is "active", if trialDaysRemaining is set we show "Trial"
    const summary = makeSummary({
      plan: "pro",
      status: "active",
      trialDaysRemaining: 5,
    });
    const result = computePlanBadge("pro", summary);
    expect(result?.label).toBe("Trial");
  });
});

describe("PlanComparison", () => {
  const defaultSummary = makeSummary();
  const onCheckout = vi.fn().mockResolvedValue(undefined);
  const chooseStarterLabel = `Choose ${BILLING_PLAN_LABELS.starter}`;
  const chooseProLabel = `Choose ${BILLING_PLAN_LABELS.pro}`;
  const chooseLifetimeLabel = `Choose ${BILLING_PLAN_LABELS.lifetime}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders three plan cards: Starter, Pro, and Lifetime", () => {
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(screen.getByText(BILLING_PLAN_LABELS.starter)).toBeInTheDocument();
    expect(screen.getByText(BILLING_PLAN_LABELS.pro)).toBeInTheDocument();
    expect(screen.getByText(BILLING_PLAN_LABELS.lifetime)).toBeInTheDocument();
  });

  it("renders a Choose button for each plan", () => {
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: chooseStarterLabel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: chooseProLabel }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: chooseLifetimeLabel }),
    ).toBeInTheDocument();
  });

  it("opens the confirmation dialog for Pro when Choose Pro is clicked", async () => {
    const user = userEvent.setup();
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: chooseProLabel }));

    const dialog = screen.getByTestId("confirmation-dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-plan", "pro");
  });

  it("opens the confirmation dialog for Starter when Choose Starter is clicked", async () => {
    const user = userEvent.setup();
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: chooseStarterLabel }));

    const dialog = screen.getByTestId("confirmation-dialog");
    expect(dialog).toHaveAttribute("data-plan", "starter");
  });

  it("opens the confirmation dialog for Lifetime when Choose Lifetime is clicked", async () => {
    const user = userEvent.setup();
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: chooseLifetimeLabel }));

    const dialog = screen.getByTestId("confirmation-dialog");
    expect(dialog).toHaveAttribute("data-plan", "lifetime");
  });

  it("opens the initial plan from route handoff with the default interval", () => {
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
        initialPlan="pro"
        defaultInterval="year"
      />,
    );

    const dialog = screen.getByTestId("confirmation-dialog");
    expect(dialog).toHaveAttribute("data-plan", "pro");
    expect(dialog).toHaveAttribute("data-initial-interval", "year");
  });

  it("closes the dialog when onOpenChange(false) is called", async () => {
    const user = userEvent.setup();
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: chooseProLabel }));
    expect(screen.getByTestId("confirmation-dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("confirmation-dialog")).not.toBeInTheDocument();
  });

  it("closes the dialog and clears plan when Stay on Pro is clicked", async () => {
    const user = userEvent.setup();
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: chooseProLabel }));
    expect(screen.getByTestId("confirmation-dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Stay on Pro" }));
    expect(screen.queryByTestId("confirmation-dialog")).not.toBeInTheDocument();
  });

  it("passes isCheckingOut=true to buttons so they become disabled", () => {
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={true}
      />,
    );

    expect(
      screen.getByRole("button", { name: chooseStarterLabel }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: chooseProLabel })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: chooseLifetimeLabel }),
    ).toBeDisabled();
  });

  it("passes isCheckingOut=false so buttons are enabled", () => {
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(
      screen.getByRole("button", { name: chooseStarterLabel }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: chooseProLabel }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: chooseLifetimeLabel }),
    ).not.toBeDisabled();
  });

  it("keeps the dialog open when onOpenChange is called with true (open=true branch)", async () => {
    const user = userEvent.setup();
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: chooseProLabel }));
    expect(screen.getByTestId("confirmation-dialog")).toBeInTheDocument();

    // Calling onOpenChange(true) should keep the dialog open and NOT clear selectedPlan.
    // This exercises the `if (!open)` false branch in handleDialogClose.
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.getByTestId("confirmation-dialog")).toBeInTheDocument();
  });

  it("renders Trial badge on Pro card when trialDaysRemaining > 0", () => {
    const summary = makeSummary({ trialDaysRemaining: 7 });
    render(
      <PlanComparison
        summary={summary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(screen.getByText("Trial")).toBeInTheDocument();
  });

  it("renders Current badge when user is on starter and active", () => {
    const summary = makeSummary({
      plan: "starter",
      status: "active",
      trialDaysRemaining: null,
    });
    render(
      <PlanComparison
        summary={summary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("renders no badge for plans that do not match the current plan", () => {
    const summary = makeSummary({
      plan: "free",
      status: "inactive",
      trialDaysRemaining: null,
    });
    render(
      <PlanComparison
        summary={summary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(screen.queryByText("Current")).not.toBeInTheDocument();
    expect(screen.queryByText("Trial")).not.toBeInTheDocument();
  });

  it("renders pro plan features list (vendors, extraPlanner, weddingWebsite)", () => {
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(screen.getAllByText(BILLING_FEATURE_LABELS.vendors)).toHaveLength(2);
    expect(
      screen.getAllByText(BILLING_FEATURE_LABELS.extraPlanner),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(BILLING_FEATURE_LABELS.weddingWebsite),
    ).toHaveLength(2);
  });

  it("renders core feature description for Starter (no premium features)", () => {
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(
      screen.getByText(kaiplanOffering.plans.starter.shortDescription),
    ).toBeInTheDocument();
  });

  it("renders standard prices without launch badges", () => {
    render(
      <PlanComparison
        summary={defaultSummary}
        onCheckout={onCheckout}
        isCheckingOut={false}
      />,
    );

    expect(
      screen.getByText(kaiplanOffering.plans.starter.price),
    ).toBeInTheDocument();
    expect(
      screen.getByText(kaiplanOffering.plans.pro.price),
    ).toBeInTheDocument();
    expect(
      screen.getByText(kaiplanOffering.plans.lifetime.price),
    ).toBeInTheDocument();
    expect(screen.queryByText(/LAUNCH/i)).not.toBeInTheDocument();
  });
});
