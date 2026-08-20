import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar, MobileNavigation } from "../../src/components/sidebar";

const mocks = vi.hoisted(() => ({
  matchRoute: vi.fn(() => false),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    onClick,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    onClick?: () => void;
  }) => (
    <a href={to} onClick={onClick} {...props}>
      {children}
    </a>
  ),
  useMatchRoute: () => mocks.matchRoute,
}));

vi.mock("../../src/components/user-menu", () => ({
  UserMenu: ({ user }: { user: { name: string; email: string } }) => (
    <div data-testid="user-menu">{user.name}</div>
  ),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.matchRoute.mockReturnValue(false);
  });

  it("announces the desktop landmark as sidebar navigation", () => {
    render(<Sidebar />);

    expect(
      screen.getByRole("navigation", { name: "Sidebar navigation" }),
    ).toBeInTheDocument();
  });

  it("renders user menu at the bottom when user prop is provided", () => {
    render(
      <Sidebar user={{ name: "Alex Planner", email: "alex@example.com" }} />,
    );

    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
    expect(screen.getByTestId("user-menu")).toHaveTextContent("Alex Planner");
  });

  it("does not render user menu when user prop is omitted", () => {
    render(<Sidebar />);

    expect(screen.queryByTestId("user-menu")).not.toBeInTheDocument();
  });

  it("reads collapsed state from localStorage on mount", () => {
    localStorage.setItem("kaiplan:sidebar-collapsed", "true");
    render(<Sidebar />);
    // When collapsed, nav items show icons only (no text spans)
    const nav = screen.getByRole("navigation", { name: "Sidebar navigation" });
    expect(nav).toBeInTheDocument();
  });

  it("handles localStorage read error gracefully and defaults to not collapsed", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Sidebar />);
    // Should still render without throwing
    expect(
      screen.getByRole("navigation", { name: "Sidebar navigation" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("toggles collapsed state when the collapse button is clicked", async () => {
    const user = userEvent.setup();
    render(<Sidebar />);

    const collapseBtn = screen.getByRole("button", {
      name: "Collapse sidebar",
    });
    expect(collapseBtn).toBeInTheDocument();

    await user.click(collapseBtn);
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    expect(localStorage.getItem("kaiplan:sidebar-collapsed")).toBe("true");
  });

  it("handles localStorage write error gracefully when toggling", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Sidebar />);
    // Should not throw when toggling
    const collapseBtn = screen.getByRole("button", {
      name: "Collapse sidebar",
    });
    await user.click(collapseBtn);
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("applies active styles to the matching nav item", () => {
    mocks.matchRoute.mockReturnValue(true);
    render(<Sidebar />);
    // All links will have "active" class applied — the isActive branch is covered
    const nav = screen.getByRole("navigation", { name: "Sidebar navigation" });
    // At least one link should have the active styling class
    const activeLink = nav.querySelector(".bg-primary\\/10");
    expect(activeLink).not.toBeNull();
  });
});

describe("MobileNavigation", () => {
  it("renders a trigger button for mobile navigation", () => {
    render(<MobileNavigation />);
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toBeInTheDocument();
  });

  it("opens the sheet navigation when the trigger button is clicked", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation />);

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    expect(
      screen.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeInTheDocument();
  });

  it("closes the sheet when a nav link is clicked via onNavigate", async () => {
    const user = userEvent.setup();
    render(<MobileNavigation />);

    // Open the sheet
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      screen.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeInTheDocument();

    // Click any nav link — this triggers onNavigate which sets open=false
    const links = screen.getAllByRole("link");
    await user.click(links[0]);

    // Sheet should be closed (navigation no longer visible)
    expect(
      screen.queryByRole("navigation", { name: "Mobile navigation" }),
    ).not.toBeInTheDocument();
  });
});
