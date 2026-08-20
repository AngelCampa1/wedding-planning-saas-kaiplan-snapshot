import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import { VendorWidget } from "../../../src/components/vendor/vendor-widget";
import { getFeaturePlanLabel } from "../../../src/lib/billing-labels";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../../src/hooks/use-vendors", () => ({
  useVendorSummary: vi.fn(),
}));
vi.mock("../../../src/hooks/use-billing", () => ({
  useBillingSummary: vi.fn(),
}));

import { useVendorSummary } from "../../../src/hooks/use-vendors";
import { useBillingSummary } from "../../../src/hooks/use-billing";

const mockedUseVendorSummary = vi.mocked(useVendorSummary);
const mockedUseBillingSummary = vi.mocked(useBillingSummary);
const vendorPlanLabel = getFeaturePlanLabel("vendors");
const vendorUnlockTitle = `Unlock vendors with ${vendorPlanLabel}`;

describe("VendorWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "pro",
        status: "active",
        currentPeriodEnd: null,
        stripeCustomerId: "cus_123",
      },
      isLoading: false,
    } as ReturnType<typeof useBillingSummary>);
  });

  it("shows a loading skeleton", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useVendorSummary>);

    const { container } = render(<VendorWidget weddingId="wedding-1" />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(mockedUseVendorSummary).toHaveBeenCalledWith(null);
  });

  it("shows an empty state with CTA", () => {
    mockedUseVendorSummary.mockReturnValue({
      data: {
        totalVendors: 0,
        pendingQuotes: 0,
        signedContracts: 0,
        totalPaidCents: 0,
        totalOutstandingCents: 0,
      },
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" />);

    expect(
      screen.getByText("Track your venue, caterer, photographer, and more."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add vendor/i })).toHaveAttribute(
      "href",
      "/vendors",
    );
  });

  it("shows Start here badge when showStartHere is true", () => {
    mockedUseVendorSummary.mockReturnValue({
      data: {
        totalVendors: 0,
        pendingQuotes: 0,
        signedContracts: 0,
        totalPaidCents: 0,
        totalOutstandingCents: 0,
      },
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" showStartHere />);

    expect(screen.getByText("Start here")).toBeInTheDocument();
  });

  it("does not show Start here badge by default", () => {
    mockedUseVendorSummary.mockReturnValue({
      data: {
        totalVendors: 0,
        pendingQuotes: 0,
        signedContracts: 0,
        totalPaidCents: 0,
        totalOutstandingCents: 0,
      },
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" />);

    expect(screen.queryByText("Start here")).not.toBeInTheDocument();
  });

  it("shows an upgrade teaser instead of loading paid vendor data on the free plan", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "free",
        status: "inactive",
        currentPeriodEnd: null,
        stripeCustomerId: null,
      },
      isLoading: false,
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" />);

    expect(screen.getByText(vendorUnlockTitle)).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(`${TRIAL_DURATION_DAYS}-day free trial`, "i"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/full app access/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a plan later/i)).toBeInTheDocument();
    expect(screen.queryByText(/LAUNCH/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view plans/i })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("shows a billing error state instead of an empty state when billing status fails", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: undefined,
      error: new Error("billing is down"),
      isLoading: false,
      status: "error",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" />);

    expect(
      screen.getByText("Vendor access is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText("billing is down")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Track your venue, caterer, photographer, and more."),
    ).not.toBeInTheDocument();
  });

  it("shows a vendor summary error instead of the empty state when vendors fail to load", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "pro",
        status: "active",
        currentPeriodEnd: null,
        stripeCustomerId: "cus_123",
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("vendor summary down"),
    } as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" />);

    expect(
      screen.getByText("Vendor summary is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText("vendor summary down")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /add vendor/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the generic widget message for non-Error vendor summary failures", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "pro",
        status: "active",
        currentPeriodEnd: null,
        stripeCustomerId: "cus_123",
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: "vendor summary down",
    } as unknown as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" />);

    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the legacy free/starter lock check when features are absent", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "starter",
        status: "active",
        currentPeriodEnd: null,
        stripeCustomerId: "cus_123",
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" />);

    expect(screen.getByText(vendorUnlockTitle)).toBeInTheDocument();
    expect(mockedUseVendorSummary).toHaveBeenCalledWith(null);
  });

  it("shows a generic message when billingError is not an Error instance", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: undefined,
      error: "string error",
      isLoading: false,
      status: "error",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);
    render(<VendorWidget weddingId="wedding-1" />);
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
  });

  it("shows empty state when billing succeeds but summary data is not yet available", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);
    render(<VendorWidget weddingId="wedding-1" />);
    expect(
      screen.getByText("Track your venue, caterer, photographer, and more."),
    ).toBeInTheDocument();
  });

  it("renders the paid-plan lock teaser as a Badge", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "free",
        status: "inactive",
        currentPeriodEnd: null,
        stripeCustomerId: null,
      },
      isLoading: false,
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);

    const { container } = render(<VendorWidget weddingId="wedding-1" />);
    const badge = container.querySelector('[data-slot="badge"]');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent(vendorPlanLabel);
    expect(container.querySelector('[data-slot="card"]')).not.toBeNull();
  });

  it("renders summary stats and a link to /vendors", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "pro",
        status: "active",
        currentPeriodEnd: null,
        stripeCustomerId: "cus_123",
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: {
        totalVendors: 3,
        pendingQuotes: 1,
        signedContracts: 2,
        totalPaidCents: 175000,
        totalOutstandingCents: 95000,
      },
      isLoading: false,
    } as ReturnType<typeof useVendorSummary>);

    render(<VendorWidget weddingId="wedding-1" />);

    expect(screen.getByText("Vendors")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Outstanding")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute(
      "href",
      "/vendors",
    );
  });
});
