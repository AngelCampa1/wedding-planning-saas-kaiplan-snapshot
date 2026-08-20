import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingSummary } from "@kaiplan/shared";
import { SubscribePage } from "../../src/routes/_authenticated/subscribe";
import { useBillingSummary } from "../../src/hooks/use-billing";

const routeMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useSearch: vi.fn(() => ({})),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useNavigate: () => routeMocks.navigate,
    useSearch: routeMocks.useSearch,
  }),
}));

vi.mock("../../src/hooks/use-billing", () => ({
  useBillingSummary: vi.fn(),
  useBillingCheckout: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useBillingPortal: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("../../src/components/billing/plan-comparison", () => ({
  PlanComparison: ({ summary }: { summary: BillingSummary }) => (
    <div data-testid="plan-comparison">
      Plan comparison for {summary.status}
    </div>
  ),
}));

const mockedUseBillingSummary = vi.mocked(useBillingSummary);

function makeSummary(overrides: Partial<BillingSummary> = {}): BillingSummary {
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

describe("SubscribePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.useSearch.mockReturnValue({});
  });

  it("keeps active trial users on subscribe so they can choose a plan", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: makeSummary({
        status: "trialing",
        trialDaysRemaining: 12,
        features: ["vendors", "extraPlanner", "weddingWebsite"],
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBillingSummary>);

    render(<SubscribePage />);

    expect(screen.getByTestId("plan-comparison")).toHaveTextContent("trialing");
    expect(routeMocks.navigate).not.toHaveBeenCalled();
  });

  it("redirects ungated non-trial users back to the dashboard", async () => {
    mockedUseBillingSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useBillingSummary>);

    render(<SubscribePage />);

    await waitFor(() => {
      expect(routeMocks.navigate).toHaveBeenCalledWith({
        to: "/dashboard",
        replace: true,
      });
    });
  });
});
