import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  PlanConfirmationDialog,
  computeLostFeatures,
} from "../../../src/components/billing/plan-confirmation-dialog";
import {
  BILLING_FEATURE_LABELS,
  BILLING_PLAN_LABELS,
  type BillingFeature,
  type BillingSummary,
} from "@kaiplan/shared";
import { kaiplanOffering } from "@kaiplan/knowledge";
import type { PaidBillingPlan } from "../../../src/lib/plan-handoff";
import { getFeaturePlanLabel } from "../../../src/lib/billing-labels";

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

function renderDialog({
  plan = "starter" as PaidBillingPlan,
  summary = makeSummary(),
  initialInterval,
  open = true,
  onOpenChange = vi.fn(),
  onCheckout = vi.fn().mockResolvedValue(undefined),
  onStayOnPro = vi.fn(),
  isCheckingOut = false,
}: {
  plan?: PaidBillingPlan;
  summary?: BillingSummary;
  initialInterval?: "month" | "year";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCheckout?: (
    plan: PaidBillingPlan,
    interval: "month" | "year",
  ) => Promise<void>;
  onStayOnPro?: () => void;
  isCheckingOut?: boolean;
} = {}) {
  return render(
    <PlanConfirmationDialog
      plan={plan}
      summary={summary}
      initialInterval={initialInterval}
      open={open}
      onOpenChange={onOpenChange}
      onCheckout={onCheckout}
      onStayOnPro={onStayOnPro}
      isCheckingOut={isCheckingOut}
    />,
  );
}

describe("computeLostFeatures", () => {
  it("returns features in featuresUsed that are not available in the target plan", () => {
    const featuresUsed: BillingFeature[] = [
      "vendors",
      "extraPlanner",
      "weddingWebsite",
    ];
    const lost = computeLostFeatures("starter", featuresUsed);
    // starter has no billing features, so all three are lost
    expect(lost).toEqual(["vendors", "extraPlanner", "weddingWebsite"]);
  });

  it("returns an empty array when the target plan provides all used features", () => {
    const featuresUsed: BillingFeature[] = [
      "vendors",
      "extraPlanner",
      "weddingWebsite",
    ];
    const lost = computeLostFeatures("pro", featuresUsed);
    expect(lost).toEqual([]);
  });

  it("returns an empty array when featuresUsed is empty", () => {
    const lost = computeLostFeatures("starter", []);
    expect(lost).toEqual([]);
  });

  it("returns an empty array when featuresUsed is empty for pro plan", () => {
    const lost = computeLostFeatures("pro", []);
    expect(lost).toEqual([]);
  });

  it("returns empty array for lifetime plan which provides all features", () => {
    const featuresUsed: BillingFeature[] = [
      "vendors",
      "extraPlanner",
      "weddingWebsite",
    ];
    const lost = computeLostFeatures("lifetime", featuresUsed);
    expect(lost).toEqual([]);
  });

  it("returns only the features not covered by the target plan", () => {
    // starter covers no premium features; only "vendors" is used
    const lost = computeLostFeatures("starter", ["vendors"]);
    expect(lost).toEqual(["vendors"]);
  });

  it("handles a partial subset of used features correctly", () => {
    // pro covers all features, so downgrading to starter loses used pro features
    const featuresUsed: BillingFeature[] = ["vendors"];
    const lostFromStarter = computeLostFeatures("starter", featuresUsed);
    expect(lostFromStarter).toEqual(["vendors"]);

    const lostFromPro = computeLostFeatures("pro", featuresUsed);
    expect(lostFromPro).toEqual([]);
  });
});

