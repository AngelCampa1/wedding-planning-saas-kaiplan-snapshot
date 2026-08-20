import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopBar, TopBarHelpActions } from "../../src/components/top-bar";

const tourState = vi.hoisted(() => ({
  value: null as null | { helpMode: boolean; toggleHelpMode: () => void },
}));

vi.mock("../../src/components/wedding-picker", () => ({
  WeddingPicker: () => <div>Wedding picker</div>,
}));

vi.mock("../../src/components/user-menu", () => ({
  UserMenu: () => <div>User menu</div>,
}));

vi.mock("../../src/components/guidance/tour-provider", () => ({
  useOptionalTour: () => tourState.value,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useMatchRoute: () => () => false,
}));

describe("TopBar", () => {
  it("stays focused on wedding switching and account access", () => {
    tourState.value = null;
    render(
      <TopBar
        user={{ name: "Manual QA", email: "qa@example.com" }}
        weddings={[]}
        activeWeddingId="wedding-1"
        onSelectWedding={() => {}}
      />,
    );

    expect(screen.getByText("Wedding picker")).toBeInTheDocument();
    expect(screen.getByText("User menu")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Turn on Help mode" }),
    ).toBeDisabled();
    expect(screen.getByRole("link", { name: "Open help" })).toHaveAttribute(
      "href",
      "/help",
    );
  });

  it("toggles help mode from the top bar when tour context is present", async () => {
    const user = userEvent.setup();
    const toggleHelpMode = vi.fn();
    tourState.value = { helpMode: true, toggleHelpMode };

    render(
      <TopBar
        user={{ name: "Manual QA", email: "qa@example.com" }}
        weddings={[]}
        activeWeddingId="wedding-1"
        onSelectWedding={() => {}}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Turn off Help mode" }),
    );
    expect(toggleHelpMode).toHaveBeenCalledTimes(1);
  });

  it("shows the inactive help-mode affordance when tour context is present", async () => {
    const user = userEvent.setup();
    const toggleHelpMode = vi.fn();
    tourState.value = { helpMode: false, toggleHelpMode };

    render(
      <TopBar
        user={{ name: "Manual QA", email: "qa@example.com" }}
        weddings={[]}
        activeWeddingId="wedding-1"
        onSelectWedding={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Turn on Help mode" }));

    expect(toggleHelpMode).toHaveBeenCalledTimes(1);
  });

  it("can render compact help actions for mobile headers", async () => {
    const user = userEvent.setup();
    const toggleHelpMode = vi.fn();
    tourState.value = { helpMode: false, toggleHelpMode };

    render(<TopBarHelpActions compact />);

    await user.click(screen.getByRole("button", { name: "Turn on Help mode" }));

    expect(toggleHelpMode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Open help" })).toHaveAttribute(
      "href",
      "/help",
    );
  });
});
