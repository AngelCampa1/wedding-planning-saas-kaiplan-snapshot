import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WebsiteStatusWidget } from "../../../src/components/website/website-status-widget";
import { useWeddingWebsite } from "../../../src/hooks/use-website";
import { useGuestSummary } from "../../../src/hooks/use-guests";
import { ApiError } from "../../../src/lib/api";

vi.mock("../../../src/hooks/use-website");
vi.mock("../../../src/hooks/use-guests");
// Also mock useNavigate if the component uses it
const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...original,
    useNavigate: () => mockNavigate,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

const mockUseWeddingWebsite = vi.mocked(useWeddingWebsite);
const mockUseGuestSummary = vi.mocked(useGuestSummary);

function makeWebsiteData(overrides = {}) {
  return {
    publishedSlug: "ava-sam-2026",
    publishedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSummaryData(
  byRsvp = { pending: 3, invited: 2, accepted: 10, declined: 1 },
) {
  return { byRsvp, total: Object.values(byRsvp).reduce((a, b) => a + b, 0) };
}

function mockBothLoaded(websiteOverrides = {}, byRsvpOverrides = {}) {
  mockUseWeddingWebsite.mockReturnValue({
    data: makeWebsiteData(websiteOverrides),
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useWeddingWebsite>);
  mockUseGuestSummary.mockReturnValue({
    data: makeSummaryData({
      pending: 3,
      invited: 2,
      accepted: 10,
      declined: 1,
      ...byRsvpOverrides,
    }),
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useGuestSummary>);
}

describe("WebsiteStatusWidget", () => {
  it("shows Published state with pending + confirmed counts when publishedSlug is set", () => {
    mockBothLoaded();
    render(<WebsiteStatusWidget weddingId="w-1" />);
    expect(screen.getByText("Published")).toBeInTheDocument();
    // pending(3) + invited(2) = 5 awaiting
    expect(screen.getByText(/5/)).toBeInTheDocument();
    // accepted = 10 confirmed
    expect(screen.getByText(/10/)).toBeInTheDocument();
  });

  it("pending count equals byRsvp.pending + byRsvp.invited", () => {
    mockBothLoaded({}, { pending: 7, invited: 4, accepted: 2, declined: 0 });
    render(<WebsiteStatusWidget weddingId="w-1" />);
    expect(screen.getByText(/11/)).toBeInTheDocument(); // 7+4
  });

  it("shows Not published state when publishedSlug is null", () => {
    mockBothLoaded({ publishedSlug: null });
    render(<WebsiteStatusWidget weddingId="w-1" />);
    expect(screen.getByText("Not published")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /set up website/i }),
    ).toBeInTheDocument();
  });

  it("shows an error state when website query is in error state", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("failed"),
    } as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useGuestSummary>);

    render(<WebsiteStatusWidget weddingId="w-1" />);

    expect(
      screen.getByText("Website status is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /set up website/i }),
    ).not.toBeInTheDocument();
  });

  it("uses the guest summary error when the website query has no Error", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "failed",
    } as unknown as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("summary failed"),
    } as ReturnType<typeof useGuestSummary>);

    render(<WebsiteStatusWidget weddingId="w-1" />);

    expect(screen.queryByText("summary failed")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the generic widget message for non-Error failures", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "failed",
    } as unknown as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "summary failed",
    } as unknown as ReturnType<typeof useGuestSummary>);

    render(<WebsiteStatusWidget weddingId="w-1" />);

    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
  });

  it("shows loading placeholder when query is loading", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useGuestSummary>);
    const { container } = render(<WebsiteStatusWidget weddingId="w-1" />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows loading placeholder instead of a stale error during refetch", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: true,
      error: new Error("failed"),
    } as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useGuestSummary>);

    const { container } = render(<WebsiteStatusWidget weddingId="w-1" />);

    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
    expect(
      screen.queryByText("Website status is temporarily unavailable"),
    ).not.toBeInTheDocument();
  });

  it("navigates to /website when Set up website is clicked", async () => {
    const user = userEvent.setup();
    mockBothLoaded({ publishedSlug: null });
    render(<WebsiteStatusWidget weddingId="w-1" />);
    await user.click(screen.getByRole("button", { name: /set up website/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/website" });
  });

  it("shows published state with zero counts when summary data is undefined", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: makeWebsiteData(),
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useGuestSummary>);
    render(<WebsiteStatusWidget weddingId="w-1" />);
    expect(screen.getByText("Published")).toBeInTheDocument();
    // fallback to 0 when summary is undefined
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it("shows loading placeholder when only guest summary is loading", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: makeWebsiteData(),
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useGuestSummary>);
    const { container } = render(<WebsiteStatusWidget weddingId="w-1" />);
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders the Manage website link when published", () => {
    mockBothLoaded();
    render(<WebsiteStatusWidget weddingId="w-1" />);
    expect(
      screen.getByRole("link", { name: /manage website/i }),
    ).toBeInTheDocument();
  });

  it("shows the upgrade prompt instead of the error card when the website feature is gated (402)", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(402, "Payment required"),
    } as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useGuestSummary>);

    render(<WebsiteStatusWidget weddingId="w-1" />);

    expect(
      screen.getByText("Publish a wedding website so guests can RSVP online."),
    ).toBeInTheDocument();
    expect(screen.getByText("It comes with a paid plan.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /see plans/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Website status is temporarily unavailable"),
    ).not.toBeInTheDocument();
  });

  it("navigates to /subscribe when See plans is clicked on the gated state", async () => {
    const user = userEvent.setup();
    mockUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(402, "Payment required"),
    } as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useGuestSummary>);

    render(<WebsiteStatusWidget weddingId="w-1" />);
    await user.click(screen.getByRole("button", { name: /see plans/i }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/subscribe",
      search: { checkout: undefined },
    });
  });

  it("still shows the generic error card for non-402 ApiErrors", () => {
    mockUseWeddingWebsite.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(500, "Server error"),
    } as ReturnType<typeof useWeddingWebsite>);
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useGuestSummary>);

    render(<WebsiteStatusWidget weddingId="w-1" />);

    expect(
      screen.getByText("Website status is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /see plans/i }),
    ).not.toBeInTheDocument();
  });
});
