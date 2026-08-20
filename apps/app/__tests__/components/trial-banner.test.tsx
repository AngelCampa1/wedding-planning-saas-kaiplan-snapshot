import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TRIAL_DURATION_DAYS } from "@kaiplan/shared";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { TrialBanner } from "../../src/components/trial-banner";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    children?: ReactNode;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("TrialBanner", () => {
  it("renders nothing when days is null", () => {
    const { container } = render(<TrialBanner days={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a success banner when days >= 10", () => {
    render(<TrialBanner days={20} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveClass("bg-success-soft");
    expect(
      screen.getByText(
        new RegExp(`${TRIAL_DURATION_DAYS}-day free trial is active`),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/20 days remaining/)).toBeInTheDocument();
  });

  it("includes a Choose a plan link in the success banner", () => {
    render(<TrialBanner days={20} />);
    const link = screen.getByRole("link", { name: "Choose a plan" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/subscribe");
  });

  it("renders a success banner when days is exactly 10", () => {
    render(<TrialBanner days={10} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-success-soft");
    expect(
      screen.getByText(
        new RegExp(`${TRIAL_DURATION_DAYS}-day free trial is active`),
      ),
    ).toBeInTheDocument();
  });

  it("renders a warning banner when days is 6", () => {
    render(<TrialBanner days={6} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveClass("bg-warning-soft");
    expect(
      screen.getByText(/Your free trial ends in 6 days/),
    ).toBeInTheDocument();
  });

  it("renders a warning banner when days is exactly 9 (success/warning boundary)", () => {
    render(<TrialBanner days={9} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-warning-soft");
    expect(
      screen.getByText(/Your free trial ends in 9 days/),
    ).toBeInTheDocument();
  });

  it("renders a warning banner when days is exactly 3", () => {
    render(<TrialBanner days={3} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-warning-soft");
    expect(
      screen.getByText(/Your free trial ends in 3 days/),
    ).toBeInTheDocument();
  });

  it("includes a Choose a plan link in the warning banner", () => {
    render(<TrialBanner days={6} />);
    const link = screen.getByRole("link", { name: /Choose a plan/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/subscribe");
  });

  it("renders an urgent banner with 'Your trial ends in 2 days' when days is 2", () => {
    render(<TrialBanner days={2} />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveClass("bg-destructive/8");
    expect(screen.getByText("Your trial ends in 2 days.")).toBeInTheDocument();
  });

  it("renders an urgent banner with 'tomorrow' when days is 1", () => {
    render(<TrialBanner days={1} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-destructive/8");
    expect(screen.getByText("Your trial ends tomorrow.")).toBeInTheDocument();
  });

  it("renders an urgent banner with 'today' when days is 0", () => {
    render(<TrialBanner days={0} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("bg-destructive/8");
    expect(screen.getByText("Your trial ends today.")).toBeInTheDocument();
  });

  it("includes a Subscribe now link in the urgent banner", () => {
    render(<TrialBanner days={0} />);
    const link = screen.getByRole("link", { name: "Subscribe now" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/subscribe");
  });
});
