import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeatingWidget } from "../../../src/components/seating/seating-widget";
import type { GetSeatingResponse, GuestWithPlusOnes } from "@kaiplan/shared";

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

vi.mock("../../../src/hooks/use-seating", () => ({
  useSeatingChart: vi.fn(),
}));

vi.mock("../../../src/hooks/use-guests", () => ({
  useGuests: vi.fn(),
}));

import { useGuests } from "../../../src/hooks/use-guests";
import { useSeatingChart } from "../../../src/hooks/use-seating";

const mockUseSeatingChart = vi.mocked(useSeatingChart);
const mockUseGuests = vi.mocked(useGuests);

function makeSeatingResponse(
  overrides: Partial<GetSeatingResponse> = {},
): GetSeatingResponse {
  return {
    chart: {
      width: 1200,
      height: 800,
      tables: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Table 1",
          shape: "round",
          capacity: 4,
          x: 100,
          y: 120,
          seats: [
            {
              id: "21111111-1111-4111-8111-111111111111",
              positionIndex: 0,
              guestId: "31111111-1111-4111-8111-111111111111",
            },
            {
              id: "21111111-1111-4111-8111-111111111112",
              positionIndex: 1,
              guestId: "31111111-1111-4111-8111-111111111112",
            },
            {
              id: "21111111-1111-4111-8111-111111111113",
              positionIndex: 2,
            },
            {
              id: "21111111-1111-4111-8111-111111111114",
              positionIndex: 3,
            },
          ],
        },
      ],
    },
    summary: {
      tableCount: 1,
      seatCount: 4,
      assignedSeatCount: 2,
      unassignedSeatCount: 2,
    },
    ...overrides,
  };
}

