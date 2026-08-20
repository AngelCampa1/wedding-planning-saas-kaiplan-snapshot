import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  BILLING_FEATURE_LABELS,
  BILLING_PLAN_LABELS,
  TRIAL_DURATION_DAYS,
} from "@kaiplan/shared";
import { BillingSection } from "../../../src/components/billing/billing-section";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("BillingSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows billing summary details and history", () => {
    render(
      <BillingSection
        summary={{
          plan: "starter",
          status: "active",
          stripeCustomerId: "cus_123",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          features: ["vendors", "extraPlanner"],
          canManageBilling: true,
        }}
        history={{
          items: [
            {
              id: "inv_1",
              type: "invoice",
              amountCents: 12500,
              currency: "usd",
              status: "paid",
              createdAt: "2026-04-01T00:00:00.000Z",
              hostedUrl: "https://example.com/invoice",
            },
          ],
        }}
        isLoading={false}
        nextPlan="pro"
        onUpgrade={vi.fn()}
        onManageBilling={vi.fn()}
        isUpgrading={false}
        isManaging={false}
      />,
    );

    expect(screen.getByText("Current plan")).toBeInTheDocument();
    expect(screen.getByText(BILLING_PLAN_LABELS.starter)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Next renewal")).toBeInTheDocument();
    expect(screen.getByText("May 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("Payment history")).toBeInTheDocument();
    expect(screen.getByText("Invoice inv_1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View receipt" })).toHaveAttribute(
      "href",
      "https://example.com/invoice",
    );
  });

  it("calls upgrade and billing portal actions", async () => {
    const user = userEvent.setup();
    const onUpgrade = vi.fn();
    const onManageBilling = vi.fn();

    render(
      <BillingSection
        summary={{
          plan: "free",
          status: "inactive",
          stripeCustomerId: null,
          currentPeriodEnd: null,
          features: [],
          canManageBilling: true,
        }}
        history={{ items: [] }}
        isLoading={false}
        nextPlan="starter"
        onUpgrade={onUpgrade}
        onManageBilling={onManageBilling}
        isUpgrading={false}
        isManaging={false}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: `Upgrade to ${BILLING_PLAN_LABELS.starter}`,
      }),
    );
    await user.click(screen.getByRole("button", { name: "Manage billing" }));

    expect(onUpgrade).toHaveBeenCalledWith("starter");
    expect(onManageBilling).toHaveBeenCalled();
    expect(
      screen.getByText(
        new RegExp(`${TRIAL_DURATION_DAYS}-day free trial`, "i"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/full app access/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a plan later/i)).toBeInTheDocument();
  });

  it("shows only the lifetime hint (no trial copy) when the next plan is lifetime", () => {
    render(
      <BillingSection
        summary={{
          plan: "pro",
          status: "active",
          stripeCustomerId: "cus_123",
          currentPeriodEnd: "2026-06-01T00:00:00.000Z",
          features: [],
          canManageBilling: true,
        }}
        history={{ items: [] }}
        isLoading={false}
        nextPlan="lifetime"
        onUpgrade={vi.fn()}
        onManageBilling={vi.fn()}
        isUpgrading={false}
        isManaging={false}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: `Upgrade to ${BILLING_PLAN_LABELS.lifetime}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/pay once/i)).toBeInTheDocument();
    expect(screen.getByText(/no recurring charges/i)).toBeInTheDocument();
    expect(
      screen.queryByText(new RegExp(`${TRIAL_DURATION_DAYS}-day`, "i")),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/free trial/i)).not.toBeInTheDocument();
  });

  it("renders loading placeholders inside Card substrate", () => {
    const { container } = render(
      <BillingSection
        isLoading
        summary={undefined}
        history={undefined}
        nextPlan={null}
        onUpgrade={vi.fn()}
        onManageBilling={vi.fn()}
        isUpgrading={false}
        isManaging={false}
      />,
    );

    expect(screen.getAllByText("Billing")).toHaveLength(1);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(container.querySelectorAll('[data-slot="card"]').length).toBe(2);
  });

  it("renders fallback states when billing data is unavailable", () => {
    const { container } = render(
      <BillingSection
        summary={undefined}
        history={undefined}
        isLoading={false}
        nextPlan={null}
        onUpgrade={vi.fn()}
        onManageBilling={vi.fn()}
        isUpgrading={false}
        isManaging={false}
      />,
    );

    expect(
      screen.getByText("Billing details are unavailable."),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="card"]').length).toBe(1);
  });

  it("renders feature pills as Badges with the neutral variant", () => {
    const { container } = render(
      <BillingSection
        summary={{
          plan: "starter",
          status: "active",
          stripeCustomerId: "cus_123",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          features: ["vendors", "weddingWebsite"],
          canManageBilling: true,
        }}
        history={{ items: [] }}
        isLoading={false}
        nextPlan="pro"
        onUpgrade={vi.fn()}
        onManageBilling={vi.fn()}
        isUpgrading={false}
        isManaging={false}
      />,
    );

    const badges = container.querySelectorAll('[data-slot="badge"]');
    expect(badges.length).toBe(2);
    expect(
      screen.getByText(BILLING_FEATURE_LABELS.vendors),
    ).toBeInTheDocument();
    expect(
      screen.getByText(BILLING_FEATURE_LABELS.weddingWebsite),
    ).toBeInTheDocument();
    badges.forEach((badge) => {
      expect(badge.className).toMatch(/bg-muted/);
    });
  });

  it("renders inactive summaries without actions or history", () => {
    render(
      <BillingSection
        summary={{
          plan: "pro",
          status: "canceled",
          stripeCustomerId: null,
          currentPeriodEnd: null,
          features: [],
          canManageBilling: false,
        }}
        history={{ items: [] }}
        isLoading={false}
        nextPlan={null}
        onUpgrade={vi.fn()}
        onManageBilling={vi.fn()}
        isUpgrading
        isManaging
      />,
    );

    expect(screen.getByText("Expiration")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("No paid features yet.")).toBeInTheDocument();
    expect(screen.getByText("No payment history yet.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /upgrade/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /manage billing/i }),
    ).not.toBeInTheDocument();
  });

  it("renders pending action labels and payment intent history", () => {
    const { container } = render(
      <BillingSection
        summary={{
          plan: "starter",
          status: "trialing",
          stripeCustomerId: "cus_123",
          currentPeriodEnd: "2026-06-01T00:00:00.000Z",
          features: ["customFeature"],
          canManageBilling: true,
        }}
        history={{
          items: [
            {
              id: "inv_1",
              type: "invoice",
              amountCents: 12500,
              currency: "usd",
              status: "paid",
              createdAt: "2026-04-01T00:00:00.000Z",
              hostedUrl: "https://example.com/invoice",
            },
            {
              id: "pi_1",
              type: "payment_intent",
              amountCents: 2500,
              currency: "usd",
              status: "requires_action",
              createdAt: "2026-04-02T00:00:00.000Z",
              hostedUrl: null,
            },
          ],
        }}
        isLoading={false}
        nextPlan="pro"
        onUpgrade={vi.fn()}
        onManageBilling={vi.fn()}
        isUpgrading
        isManaging
      />,
    );

    expect(screen.getByText("Next renewal")).toBeInTheDocument();
    expect(screen.getByText("customFeature")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Starting checkout..." }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Opening portal..." }),
    ).toBeDisabled();
    expect(screen.getByText("Payment intent pi_1")).toBeInTheDocument();
    expect(screen.getByText(/Requires Action/)).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-slot="separator"]').length,
    ).toBeGreaterThan(0);
  });
});
