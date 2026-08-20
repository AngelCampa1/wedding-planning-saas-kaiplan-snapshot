import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CountdownHero } from "../../../src/components/dashboard/countdown-hero";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const FAR_FUTURE = "2099-12-31";
const PAST_DATE = "2000-01-01";

describe("CountdownHero", () => {
  it("renders wedding name and days-to-go when date is set and future", () => {
    render(<CountdownHero weddingName="Ava & Sam" weddingDate={FAR_FUTURE} />);
    expect(screen.getByText("Ava & Sam")).toBeInTheDocument();
    expect(screen.getByText(/days to go/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/\d+ days to go/i)).toBeInTheDocument();
  });

  it("shows 'Today is the day.' when daysToGo is 0", () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const iso = `${year}-${month}-${day}`;
    render(<CountdownHero weddingName="Test Wedding" weddingDate={iso} />);
    expect(screen.getByText("Today is the day.")).toBeInTheDocument();
  });

  it("shows congratulations copy when daysToGo < 0", () => {
    render(
      <CountdownHero weddingName="Past Wedding" weddingDate={PAST_DATE} />,
    );
    expect(
      screen.getByText(/congratulations — you did it\./i),
    ).toBeInTheDocument();
  });

  it("does not render a raw negative number as countdown", () => {
    render(
      <CountdownHero weddingName="Past Wedding" weddingDate={PAST_DATE} />,
    );
    expect(screen.queryByText(/-\d+ days to go/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/-\d+ days to go/i)).not.toBeInTheDocument();
  });

  it("shows 'Your big day awaits' and a settings link when weddingDate is null", () => {
    render(<CountdownHero weddingName="No Date Wedding" weddingDate={null} />);
    expect(screen.getByText("Your big day awaits")).toBeInTheDocument();
    const link = screen.getByRole("link", {
      name: /set your wedding date to start the countdown/i,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/settings");
  });

  it("shows the same awaits prompt when weddingName is empty and date is null", () => {
    render(<CountdownHero weddingName="" weddingDate={null} />);
    expect(screen.getByText("Your big day awaits")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /set your wedding date to start the countdown/i,
      }),
    ).toBeInTheDocument();
  });

  // CSS class assertions (TDD for inline-style → utility-class refactor)
  it("applies text-kicker class to the 'days to go' kicker span", () => {
    render(<CountdownHero weddingName="Ava & Sam" weddingDate={FAR_FUTURE} />);
    const kicker = screen.getByText(/days to go/i);
    expect(kicker).toHaveClass("text-kicker");
  });

  it("applies rule-accent class to the horizontal accent rule next to 'days to go'", () => {
    const { container } = render(
      <CountdownHero weddingName="Ava & Sam" weddingDate={FAR_FUTURE} />,
    );
    const rule = container.querySelector("span[aria-hidden].h-px");
    expect(rule).not.toBeNull();
    expect(rule).toHaveClass("rule-accent");
  });

  it("applies rule-primary class to the vertical divider between number and name blocks", () => {
    const { container } = render(
      <CountdownHero weddingName="Ava & Sam" weddingDate={FAR_FUTURE} />,
    );
    const vertRule = container.querySelector("div[aria-hidden].w-px");
    expect(vertRule).not.toBeNull();
    expect(vertRule).toHaveClass("rule-primary");
  });

  it("applies heading-display class to the celebration paragraph (daysToGo <= 0)", () => {
    render(
      <CountdownHero weddingName="Past Wedding" weddingDate={PAST_DATE} />,
    );
    const celebration = screen.getByText(/congratulations — you did it\./i);
    expect(celebration).toHaveClass("heading-display");
  });

  it("applies heading-display class to the wedding name h2", () => {
    render(<CountdownHero weddingName="Ava & Sam" weddingDate={FAR_FUTURE} />);
    const heading = screen.getByRole("heading", { name: "Ava & Sam" });
    expect(heading).toHaveClass("heading-display");
  });
});
