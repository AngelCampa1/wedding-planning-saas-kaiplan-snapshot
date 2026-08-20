import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../../src/lib/auth-client", () => ({
  authClient: {
    signOut: mocks.signOut,
  },
}));

import { queryClient } from "../../src/lib/query-client";
import { UserMenu } from "../../src/components/user-menu";

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user initials in the toggle button", () => {
    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );
    expect(screen.getByRole("button", { name: "User menu" })).toHaveTextContent(
      "AC",
    );
  });

  it("handles single-word names for initials", () => {
    render(<UserMenu user={{ name: "Mononym", email: "mono@example.com" }} />);
    expect(screen.getByRole("button", { name: "User menu" })).toHaveTextContent(
      "M",
    );
  });

  it("opens the dropdown when the toggle button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("angel@example.com")).toBeInTheDocument();
  });

  it("navigates to settings and closes menu when Settings is clicked", async () => {
    const user = userEvent.setup();

    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );

    await user.click(screen.getByRole("button", { name: "User menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Settings" }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/settings" });
    // Menu should be closed after clicking settings
    await waitFor(() => {
      expect(
        screen.queryByRole("menuitem", { name: "Settings" }),
      ).not.toBeInTheDocument();
    });
  });

  it("navigates to help when Help is clicked", async () => {
    const user = userEvent.setup();

    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );

    await user.click(screen.getByRole("button", { name: "User menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Help" }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/help" });
  });

  it("closes the menu when Escape key is pressed", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );
    await user.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByText("Settings")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    });
  });

  it("has aria-haspopup='menu' on the trigger button", () => {
    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );
    expect(screen.getByRole("button", { name: "User menu" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("renders a menu with menuitems when open", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );
    await user.click(screen.getByRole("button", { name: "User menu" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("uses the destructive variant on the Sign out item (no raw text-red-600)", async () => {
    const user = userEvent.setup();
    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );
    await user.click(screen.getByRole("button", { name: "User menu" }));
    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOut).toHaveAttribute("data-variant", "destructive");
    expect(signOut.className).not.toMatch(/text-red-\d/);
  });

  it("shows '?' fallback when user name is empty", () => {
    render(<UserMenu user={{ name: "", email: "empty@example.com" }} />);
    expect(screen.getByRole("button", { name: "User menu" })).toHaveTextContent(
      "?",
    );
  });

  it("clears cached queries before navigating away on sign out", async () => {
    const user = userEvent.setup();
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined);
    const clearSpy = vi.spyOn(queryClient, "clear");

    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );

    await user.click(screen.getByRole("button", { name: "User menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalled();
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login" });
    });
  });

  it("still clears cache and navigates to /login even if signOut rejects", async () => {
    const user = userEvent.setup();
    // signOut rejects — try/catch/finally in handleSignOut must still run the finally block
    mocks.signOut.mockRejectedValue(new Error("signOut network error"));
    const cancelSpy = vi
      .spyOn(queryClient, "cancelQueries")
      .mockResolvedValue(undefined);
    const clearSpy = vi.spyOn(queryClient, "clear");

    render(
      <UserMenu user={{ name: "Angel Campa", email: "angel@example.com" }} />,
    );

    await user.click(screen.getByRole("button", { name: "User menu" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() => {
      expect(clearSpy).toHaveBeenCalledTimes(1);
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login" });
    });

    cancelSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
