import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const restartTour = vi.fn();
const toggleHelpMode = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../src/components/guidance/tour-provider", () => ({
  useTour: () => ({
    helpMode: false,
    restartTour,
    toggleHelpMode,
  }),
}));

import { HelpPage } from "../../src/routes/_authenticated/help";

describe("HelpPage", () => {
  it("renders guidance topics and restarts the dashboard tour", async () => {
    const user = userEvent.setup();
    render(<HelpPage />);

    expect(
      screen.getByRole("heading", {
        name: "Find your next step without guessing.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Moving from a spreadsheet")).toBeInTheDocument();
    expect(
      screen.getByText("Wedding website and invite links"),
    ).toBeInTheDocument();
    expect(screen.getByText("I’m just starting")).toBeInTheDocument();
    expect(screen.getByText("I’m worried about budget")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Publish live only when the details are ready for guests.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Why this matters:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Next step:/).length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "Restart dashboard tour" }),
    );
    expect(restartTour).toHaveBeenCalledWith("dashboard");

    await user.click(screen.getByRole("button", { name: "Turn on Help mode" }));
    expect(toggleHelpMode).toHaveBeenCalled();
  });
});