function makeGuest(
  overrides: Partial<GuestWithPlusOnes> = {},
): GuestWithPlusOnes {
  return {
    id: "31111111-1111-4111-8111-111111111111",
    weddingId: "w-1",
    primaryGuestId: null,
    firstName: "Alex",
    lastName: "Rivera",
    email: null,
    phone: null,
    side: "mutual",
    groupName: null,
    dietaryTags: [],
    dietaryNotes: null,
    rsvpStatus: "accepted",
    sortOrder: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    plusOnes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeatingWidget", () => {
  it("renders loading state", () => {
    mockUseSeatingChart.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGuests>);

    const { container } = render(<SeatingWidget weddingId="w-1" />);

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders loading state when only guests are still loading", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse(),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useGuests>);

    const { container } = render(<SeatingWidget weddingId="w-1" />);

    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("renders empty state with CTA when no chart and no guests exist", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse({
        chart: { width: 1200, height: 800, tables: [] },
        summary: {
          tableCount: 0,
          seatCount: 0,
          assignedSeatCount: 0,
          unassignedSeatCount: 0,
        },
      }),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(
      screen.getByText(
        "Arrange tables and assign guests once your list is ready.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open seating chart/i }),
    ).toHaveAttribute("href", "/seating");
  });

  it("shows an error state instead of the empty CTA when seating fails to load", () => {
    mockUseSeatingChart.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("seating is down"),
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(
      screen.getByText("Seating data is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText("seating is down")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /open seating chart/i }),
    ).not.toBeInTheDocument();
  });

  it("uses the guests query error when seating has no error", () => {
    mockUseSeatingChart.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
      error: new Error("guests are down"),
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(screen.queryByText("guests are down")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the generic widget message for non-Error failures", () => {
    mockUseSeatingChart.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: "seating down",
    } as unknown as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
      error: "guests down",
    } as unknown as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(
      screen.getByText(
        "Refresh the page and try again. If the problem continues, contact support.",
      ),
    ).toBeInTheDocument();
  });

  it("shows Start here badge when showStartHere is true", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse({
        chart: { width: 1200, height: 800, tables: [] },
        summary: {
          tableCount: 0,
          seatCount: 0,
          assignedSeatCount: 0,
          unassignedSeatCount: 0,
        },
      }),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" showStartHere />);

    expect(screen.getByText("Start here")).toBeInTheDocument();
  });

  it("does not show Start here badge by default", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse({
        chart: { width: 1200, height: 800, tables: [] },
        summary: {
          tableCount: 0,
          seatCount: 0,
          assignedSeatCount: 0,
          unassignedSeatCount: 0,
        },
      }),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(screen.queryByText("Start here")).not.toBeInTheDocument();
  });

  it("falls back to zeroed counts when seating data has not loaded yet", () => {
    mockUseSeatingChart.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [makeGuest()],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(screen.getByText("Seating")).toBeInTheDocument();
    expect(screen.getByText("Seated").nextElementSibling).toHaveTextContent(
      "0",
    );
    expect(screen.getByText("Unseated").nextElementSibling).toHaveTextContent(
      "1",
    );
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });

  it("renders seating stats and link", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse(),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [
        makeGuest(),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111112",
          firstName: "Sam",
        }),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111113",
          firstName: "Taylor",
          rsvpStatus: "pending",
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(screen.getByText("Seating")).toBeInTheDocument();
    expect(screen.getByText("Seated").nextElementSibling).toHaveTextContent(
      "2",
    );
    expect(screen.getByText("Unseated").nextElementSibling).toHaveTextContent(
      "1",
    );
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open chart/i })).toHaveAttribute(
      "href",
      "/seating",
    );
  });

  it("uses semantic warning styling for unseated accepted guests", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse({
        chart: {
          width: 1200,
          height: 800,
          tables: [
            {
              id: "table-1",
              name: "Table 1",
              shape: "round",
              capacity: 2,
              x: 100,
              y: 120,
              seats: [
                {
                  id: "seat-1",
                  positionIndex: 0,
                  guestId: "31111111-1111-4111-8111-111111111111",
                },
                { id: "seat-2", positionIndex: 1 },
              ],
            },
          ],
        },
        summary: {
          tableCount: 1,
          seatCount: 2,
          assignedSeatCount: 1,
          unassignedSeatCount: 1,
        },
      }),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [
        makeGuest(),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111112",
          firstName: "Sam",
          rsvpStatus: "accepted",
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    const warning = screen
      .getByText(/accepted guest remains unseated/i)
      .closest("div");
    expect(warning).toHaveClass("feedback-banner", "feedback-banner--warning");
  });

  it("warns when accepted guests remain unseated", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse(),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [
        makeGuest(),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111112",
          firstName: "Sam",
        }),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111113",
          firstName: "Jordan",
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(
      screen.getByText("1 accepted guest remains unseated."),
    ).toBeInTheDocument();
  });

  it("renders plural wording when multiple accepted guests remain unseated", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse(),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [
        makeGuest(),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111112",
          firstName: "Sam",
        }),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111113",
          firstName: "Taylor",
        }),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111114",
          firstName: "Jordan",
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(
      screen.getByText("2 accepted guests remain unseated."),
    ).toBeInTheDocument();
  });

  it("counts plus-ones when they are not seated", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse(),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [
        makeGuest({
          id: "31111111-1111-4111-8111-111111111111",
          firstName: "Alex",
          plusOnes: [
            {
              ...makeGuest({
                id: "31111111-1111-4111-8111-111111111115",
                firstName: "Pat",
                rsvpStatus: "accepted",
              }),
              primaryGuestId: "31111111-1111-4111-8111-111111111111",
            },
          ],
        }),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111112",
          firstName: "Sam",
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(screen.getByText("Unseated").nextElementSibling).toHaveTextContent(
      "1",
    );
    expect(
      screen.getByText("1 accepted guest remains unseated."),
    ).toBeInTheDocument();
  });

  it("ignores declined guests in unseated counts", () => {
    mockUseSeatingChart.mockReturnValue({
      data: makeSeatingResponse(),
      isLoading: false,
    } as ReturnType<typeof useSeatingChart>);
    mockUseGuests.mockReturnValue({
      data: [
        makeGuest(),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111112",
          firstName: "Sam",
        }),
        makeGuest({
          id: "31111111-1111-4111-8111-111111111113",
          firstName: "Morgan",
          rsvpStatus: "declined",
        }),
      ],
      isLoading: false,
    } as ReturnType<typeof useGuests>);

    render(<SeatingWidget weddingId="w-1" />);

    expect(screen.getByText("Unseated").nextElementSibling).toHaveTextContent(
      "0",
    );
    expect(
      screen.queryByText(/accepted guest remains unseated/i),
    ).not.toBeInTheDocument();
  });
});
