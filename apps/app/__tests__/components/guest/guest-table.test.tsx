// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Guest, GuestWithPlusOnes } from "@kaiplan/shared";
import { GuestTable } from "../../../src/components/guest/guest-table";

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    weddingId: "00000000-0000-0000-0000-000000000002",
    primaryGuestId: null,
    firstName: "Jane",
    lastName: "Doe",
    email: "jane@example.com",
    phone: "555-1234",
    side: "partner1",
    groupName: "Family",
    dietaryTags: [],
    dietaryNotes: null,
    rsvpStatus: "pending",
    sortOrder: 1,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeGuestWithPlusOnes(
  overrides: Partial<Guest> = {},
  plusOnes: Guest[] = [],
): GuestWithPlusOnes {
  return {
    ...makeGuest(overrides),
    plusOnes,
  };
}

const defaultProps = {
  onEdit: vi.fn(),
  onDeleteGuest: vi.fn(),
  onDeleteHousehold: vi.fn(),
  onAddPlusOne: vi.fn(),
  selectedIds: new Set<string>(),
  onToggleSelect: vi.fn(),
  onToggleSelectAll: vi.fn(),
};

describe("GuestTable", () => {
  it("renders guest rows showing guest names", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
      makeGuestWithPlusOnes({
        id: "00000000-0000-0000-0000-000000000003",
        firstName: "John",
        lastName: "Smith",
      }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("displays RSVP status badge", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ rsvpStatus: "accepted" }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    const badge = screen.getByText("Accepted");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-slot", "badge");
    expect(badge.className).toContain("bg-success-soft");
  });

  it("keeps guest email visible in the name cell without duplicate text", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ email: "jane@example.com" }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(screen.getByText("jane@example.com")).toHaveClass(
      "text-xs",
      "text-muted",
    );
  });

  it("shows plus-one count badge when guest has plus-ones", async () => {
    const user = userEvent.setup();
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
      email: "plus@example.com",
    });
    const guests: GuestWithPlusOnes[] = [makeGuestWithPlusOnes({}, [plusOne])];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(screen.getByText("+1")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Expand Jane Doe plus-ones" }),
    );
    expect(screen.getByText("plus@example.com")).toHaveClass(
      "text-xs",
      "text-muted",
    );
  });

  it("uses semantic destructive action styling for delete controls", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(screen.getByRole("button", { name: "Delete Jane Doe" })).toHaveClass(
      "action-icon-button",
      "action-icon-button--destructive",
    );
  });

  it("calls onEdit when edit button clicked", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} onEdit={onEdit} />);

    await user.click(screen.getByRole("button", { name: "Edit Jane Doe" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("opens a confirmation dialog before deleting a guest", async () => {
    const user = userEvent.setup();
    const onDeleteGuest = vi.fn();
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteGuest={onDeleteGuest}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    expect(screen.getByText("Delete Jane Doe?")).toBeInTheDocument();
    expect(onDeleteGuest).not.toHaveBeenCalled();
  });

  it("keeps the guest delete dialog open until the async delete resolves", async () => {
    const user = userEvent.setup();
    let resolveDelete: (() => void) | null = null;
    const onDeleteGuest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );

    render(
      <GuestTable
        guests={[makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" })]}
        {...defaultProps}
        onDeleteGuest={onDeleteGuest}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    await user.click(screen.getByRole("button", { name: "Delete guest" }));

    expect(onDeleteGuest).toHaveBeenCalledOnce();
    expect(screen.getByText("Delete Jane Doe?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete guest" })).toBeDisabled();

    resolveDelete?.();

    await waitFor(() =>
      expect(screen.queryByText("Delete Jane Doe?")).not.toBeInTheDocument(),
    );
  });

  it("keeps the guest delete dialog open and shows an error when delete fails", async () => {
    const user = userEvent.setup();
    const onDeleteGuest = vi.fn().mockRejectedValue(new Error("Delete failed"));

    render(
      <GuestTable
        guests={[makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" })]}
        {...defaultProps}
        onDeleteGuest={onDeleteGuest}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    await user.click(screen.getByRole("button", { name: "Delete guest" }));

    expect(await screen.findByText("Delete failed")).toBeInTheDocument();
    expect(screen.getByText("Delete Jane Doe?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete guest" }),
    ).not.toBeDisabled();
  });

  it("closes a pending guest delete dialog when the guest list changes away from the target", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <GuestTable
        guests={[makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" })]}
        {...defaultProps}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    expect(screen.getByText("Delete Jane Doe?")).toBeInTheDocument();

    rerender(
      <GuestTable
        guests={[
          makeGuestWithPlusOnes({
            id: "00000000-0000-0000-0000-000000000111",
            firstName: "Mia",
            lastName: "Cole",
          }),
        ]}
        {...defaultProps}
      />,
    );

    await waitFor(() =>
      expect(screen.queryByText("Delete Jane Doe?")).not.toBeInTheDocument(),
    );
  });

  it("calls onToggleSelect when checkbox clicked", async () => {
    const user = userEvent.setup();
    const onToggleSelect = vi.fn();
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onToggleSelect={onToggleSelect}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select Jane Doe" }));
    expect(onToggleSelect).toHaveBeenCalledOnce();
    expect(onToggleSelect).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
    );
  });

  it("shows empty state when guests array is empty", () => {
    render(<GuestTable guests={[]} {...defaultProps} />);

    expect(screen.getByText("No guests yet")).toBeInTheDocument();
  });

  it("displays all RSVP badge variants", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ id: "id-1", rsvpStatus: "pending" }),
      makeGuestWithPlusOnes({ id: "id-2", rsvpStatus: "invited" }),
      makeGuestWithPlusOnes({ id: "id-3", rsvpStatus: "accepted" }),
      makeGuestWithPlusOnes({ id: "id-4", rsvpStatus: "declined" }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  it("expands plus-ones when chevron is clicked", async () => {
    const user = userEvent.setup();
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    // Plus-one row should not be visible before expanding
    expect(screen.queryByText("Plus One")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Expand Jane Doe plus-ones" }),
    );

    expect(screen.getByText("Plus One")).toBeInTheDocument();
  });

  it("collapses plus-ones on second chevron click", async () => {
    const user = userEvent.setup();
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    const expandBtn = screen.getByRole("button", {
      name: "Expand Jane Doe plus-ones",
    });

    await user.click(expandBtn);
    expect(screen.getByText("Plus One")).toBeInTheDocument();

    await user.click(expandBtn);
    expect(screen.queryByText("Plus One")).not.toBeInTheDocument();
  });

  it("plus-one rows only show edit and delete actions (no add plus-one)", async () => {
    const user = userEvent.setup();
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    await user.click(
      screen.getByRole("button", { name: "Expand Jane Doe plus-ones" }),
    );

    expect(
      screen.getByRole("button", { name: "Edit Plus One" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Plus One" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add plus-one to Plus One" }),
    ).not.toBeInTheDocument();
  });

  it("calls onAddPlusOne when add plus-one button is clicked on primary guest", async () => {
    const user = userEvent.setup();
    const onAddPlusOne = vi.fn();
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onAddPlusOne={onAddPlusOne}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Add plus-one to Jane Doe" }),
    );
    expect(onAddPlusOne).toHaveBeenCalledOnce();
  });

  it("shows select-all checkbox in header", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(
      screen.getByRole("checkbox", { name: "Select all guests" }),
    ).toBeInTheDocument();
  });

  it("calls onToggleSelectAll when select-all checkbox clicked", async () => {
    const user = userEvent.setup();
    const onToggleSelectAll = vi.fn();
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onToggleSelectAll={onToggleSelectAll}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Select all guests" }),
    );
    expect(onToggleSelectAll).toHaveBeenCalledOnce();
  });

  it("shows guest as checked when in selectedIds", () => {
    const guestId = "00000000-0000-0000-0000-000000000001";
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({
        id: guestId,
        firstName: "Jane",
        lastName: "Doe",
      }),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        selectedIds={new Set([guestId])}
      />,
    );

    expect(
      screen.getByRole("checkbox", { name: "Select Jane Doe" }),
    ).toBeChecked();
  });

  it("renders dietary tag pills", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ dietaryTags: ["vegetarian", "gluten_free"] }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(screen.getByText("Veg")).toBeInTheDocument();
    expect(screen.getByText("GF")).toBeInTheDocument();
  });

  it("displays plus-two badge for two plus-ones", () => {
    const plusOne1 = makeGuest({
      id: "po-1",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const plusOne2 = makeGuest({
      id: "po-2",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "Two",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({}, [plusOne1, plusOne2]),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("calls onEdit with the guest object when edit is clicked", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const guest = makeGuestWithPlusOnes({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    });

    render(<GuestTable guests={[guest]} {...defaultProps} onEdit={onEdit} />);

    await user.click(screen.getByRole("button", { name: "Edit Jane Doe" }));
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: "Jane", lastName: "Doe" }),
    );
  });

  it("prompts before deleting a single primary guest", async () => {
    const user = userEvent.setup();
    const onDeleteGuest = vi.fn();
    const guestId = "00000000-0000-0000-0000-000000000001";
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({
        id: guestId,
        firstName: "Jane",
        lastName: "Doe",
      }),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteGuest={onDeleteGuest}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    expect(screen.getByText("Delete Jane Doe?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This will permanently remove Jane Doe from this wedding.",
      ),
    ).toBeInTheDocument();
    expect(onDeleteGuest).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete guest" }));
    expect(onDeleteGuest).toHaveBeenCalledWith(guestId);
  });

  it("calls onEdit with plus-one guest object when plus-one edit clicked", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const plusOneId = "00000000-0000-0000-0000-000000000010";
    const plusOne = makeGuest({
      id: plusOneId,
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(<GuestTable guests={guests} {...defaultProps} onEdit={onEdit} />);

    await user.click(
      screen.getByRole("button", { name: "Expand Jane Doe plus-ones" }),
    );

    await user.click(screen.getByRole("button", { name: "Edit Plus One" }));
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: plusOneId,
        firstName: "Plus",
        lastName: "One",
      }),
    );
  });

  it("prompts before deleting a plus-one guest", async () => {
    const user = userEvent.setup();
    const onDeleteGuest = vi.fn();
    const plusOneId = "00000000-0000-0000-0000-000000000010";
    const plusOne = makeGuest({
      id: plusOneId,
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteGuest={onDeleteGuest}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Expand Jane Doe plus-ones" }),
    );

    await user.click(screen.getByRole("button", { name: "Delete Plus One" }));
    expect(screen.getByText("Delete Plus One?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This will permanently remove Plus One from this wedding.",
      ),
    ).toBeInTheDocument();
    expect(onDeleteGuest).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete guest" }));
    expect(onDeleteGuest).toHaveBeenCalledWith(plusOneId);
  });

  it("closes the single-guest delete dialog when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onDeleteGuest = vi.fn();
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteGuest={onDeleteGuest}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    expect(screen.getByText("Delete Jane Doe?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Delete Jane Doe?")).not.toBeInTheDocument();
    expect(onDeleteGuest).not.toHaveBeenCalled();
  });

  it("keeps the single-guest delete dialog open until deletion resolves", async () => {
    const user = userEvent.setup();
    let resolveDelete: (() => void) | undefined;
    const onDeleteGuest = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteGuest={
          onDeleteGuest as unknown as (guestId: string) => void | Promise<void>
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    await user.click(screen.getByRole("button", { name: "Delete guest" }));

    expect(onDeleteGuest).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(screen.getByText("Delete Jane Doe?")).toBeInTheDocument();

    resolveDelete?.();
    await waitFor(() =>
      expect(screen.queryByText("Delete Jane Doe?")).not.toBeInTheDocument(),
    );
  });

  it("prompts before deleting a primary household with plus-ones", async () => {
    const user = userEvent.setup();
    const onDeleteHousehold = vi.fn();
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteHousehold={onDeleteHousehold}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));

    expect(
      screen.getByText("Delete household for Jane Doe?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This will delete Jane Doe and 1 plus-one."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete household" }));

    expect(onDeleteHousehold).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000001",
    );
  });

  it("uses household metadata when the filtered row omits plus-ones", async () => {
    const user = userEvent.setup();
    const onDeleteHousehold = vi.fn();
    const guestId = "00000000-0000-0000-0000-000000000001";
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes(
        { id: guestId, firstName: "Jane", lastName: "Doe" },
        [],
      ),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteHousehold={onDeleteHousehold}
        householdsWithPlusOnes={new Set([guestId])}
        householdPlusOneCounts={new Map([[guestId, 2]])}
      />,
    );

    expect(screen.getByText("+2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));

    expect(
      screen.getByText("This will delete Jane Doe and 2 plus-ones."),
    ).toBeInTheDocument();
  });

  it("closes the household delete dialog when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onDeleteHousehold = vi.fn();
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });

    render(
      <GuestTable
        guests={[
          makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [
            plusOne,
          ]),
        ]}
        {...defaultProps}
        onDeleteHousehold={onDeleteHousehold}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    expect(
      screen.getByText("Delete household for Jane Doe?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText("Delete household for Jane Doe?"),
    ).not.toBeInTheDocument();
    expect(onDeleteHousehold).not.toHaveBeenCalled();
  });

  it("closes the household delete dialog on escape", async () => {
    const user = userEvent.setup();
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });

    render(
      <GuestTable
        guests={[
          makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [
            plusOne,
          ]),
        ]}
        {...defaultProps}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    expect(
      screen.getByText("Delete household for Jane Doe?"),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByText("Delete household for Jane Doe?"),
    ).not.toBeInTheDocument();
  });

  it("shows a generic error message when guest delete throws a non-Error value", async () => {
    const user = userEvent.setup();
    const onDeleteGuest = vi.fn().mockRejectedValue("string error");

    render(
      <GuestTable
        guests={[makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" })]}
        {...defaultProps}
        onDeleteGuest={onDeleteGuest}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    await user.click(screen.getByRole("button", { name: "Delete guest" }));

    await waitFor(() =>
      expect(
        screen.getByText("Could not delete this guest."),
      ).toBeInTheDocument(),
    );
  });

  it("shows error message when household delete throws an Error instance", async () => {
    const user = userEvent.setup();
    const onDeleteHousehold = vi
      .fn()
      .mockRejectedValue(new Error("Server error"));
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteHousehold={onDeleteHousehold}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    await user.click(screen.getByRole("button", { name: "Delete household" }));

    await waitFor(() =>
      expect(screen.getByText("Server error")).toBeInTheDocument(),
    );
  });

  it("closes the single-guest delete dialog when Escape is pressed", async () => {
    const user = userEvent.setup();
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    expect(screen.getByText("Delete Jane Doe?")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByText("Delete Jane Doe?")).not.toBeInTheDocument(),
    );
  });

  it("closes the household delete dialog when the primary guest is removed from the list", async () => {
    const user = userEvent.setup();
    const guestId = "00000000-0000-0000-0000-000000000001";
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: guestId,
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes(
        { id: guestId, firstName: "Jane", lastName: "Doe" },
        [plusOne],
      ),
    ];

    const { rerender } = render(
      <GuestTable guests={guests} {...defaultProps} />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    expect(
      screen.getByText("Delete household for Jane Doe?"),
    ).toBeInTheDocument();

    // Remove Jane Doe from the guests list
    rerender(<GuestTable guests={[]} {...defaultProps} />);

    await waitFor(() =>
      expect(
        screen.queryByText("Delete household for Jane Doe?"),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows a generic error message when household delete throws a non-Error value", async () => {
    const user = userEvent.setup();
    const onDeleteHousehold = vi.fn().mockRejectedValue("string error");
    const plusOne = makeGuest({
      id: "00000000-0000-0000-0000-000000000010",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(
      <GuestTable
        guests={guests}
        {...defaultProps}
        onDeleteHousehold={onDeleteHousehold}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Delete Jane Doe" }));
    await user.click(screen.getByRole("button", { name: "Delete household" }));

    await waitFor(() =>
      expect(
        screen.getByText("Could not delete this household."),
      ).toBeInTheDocument(),
    );
  });

  it("shows no dietary pills when guest has no dietary tags", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ dietaryTags: [] }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    // None of the dietary short labels should appear
    expect(screen.queryByText("Veg")).not.toBeInTheDocument();
    expect(screen.queryByText("GF")).not.toBeInTheDocument();
  });

  it("shows the group placeholder when primary guest has no group", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ email: null, groupName: null }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(1);
  });

  it("shows the group placeholder when plus-one has no group", async () => {
    const user = userEvent.setup();
    const plusOne = makeGuest({
      id: "po-null-fields",
      primaryGuestId: "00000000-0000-0000-0000-000000000001",
      firstName: "Plus",
      lastName: "One",
      email: null,
      groupName: null,
    });
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({ firstName: "Jane", lastName: "Doe" }, [plusOne]),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    await user.click(
      screen.getByRole("button", { name: "Expand Jane Doe plus-ones" }),
    );

    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(1);
  });

  it("renders remaining dietary tag short labels", () => {
    const guests: GuestWithPlusOnes[] = [
      makeGuestWithPlusOnes({
        dietaryTags: [
          "vegan",
          "halal",
          "kosher",
          "nut_allergy",
          "dairy_free",
          "other",
        ],
      }),
    ];

    render(<GuestTable guests={guests} {...defaultProps} />);

    expect(screen.getByText("Vegan")).toBeInTheDocument();
    expect(screen.getByText("Halal")).toBeInTheDocument();
    expect(screen.getByText("Kosher")).toBeInTheDocument();
    expect(screen.getByText("Nut")).toBeInTheDocument();
    expect(screen.getByText("DF")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });
});