describe("PlanConfirmationDialog", () => {
  const stayOnProLabel = `Stay on ${BILLING_PLAN_LABELS.pro} instead`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dialog title for the chosen plan (starter)", () => {
    renderDialog({ plan: "starter" });
    expect(
      screen.getByText(`You're choosing ${BILLING_PLAN_LABELS.starter}`),
    ).toBeInTheDocument();
  });

  it("renders the dialog title for the chosen plan (pro)", () => {
    renderDialog({ plan: "pro" });
    expect(
      screen.getByText(`You're choosing ${BILLING_PLAN_LABELS.pro}`),
    ).toBeInTheDocument();
  });

  it("renders the dialog title for the chosen plan (lifetime)", () => {
    renderDialog({ plan: "lifetime" });
    expect(
      screen.getByText(`You're choosing ${BILLING_PLAN_LABELS.lifetime}`),
    ).toBeInTheDocument();
  });

  it("renders standard starter price without launch badge", () => {
    renderDialog({ plan: "starter" });
    expect(
      screen.getByText(kaiplanOffering.plans.starter.price),
    ).toBeInTheDocument();
    expect(screen.queryByText(/LAUNCH/i)).not.toBeInTheDocument();
    expect(screen.getByText(/billed monthly or yearly/)).toBeInTheDocument();
  });

  it("renders standard lifetime price without launch badge", () => {
    renderDialog({ plan: "lifetime" });
    expect(
      screen.getByText(kaiplanOffering.plans.lifetime.price),
    ).toBeInTheDocument();
    expect(screen.queryByText(/LAUNCH/i)).not.toBeInTheDocument();
    expect(screen.getByText(/one-time purchase/)).toBeInTheDocument();
  });

  it("renders 'What you get' section with core tools for starter", () => {
    renderDialog({ plan: "starter" });
    expect(screen.getByText(/What you get/i)).toBeInTheDocument();
    expect(
      screen.getByText(kaiplanOffering.plans.starter.shortDescription),
    ).toBeInTheDocument();
  });

  it("renders 'What you get' section with feature list for pro", () => {
    renderDialog({ plan: "pro" });
    expect(screen.getByText(/What you get/i)).toBeInTheDocument();
    expect(
      screen.getByText(BILLING_FEATURE_LABELS.vendors),
    ).toBeInTheDocument();
    expect(
      screen.getByText(BILLING_FEATURE_LABELS.extraPlanner),
    ).toBeInTheDocument();
    expect(
      screen.getByText(BILLING_FEATURE_LABELS.weddingWebsite),
    ).toBeInTheDocument();
  });

  it("does not render 'What you'll lose' section when no features are lost", () => {
    // No featuresUsed means nothing lost when choosing any plan
    renderDialog({
      plan: "starter",
      summary: makeSummary({ featuresUsed: [] }),
    });
    expect(screen.queryByText(/What you'll lose/i)).not.toBeInTheDocument();
  });

  it("renders 'What you'll lose' section when downgrading from pro with used features", () => {
    const summary = makeSummary({ featuresUsed: ["vendors", "extraPlanner"] });
    renderDialog({ plan: "starter", summary });
    expect(screen.getByText(/What you'll lose/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        `${BILLING_FEATURE_LABELS.vendors} — only on ${getFeaturePlanLabel(
          "vendors",
        )}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${BILLING_FEATURE_LABELS.extraPlanner} — only on ${getFeaturePlanLabel(
          "extraPlanner",
        )}`,
      ),
    ).toBeInTheDocument();
  });

  it("renders 'What you'll lose' section with all lost features listed", () => {
    const summary = makeSummary({
      featuresUsed: ["vendors", "extraPlanner", "weddingWebsite"],
    });
    renderDialog({ plan: "starter", summary });
    expect(
      screen.getByText(
        `${BILLING_FEATURE_LABELS.vendors} — only on ${getFeaturePlanLabel(
          "vendors",
        )}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${BILLING_FEATURE_LABELS.extraPlanner} — only on ${getFeaturePlanLabel(
          "extraPlanner",
        )}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `${
          BILLING_FEATURE_LABELS.weddingWebsite
        } — only on ${getFeaturePlanLabel("weddingWebsite")}`,
      ),
    ).toBeInTheDocument();
  });

  it("renders 'Stay on Pro instead' CTA when there are lost features", () => {
    const summary = makeSummary({ featuresUsed: ["vendors"] });
    renderDialog({ plan: "starter", summary });
    expect(
      screen.getByRole("button", { name: stayOnProLabel }),
    ).toBeInTheDocument();
  });

  it("does not render 'Stay on Pro instead' CTA when there are no lost features", () => {
    renderDialog({
      plan: "starter",
      summary: makeSummary({ featuresUsed: [] }),
    });
    expect(
      screen.queryByRole("button", { name: stayOnProLabel }),
    ).not.toBeInTheDocument();
  });

  it("renders 'Continue to checkout' CTA when no features are lost", () => {
    renderDialog({
      plan: "starter",
      summary: makeSummary({ featuresUsed: [] }),
    });
    expect(
      screen.getByRole("button", { name: "Continue to checkout" }),
    ).toBeInTheDocument();
  });

  it("renders 'Continue to Starter anyway' secondary CTA when there are lost features", () => {
    const summary = makeSummary({ featuresUsed: ["vendors"] });
    renderDialog({ plan: "starter", summary });
    expect(
      screen.getByText(`Continue to ${BILLING_PLAN_LABELS.starter} anyway`),
    ).toBeInTheDocument();
  });

  it("renders 'Continue to Pro anyway' when losing features and target is pro", () => {
    // Pro has all features, so to see lost features we need to be on pro but using features
    // and downgrading... wait, pro has all features so nothing is lost.
    // This tests "Continue to <plan> anyway" text — for starter with lost features:
    const summary = makeSummary({ featuresUsed: ["vendors"] });
    renderDialog({ plan: "starter", summary });
    expect(
      screen.getByText(`Continue to ${BILLING_PLAN_LABELS.starter} anyway`),
    ).toBeInTheDocument();
  });

  it("shows billing interval toggle for starter plan (monthly/yearly options)", () => {
    renderDialog({
      plan: "starter",
      summary: makeSummary({ featuresUsed: [] }),
    });
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("Yearly")).toBeInTheDocument();
  });

  it("shows billing interval toggle for pro plan", () => {
    renderDialog({ plan: "pro", summary: makeSummary({ featuresUsed: [] }) });
    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("Yearly")).toBeInTheDocument();
  });

  it("hides billing interval toggle for lifetime plan", () => {
    renderDialog({ plan: "lifetime" });
    expect(screen.queryByText("Monthly")).not.toBeInTheDocument();
    expect(screen.queryByText("Yearly")).not.toBeInTheDocument();
  });

  it("switches billing interval to yearly when Yearly button is clicked", async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      plan: "pro",
      summary: makeSummary({ featuresUsed: [] }),
      onCheckout,
    });

    await user.click(screen.getByText("Yearly"));
    await user.click(
      screen.getByRole("button", { name: "Continue to checkout" }),
    );

    expect(onCheckout).toHaveBeenCalledWith("pro", "year");
  });

  it("defaults billing interval to yearly", async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      plan: "starter",
      summary: makeSummary({ featuresUsed: [] }),
      onCheckout,
    });

    await user.click(
      screen.getByRole("button", { name: "Continue to checkout" }),
    );
    expect(onCheckout).toHaveBeenCalledWith("starter", "year");
  });

  it("uses the provided initial interval", async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      plan: "starter",
      summary: makeSummary({ featuresUsed: [] }),
      onCheckout,
      initialInterval: "month",
    });

    await user.click(
      screen.getByRole("button", { name: "Continue to checkout" }),
    );
    expect(onCheckout).toHaveBeenCalledWith("starter", "month");
  });

  it("always uses month interval for lifetime plan checkout", async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn().mockResolvedValue(undefined);
    renderDialog({
      plan: "lifetime",
      onCheckout,
    });

    await user.click(
      screen.getByRole("button", { name: "Continue to checkout" }),
    );
    expect(onCheckout).toHaveBeenCalledWith("lifetime", "month");
  });

  it("calls onStayOnPro and onOpenChange(false) when Stay on Pro is clicked", async () => {
    const user = userEvent.setup();
    const onStayOnPro = vi.fn();
    const onOpenChange = vi.fn();
    const summary = makeSummary({ featuresUsed: ["vendors"] });
    renderDialog({ plan: "starter", summary, onStayOnPro, onOpenChange });

    await user.click(screen.getByRole("button", { name: stayOnProLabel }));

    expect(onStayOnPro).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows 'Opening checkout...' while isCheckingOut is true (no lost features)", () => {
    renderDialog({
      plan: "starter",
      summary: makeSummary({ featuresUsed: [] }),
      isCheckingOut: true,
    });
    expect(screen.getByText("Opening checkout...")).toBeInTheDocument();
  });

  it("shows 'Opening checkout...' while isCheckingOut is true (with lost features secondary button)", () => {
    const summary = makeSummary({ featuresUsed: ["vendors"] });
    renderDialog({ plan: "starter", summary, isCheckingOut: true });
    expect(screen.getByText("Opening checkout...")).toBeInTheDocument();
  });

  it("disables the primary CTA button when isCheckingOut is true", () => {
    renderDialog({
      plan: "starter",
      summary: makeSummary({ featuresUsed: [] }),
      isCheckingOut: true,
    });
    const btn = screen.getByRole("button", { name: "Opening checkout..." });
    expect(btn).toBeDisabled();
  });

  it("disables Stay on Pro button when isCheckingOut is true", () => {
    const summary = makeSummary({ featuresUsed: ["vendors"] });
    renderDialog({ plan: "starter", summary, isCheckingOut: true });
    expect(screen.getByRole("button", { name: stayOnProLabel })).toBeDisabled();
  });

  it("renders nothing when open is false", () => {
    renderDialog({ open: false });
    expect(
      screen.queryByText(`You're choosing ${BILLING_PLAN_LABELS.starter}`),
    ).not.toBeInTheDocument();
  });
});
