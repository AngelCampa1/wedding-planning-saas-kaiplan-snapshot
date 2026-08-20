import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickActions } from "../../../src/components/dashboard/quick-actions";

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...original, useNavigate: () => mockNavigate };
});

describe("QuickActions", () => {
  it("renders all three action buttons", () => {
    render(<QuickActions />);
    expect(
      screen.getByRole("button", { name: /add guest/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit website/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /go to seating/i }),
    ).toBeInTheDocument();
  });

  it("navigates to /guests when Add Guest is clicked", async () => {
    const user = userEvent.setup();
    render(<QuickActions />);
    await user.click(screen.getByRole("button", { name: /add guest/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/guests" });
  });

  it("navigates to /website when Edit Website is clicked", async () => {
    const user = userEvent.setup();
    render(<QuickActions />);
    await user.click(screen.getByRole("button", { name: /edit website/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/website" });
  });

  it("navigates to /seating when Go to Seating is clicked", async () => {
    const user = userEvent.setup();
    render(<QuickActions />);
    await user.click(screen.getByRole("button", { name: /go to seating/i }));
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/seating" });
  });
});
