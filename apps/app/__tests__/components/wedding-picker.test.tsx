import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WeddingPicker } from "../../src/components/wedding-picker";
import type { WeddingWithRole } from "@kaiplan/shared";

const wedding1: WeddingWithRole = {
  id: "wedding-1",
  name: "Angel & Sam",
  role: "owner",
  status: "planning",
  date: null,
  slug: null,
  publishedSlug: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const wedding2: WeddingWithRole = {
  id: "wedding-2",
  name: "Mia & Noah",
  role: "editor",
  status: "planning",
  date: null,
  slug: null,
  publishedSlug: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("WeddingPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders only a span (no button) when there is a single wedding", () => {
    render(
      <WeddingPicker
        weddings={[wedding1]}
        activeWeddingId="wedding-1"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Angel & Sam")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select wedding" }),
    ).not.toBeInTheDocument();
  });

  it("renders only a span when the weddings list is empty", () => {
    render(
      <WeddingPicker weddings={[]} activeWeddingId="" onSelect={vi.fn()} />,
    );

    expect(screen.getByText("No wedding yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select wedding" }),
    ).not.toBeInTheDocument();
  });

  it("renders a toggle button when there are multiple weddings", () => {
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-1"
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Select wedding" }),
    ).toBeInTheDocument();
  });

  it("shows the active wedding name in the toggle button", () => {
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-2"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Mia & Noah")).toBeInTheDocument();
  });

  it("falls back to first wedding name when activeWeddingId does not match any wedding", () => {
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-unknown"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Angel & Sam")).toBeInTheDocument();
  });

  it("opens the dropdown menu when the toggle button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-1"
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select wedding" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Mia & Noah")).toBeInTheDocument();
  });

  it("closes the dropdown menu when a wedding is selected", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-1"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select wedding" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByText("Mia & Noah"));

    expect(onSelect).toHaveBeenCalledWith("wedding-2");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls onSelect and closes dropdown when an option is chosen", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-1"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select wedding" }));
    await user.click(screen.getByText("Mia & Noah"));

    expect(onSelect).toHaveBeenCalledWith("wedding-2");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows all wedding options in the dropdown", async () => {
    const user = userEvent.setup();
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-1"
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select wedding" }));

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(2);
  });

  it("closes the dropdown when the user presses Escape", async () => {
    const user = userEvent.setup();
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-1"
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select wedding" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows the role badge for each wedding option", async () => {
    const user = userEvent.setup();
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-1"
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select wedding" }));

    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
  });

  it("applies active styling to the currently selected wedding", async () => {
    const user = userEvent.setup();
    render(
      <WeddingPicker
        weddings={[wedding1, wedding2]}
        activeWeddingId="wedding-1"
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Select wedding" }));

    const items = screen.getAllByRole("menuitem");
    const activeItem = items.find((item) =>
      item.className.includes("bg-primary/5"),
    );
    expect(activeItem).toHaveTextContent("Angel & Sam");
  });
});
