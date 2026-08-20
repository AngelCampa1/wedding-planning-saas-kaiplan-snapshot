import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuestSummaryBar } from "../../../src/components/guest/guest-summary-bar";
import type { GuestSummary } from "@kaiplan/shared";

function makeSummary(overrides: Partial<GuestSummary> = {}): GuestSummary {
  return {
    totalGuests: 120,
    totalPrimary: 100,
    totalPlusOnes: 20,
    byRsvp: {
      accepted: 80,
      pending: 15,
      invited: 10,
      declined: 15,
    },
    byDietary: {
      vegetarian: 5,
      vegan: 2,
      gluten_free: 3,
      halal: 1,
      kosher: 0,
      nut_allergy: 1,
      dairy_free: 2,
      other: 0,
    },
    bySide: {
      partner1: 50,
      partner2: 50,
      mutual: 20,
    },
    ...overrides,
  };
}

describe("GuestSummaryBar", () => {
  it("renders the summary bar container", () => {
    render(<GuestSummaryBar summary={makeSummary()} />);
    expect(screen.getByTestId("guest-summary-bar")).toBeInTheDocument();
  });

  it("displays total guest count", () => {
    render(<GuestSummaryBar summary={makeSummary()} />);

    expect(screen.getByText("Total Guests")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("displays confirmed count from accepted rsvp", () => {
    render(<GuestSummaryBar summary={makeSummary()} />);

    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("displays pending count as sum of pending and invited", () => {
    render(<GuestSummaryBar summary={makeSummary()} />);

    expect(screen.getByText("Pending")).toBeInTheDocument();
    // pending=15 + invited=10 = 25
    expect(screen.getByText("25")).toBeInTheDocument();
  });

  it("displays declined count", () => {
    render(<GuestSummaryBar summary={makeSummary()} />);

    expect(screen.getByText("Declined")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("renders with zero counts", () => {
    render(
      <GuestSummaryBar
        summary={makeSummary({
          totalGuests: 0,
          byRsvp: {
            accepted: 0,
            pending: 0,
            invited: 0,
            declined: 0,
          },
        })}
      />,
    );

    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBeGreaterThanOrEqual(4);
  });

  it("correctly sums pending + invited for different values", () => {
    render(
      <GuestSummaryBar
        summary={makeSummary({
          byRsvp: {
            accepted: 50,
            pending: 30,
            invited: 20,
            declined: 5,
          },
        })}
      />,
    );

    // pending=30 + invited=20 = 50
    const fifties = screen.getAllByText("50");
    expect(fifties.length).toBeGreaterThanOrEqual(2);
  });
});
