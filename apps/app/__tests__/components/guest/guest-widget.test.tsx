import { createElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuestWidget } from "../../../src/components/guest/guest-widget";
import type { GuestSummary, GuestWithPlusOnes } from "@kaiplan/shared";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: React.ReactNode;
    to: string;
    [key: string]: unknown;
  }) => createElement("a", { href: to, ...props }, children),
}));

vi.mock("../../../src/hooks/use-guests", () => ({
  useGuestSummary: vi.fn(),
  useGuests: vi.fn(),
}));

import { useGuestSummary, useGuests } from "../../../src/hooks/use-guests";

const mockUseGuestSummary = vi.mocked(useGuestSummary);
const mockUseGuests = vi.mocked(useGuests);

function makeSummary(overrides: Partial<GuestSummary> = {}): GuestSummary {
  return {
    totalGuests: 10,
    totalPrimary: 8,
    totalPlusOnes: 2,
    byRsvp: {
      pending: 3,
      invited: 2,
      accepted: 4,
      declined: 1,
    },
    byDietary: {
      vegetarian: 1,
      vegan: 0,
      gluten_free: 0,
      halal: 0,
      kosher: 0,
      nut_allergy: 0,
      dairy_free: 0,
      other: 0,
    },
    bySide: {
      partner1: 4,
      partner2: 3,
      mutual: 3,
    },
    ...overrides,
  };
}

