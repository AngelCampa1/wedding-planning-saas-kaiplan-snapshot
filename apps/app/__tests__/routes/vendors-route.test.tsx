import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import { ApiError } from "../../src/lib/api";

const setActiveWeddingId = vi.fn();
const routeContext = {
  auth: {
    user: {
      name: "Angel Campa",
      email: "angel@example.com",
    },
  },
};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useRouteContext: () => routeContext,
  }),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../src/components/top-bar", () => ({
  TopBar: () => <div>Top bar</div>,
}));

vi.mock("../../src/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: {
    asChild?: boolean;
    children: ReactNode;
  } & import("react").ButtonHTMLAttributes<HTMLButtonElement>) =>
    asChild && isValidElement(children) ? (
      cloneElement(children, props)
    ) : (
      <button {...props}>{children}</button>
    ),
}));

vi.mock("../../src/components/vendor/vendor-summary-bar", () => ({
  VendorSummaryBar: () => <div>Vendor summary</div>,
}));

vi.mock("../../src/components/vendor/vendor-list", () => ({
  VendorList: ({
    onSelectVendor,
  }: {
    onSelectVendor: (vendorId: string) => void;
  }) => (
    <button type="button" onClick={() => onSelectVendor("vendor-1")}>
      Vendor list
    </button>
  ),
}));

vi.mock("../../src/components/vendor/vendor-form", () => ({
  VendorForm: ({ open }: { open: boolean }) =>
    open ? <div>Vendor form</div> : null,
}));

vi.mock("../../src/components/vendor/vendor-detail-panel", () => ({
  VendorDetailPanel: ({ open }: { open: boolean }) =>
    open ? <div>Vendor detail</div> : null,
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useWeddings: vi.fn(),
}));

vi.mock("../../src/hooks/use-budget", () => ({
  useBudgetCategories: vi.fn(),
}));

vi.mock("../../src/hooks/use-billing", () => ({
  useBillingSummary: vi.fn(),
}));

vi.mock("../../src/hooks/use-vendors", () => ({
  useVendorSummary: vi.fn(),
  useVendors: vi.fn(),
  useCreateVendor: vi.fn(),
}));

vi.mock("../../src/lib/wedding-context", () => ({
  useActiveWedding: vi.fn(),
}));

import { VendorsPage } from "../../src/routes/_authenticated/vendors";
import { useActiveWedding } from "../../src/lib/wedding-context";
import { useBillingSummary } from "../../src/hooks/use-billing";
import { useBudgetCategories } from "../../src/hooks/use-budget";
import {
  useVendorSummary,
  useVendors,
  useCreateVendor,
} from "../../src/hooks/use-vendors";
import { useWeddings } from "../../src/hooks/use-weddings";

const mockedUseWeddings = vi.mocked(useWeddings);
const mockedUseBillingSummary = vi.mocked(useBillingSummary);
const mockedUseBudgetCategories = vi.mocked(useBudgetCategories);
const mockedUseVendorSummary = vi.mocked(useVendorSummary);
const mockedUseVendors = vi.mocked(useVendors);
const mockedUseCreateVendor = vi.mocked(useCreateVendor);
const mockedUseActiveWedding = vi.mocked(useActiveWedding);

