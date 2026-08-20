import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const routeContext = {
  auth: {
    user: { id: "user-1", name: "Angel Campa", email: "angel@example.com" },
  },
};
const navigateFn = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({
    useRouteContext: () => routeContext,
    useNavigate: () => navigateFn,
  }),
  useNavigate: () => navigateFn,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("../../src/hooks/use-weddings", () => ({
  useWeddings: vi.fn(),
}));
vi.mock("../../src/hooks/use-budget", () => ({
  useBudgetCategories: () => ({ data: [] }),
}));
vi.mock("../../src/hooks/use-checklist", () => ({
  useChecklist: () => ({ data: { totalCount: 1 } }),
}));
vi.mock("../../src/hooks/use-guests", () => ({
  useGuests: () => ({ data: [] }),
}));
vi.mock("../../src/hooks/use-vendors", () => ({
  useVendors: () => ({ data: [] }),
}));
vi.mock("../../src/hooks/use-website", () => ({
  useWeddingWebsite: () => ({ data: null }),
}));
vi.mock("../../src/lib/tour-storage", () => ({
  hasOpenedSeating: () => false,
}));

vi.mock("../../src/lib/wedding-context", () => ({
  useActiveWedding: vi.fn(),
}));

vi.mock("../../src/components/top-bar", () => ({
  TopBar: ({ weddings }: { weddings: unknown[] }) => (
    <div data-testid="topbar">topbar-{weddings.length}</div>
  ),
}));

vi.mock("../../src/components/budget/budget-widget", () => ({
  BudgetWidget: () => <div>budget</div>,
}));
vi.mock("../../src/components/guest/guest-widget", () => ({
  GuestWidget: () => <div>guests</div>,
}));
vi.mock("../../src/components/seating/seating-widget", () => ({
  SeatingWidget: () => <div>seating</div>,
}));
vi.mock("../../src/components/vendor/vendor-widget", () => ({
  VendorWidget: () => <div>vendors</div>,
}));
vi.mock("../../src/components/dashboard/countdown-hero", () => ({
  CountdownHero: ({ weddingName }: { weddingName: string }) => (
    <div>countdown:{weddingName}</div>
  ),
}));
vi.mock("../../src/components/dashboard/quick-actions", () => ({
  QuickActions: () => <div>quickactions</div>,
}));
vi.mock("../../src/components/website/website-status-widget", () => ({
  WebsiteStatusWidget: () => <div>website</div>,
}));

import { DashboardPage } from "../../src/routes/_authenticated/dashboard";
import { useWeddings } from "../../src/hooks/use-weddings";
import { useActiveWedding } from "../../src/lib/wedding-context";

const mockedUseWeddings = vi.mocked(useWeddings);
const mockedUseActiveWedding = vi.mocked(useActiveWedding);

const WEDDING_ROW = {
  id: "wedding-1",
  name: "Angel & Jordan",
  date: "2025-10-01",
  budgetCents: 0,
  currency: "USD",
  timezone: "UTC",
  createdBy: "user-1",
  archivedAt: null,
  status: "planning" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  role: "owner" as const,
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateFn.mockResolvedValue(undefined);
    mockedUseActiveWedding.mockReturnValue({
      activeWeddingId: "wedding-1",
      setActiveWeddingId: vi.fn(),
      setWeddingSwitchGuard: vi.fn(),
    });
  });

  it("shows the dashboard content when weddings are loaded", () => {
    mockedUseWeddings.mockReturnValue({
      data: [WEDDING_ROW],
      isLoading: false,
      isSuccess: true,
      isError: false,
    } as ReturnType<typeof useWeddings>);

    render(<DashboardPage />);

    expect(screen.getByText(/Welcome back, Angel/i)).toBeInTheDocument();
    expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
    expect(navigateFn).not.toHaveBeenCalled();
  });

  it("redirects to /onboarding when isSuccess and no weddings", () => {
    mockedUseWeddings.mockReturnValue({
      data: [],
      isLoading: false,
      isSuccess: true,
      isError: false,
    } as ReturnType<typeof useWeddings>);

    render(<DashboardPage />);

    expect(navigateFn).toHaveBeenCalledWith({ to: "/onboarding" });
  });

  it("does NOT redirect when query is still loading", () => {
    mockedUseWeddings.mockReturnValue({
      data: undefined,
      isLoading: true,
      isSuccess: false,
      isError: false,
    } as ReturnType<typeof useWeddings>);

    render(<DashboardPage />);

    expect(navigateFn).not.toHaveBeenCalled();
  });

  it("does NOT redirect to /onboarding when query errors — shows error message instead", () => {
    mockedUseWeddings.mockReturnValue({
      data: undefined,
      isLoading: false,
      isSuccess: false,
      isError: true,
    } as ReturnType<typeof useWeddings>);

    render(<DashboardPage />);

    expect(navigateFn).not.toHaveBeenCalled();
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });
});