function makeGuest(
  overrides: Partial<GuestWithPlusOnes> = {},
): GuestWithPlusOnes {
  return {
    id: "g-1",
    weddingId: "w-1",
    primaryGuestId: null,
    firstName: "Alice",
    lastName: "Smith",
    email: null,
    phone: null,
    side: "mutual",
    groupName: null,
    dietaryTags: [],
    dietaryNotes: null,
    rsvpStatus: "pending",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-10T00:00:00Z",
    plusOnes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GuestWidget", () => {
  it("renders summary stats when data is available", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.getByText("Guest List")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all/i })).toBeInTheDocument();
  });

  it("link points to /guests", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    const link = screen.getByRole("link", { name: /view all/i });
    expect(link).toHaveAttribute("href", "/guests");
  });

  it("renders loading state", () => {
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGuests>);

    const { container } = render(<GuestWidget weddingId="w-1" />);

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText("Guest List")).not.toBeInTheDocument();
  });

  it("renders empty state with CTA when totalGuests is 0", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 0 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(
      screen.getByText("Add guests one by one or import from a spreadsheet."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /add guests/i })).toHaveAttribute(
      "href",
      "/guests",
    );
  });

  it("shows an error state instead of the empty CTA when guests fail to load", () => {
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("guest summary down"),
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(
      screen.getByText("Guest list is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText("guest summary down")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /add guests/i }),
    ).not.toBeInTheDocument();
  });

  it("uses the guests query error when the summary query has no error", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
      error: undefined,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("guests down"),
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.queryByText("guests down")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the generic widget message for non-Error failures", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
      error: "summary down",
    } as unknown as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: "guests down",
    } as unknown as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
  });

  it("renders empty state with CTA when data is undefined", () => {
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(
      screen.getByText("Add guests one by one or import from a spreadsheet."),
    ).toBeInTheDocument();
  });

  it("shows Start here badge when showStartHere is true", () => {
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" showStartHere />);

    expect(screen.getByText("Start here")).toBeInTheDocument();
  });

  it("does not show Start here badge by default", () => {
    mockUseGuestSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.queryByText("Start here")).not.toBeInTheDocument();
  });

  it("shows confirmed count in green and pending in amber", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({
        byRsvp: { pending: 3, invited: 2, accepted: 4, declined: 1 },
      }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    const confirmedValue = screen.getByText("4");
    const pendingValue = screen.getByText("3");

    expect(confirmedValue).toBeInTheDocument();
    expect(pendingValue).toBeInTheDocument();
    expect(confirmedValue).toHaveClass("metric-emphasis--success");
    expect(pendingValue).toHaveClass("metric-emphasis--warning");
  });

  it("shows recent guests with name and RSVP badge", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuest({
        id: "g-1",
        firstName: "Alice",
        lastName: "Smith",
        rsvpStatus: "accepted",
        updatedAt: "2026-01-10T00:00:00Z",
      }),
      makeGuest({
        id: "g-2",
        firstName: "Bob",
        lastName: "Jones",
        rsvpStatus: "pending",
        updatedAt: "2026-01-09T00:00:00Z",
      }),
    ];

    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 2 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: guests,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("shows RSVP badge with correct color for invited status", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuest({
        id: "g-1",
        firstName: "Carol",
        lastName: "White",
        rsvpStatus: "invited",
      }),
    ];

    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 1 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: guests,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.getByText("Carol White")).toBeInTheDocument();
    const badge = screen.getByText("invited");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge.className).toContain("bg-info-soft");
  });

  it("shows RSVP badge for declined status", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuest({
        id: "g-1",
        firstName: "Dave",
        lastName: "Brown",
        rsvpStatus: "declined",
      }),
    ];

    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 1 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: guests,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.getByText("Dave Brown")).toBeInTheDocument();
    expect(screen.getByText("declined")).toBeInTheDocument();
  });

  it("limits recent guests to 5", () => {
    const guests: GuestWithPlusOnes[] = Array.from({ length: 7 }, (_, i) =>
      makeGuest({
        id: `g-${i}`,
        firstName: `Guest${i}`,
        lastName: "Test",
        updatedAt: `2026-01-${String(10 - i).padStart(2, "0")}T00:00:00Z`,
      }),
    );

    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 7 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: guests,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.getByText("Guest0 Test")).toBeInTheDocument();
    expect(screen.getByText("Guest4 Test")).toBeInTheDocument();
    expect(screen.queryByText("Guest5 Test")).not.toBeInTheDocument();
    expect(screen.queryByText("Guest6 Test")).not.toBeInTheDocument();
  });

  it("flattens plus-ones into the recent guests list", () => {
    const plusOne: GuestWithPlusOnes["plusOnes"][number] = {
      id: "po-1",
      weddingId: "w-1",
      primaryGuestId: "g-1",
      firstName: "PlusOne",
      lastName: "Person",
      email: null,
      phone: null,
      side: "mutual",
      groupName: null,
      dietaryTags: [],
      dietaryNotes: null,
      rsvpStatus: "accepted",
      sortOrder: 1,
      createdAt: "2026-01-05T00:00:00Z",
      updatedAt: "2026-01-15T00:00:00Z",
    };

    const guests: GuestWithPlusOnes[] = [
      makeGuest({
        id: "g-1",
        firstName: "Primary",
        lastName: "Guest",
        updatedAt: "2026-01-10T00:00:00Z",
        plusOnes: [plusOne],
      }),
    ];

    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 2 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: guests,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.getByText("Primary Guest")).toBeInTheDocument();
    expect(screen.getByText("PlusOne Person")).toBeInTheDocument();
  });

  it("sorts recent guests by updatedAt descending", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuest({
        id: "g-1",
        firstName: "Older",
        lastName: "Guest",
        updatedAt: "2026-01-01T00:00:00Z",
      }),
      makeGuest({
        id: "g-2",
        firstName: "Newer",
        lastName: "Guest",
        updatedAt: "2026-01-20T00:00:00Z",
      }),
    ];

    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 2 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: guests,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    const items = screen.getAllByText(/Guest/);
    // "Newer Guest" should appear before "Older Guest"
    const newerIdx = items.findIndex((el) => el.textContent === "Newer Guest");
    const olderIdx = items.findIndex((el) => el.textContent === "Older Guest");
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it("renders data state when guests data is undefined but summary has guests", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary({ totalGuests: 5 }),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<GuestWidget weddingId="w-1" />);

    expect(screen.getByText("Guest List")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("shows loading state when only guests hook is loading", () => {
    mockUseGuestSummary.mockReturnValue({
      data: makeSummary(),
      isLoading: false,
    } as ReturnType<typeof useGuestSummary>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGuests>);

    const { container } = render(<GuestWidget weddingId="w-1" />);

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText("Guest List")).not.toBeInTheDocument();
  });
});