describe("VendorsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseWeddings.mockReturnValue({
      data: [{ id: "w-1", name: "Mia & Cole", role: "owner", date: null }],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: "w-1",
      setActiveWeddingId,
      setWeddingSwitchGuard: vi.fn(),
    } as ReturnType<typeof useActiveWedding>);
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "free",
        status: "inactive",
        stripeCustomerId: null,
        currentPeriodEnd: null,
        features: [],
        canManageBilling: false,
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseBudgetCategories.mockReturnValue({
      data: [],
    } as ReturnType<typeof useBudgetCategories>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(402, "Payment required"),
    } as ReturnType<typeof useVendorSummary>);
    mockedUseVendors.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(402, "Payment required"),
    } as ReturnType<typeof useVendors>);
    mockedUseCreateVendor.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as ReturnType<typeof useCreateVendor>);
  });

  it("shows a billing gate when the API returns 402", () => {
    render(<VendorsPage />);

    expect(
      screen.getByText("Vendor access requires an active plan"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Upgrade in settings" }),
    ).toHaveAttribute("href", "/settings");
    expect(
      screen.getByText(
        new RegExp(`${TRIAL_DURATION_DAYS}-day free trial`, "i"),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/full app access/i)).toBeInTheDocument();
    expect(screen.getByText(/choose a plan later/i)).toBeInTheDocument();
    expect(screen.queryByText(/LAUNCH/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Vendor list")).not.toBeInTheDocument();
    expect(mockedUseVendorSummary).toHaveBeenCalledWith(null);
    expect(mockedUseVendors).toHaveBeenCalledWith(null);
  });

  it("shows a create-wedding state instead of a billing gate when no wedding exists", () => {
    mockedUseWeddings.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useWeddings>);
    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: null,
      setActiveWeddingId,
      setWeddingSwitchGuard: vi.fn(),
    } as ReturnType<typeof useActiveWedding>);

    render(<VendorsPage />);

    expect(screen.getByText("Create a wedding first")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create wedding" }),
    ).toHaveAttribute("href", "/onboarding");
    expect(
      screen.queryByText("Vendor access requires an active plan"),
    ).not.toBeInTheDocument();
  });

  it("shows a billing gate when a lapsed paid plan no longer includes vendor access", () => {
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "starter",
        status: "past_due",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-05-01T00:00:00.000Z",
        features: [],
        canManageBilling: true,
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    } as ReturnType<typeof useVendorSummary>);
    mockedUseVendors.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
    } as ReturnType<typeof useVendors>);

    render(<VendorsPage />);

    expect(
      screen.getByText("Vendor access requires an active plan"),
    ).toBeInTheDocument();
    expect(mockedUseVendorSummary).toHaveBeenCalledWith(null);
    expect(mockedUseVendors).toHaveBeenCalledWith(null);
  });

  it("shows a billing error state instead of an empty vendor state when billing fails", () => {
    const refetch = vi.fn();
    mockedUseBillingSummary.mockReturnValue({
      data: undefined,
      error: new Error("billing is down"),
      isLoading: false,
      status: "error",
      refetch,
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    } as ReturnType<typeof useVendorSummary>);
    mockedUseVendors.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
    } as ReturnType<typeof useVendors>);

    render(<VendorsPage />);

    expect(
      screen.getByText("We couldn't load vendor access right now."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("billing is down")).not.toBeInTheDocument();
    expect(screen.queryByText("No vendors yet")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add vendor" }),
    ).not.toBeInTheDocument();
    expect(mockedUseVendorSummary).toHaveBeenCalledWith(null);
    expect(mockedUseVendors).toHaveBeenCalledWith(null);
  });

  it("shows a retryable error instead of the empty vendor state when vendors fail to load", () => {
    const summaryRefetch = vi.fn();
    const vendorsRefetch = vi.fn();
    const categoriesRefetch = vi.fn();
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "pro",
        status: "active",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-06-01T00:00:00.000Z",
        features: ["vendors"],
        canManageBilling: true,
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
      refetch: summaryRefetch,
    } as ReturnType<typeof useVendorSummary>);
    mockedUseVendors.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error("vendors are down"),
      refetch: vendorsRefetch,
    } as ReturnType<typeof useVendors>);
    mockedUseBudgetCategories.mockReturnValue({
      data: [],
      error: undefined,
      refetch: categoriesRefetch,
    } as ReturnType<typeof useBudgetCategories>);

    render(<VendorsPage />);

    expect(screen.getByText("Vendor data did not load")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("vendors are down")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Track every quote, every payment."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Vendor list")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add vendor" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Vendor form")).not.toBeInTheDocument();
    expect(screen.queryByText("Vendor detail")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry vendors" }));

    expect(summaryRefetch).toHaveBeenCalledTimes(1);
    expect(vendorsRefetch).toHaveBeenCalledTimes(1);
    expect(categoriesRefetch).toHaveBeenCalledTimes(1);
  });

  it("clears open vendor surfaces when a refetch fails", async () => {
    const activeVendorSummary = {
      totalCommittedCents: 0,
      totalPaidCents: 0,
      remainingBalanceCents: 0,
      pendingQuotes: 0,
      upcomingPayments: [],
    };
    const activeVendors = [
      {
        id: "vendor-1",
        weddingId: "w-1",
        name: "Blue Hour Photo",
        categoryId: null,
        categoryName: null,
        contactName: null,
        email: null,
        phone: null,
        website: null,
        status: "researching",
        notes: null,
        quoteCount: 0,
        minQuoteCents: null,
        maxQuoteCents: null,
        selectedQuoteCents: null,
        paidCents: 0,
        nextPaymentDueDate: null,
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
      },
    ];
    mockedUseBillingSummary.mockReturnValue({
      data: {
        plan: "pro",
        status: "active",
        stripeCustomerId: "cus_123",
        currentPeriodEnd: "2026-06-01T00:00:00.000Z",
        features: ["vendors"],
        canManageBilling: true,
      },
      isLoading: false,
      status: "success",
    } as ReturnType<typeof useBillingSummary>);
    mockedUseVendorSummary.mockReturnValue({
      data: activeVendorSummary,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    } as ReturnType<typeof useVendorSummary>);
    mockedUseVendors.mockReturnValue({
      data: activeVendors,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    } as ReturnType<typeof useVendors>);
    mockedUseBudgetCategories.mockReturnValue({
      data: [],
      error: undefined,
      refetch: vi.fn(),
    } as ReturnType<typeof useBudgetCategories>);

    const { rerender } = render(<VendorsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Add vendor" }));
    fireEvent.click(screen.getByRole("button", { name: "Vendor list" }));

    expect(screen.getByText("Vendor form")).toBeInTheDocument();
    expect(screen.getByText("Vendor detail")).toBeInTheDocument();

    mockedUseVendors.mockReturnValue({
      data: activeVendors,
      isLoading: false,
      error: new Error("vendors are down"),
      refetch: vi.fn(),
    } as ReturnType<typeof useVendors>);

    rerender(<VendorsPage />);

    expect(screen.getByText("Vendor data did not load")).toBeInTheDocument();
    expect(screen.queryByText("Vendor form")).not.toBeInTheDocument();
    expect(screen.queryByText("Vendor detail")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Vendor form")).not.toBeInTheDocument();
      expect(screen.queryByText("Vendor detail")).not.toBeInTheDocument();
    });

    mockedUseVendors.mockReturnValue({
      data: activeVendors,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    } as ReturnType<typeof useVendors>);

    rerender(<VendorsPage />);

    expect(screen.queryByText("Vendor form")).not.toBeInTheDocument();
    expect(screen.queryByText("Vendor detail")).not.toBeInTheDocument();
    expect(screen.getByText("Vendor list")).toBeInTheDocument();
  });
});
