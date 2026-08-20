// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Guest } from "@kaiplan/shared";
import { GuestForm } from "../../../src/components/guest/guest-form";

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
    dietaryTags: ["vegetarian"],
    dietaryNotes: "No onions",
    rsvpStatus: "accepted",
    sortOrder: 1,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function getSubmitButton(name: string) {
  return screen.getAllByRole("button", { name })[0];
}

describe("GuestForm", () => {
  it("renders empty form in create mode with 'Add Guest' button", () => {
    render(
      <GuestForm onSubmit={() => {}} onCancel={() => {}} existingGroups={[]} />,
    );

    expect(screen.getByLabelText("First Name")).toHaveValue("");
    expect(screen.getByLabelText("Last Name")).toHaveValue("");
    expect(getSubmitButton("Add Guest")).toBeInTheDocument();
  });

  it("stacks the paired text inputs on small screens before switching to two columns", () => {
    render(
      <GuestForm onSubmit={() => {}} onCancel={() => {}} existingGroups={[]} />,
    );

    const nameRow = screen.getByTestId("guest-name-fields");
    const contactRow = screen.getByTestId("guest-contact-fields");

    expect(nameRow.className).toContain("grid-cols-1");
    expect(nameRow.className).toContain("sm:grid-cols-2");
    expect(contactRow.className).toContain("grid-cols-1");
    expect(contactRow.className).toContain("sm:grid-cols-2");
  });

  it("renders populated form in edit mode with 'Save Changes' button", () => {
    const guest = makeGuest();
    render(
      <GuestForm
        guest={guest}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={["Family", "Friends"]}
      />,
    );

    expect(screen.getByLabelText("First Name")).toHaveValue("Jane");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Doe");
    expect(getSubmitButton("Save Changes")).toBeInTheDocument();
  });

  it("resets the form when switching from one guest to another", () => {
    const { rerender } = render(
      <GuestForm
        guest={makeGuest({
          firstName: "Jane",
          lastName: "Doe",
          side: "partner1",
        })}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={["Family", "Friends"]}
      />,
    );

    rerender(
      <GuestForm
        guest={makeGuest({
          id: "00000000-0000-0000-0000-000000000009",
          firstName: "Mia",
          lastName: "Cole",
          side: "partner2",
        })}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={["Family", "Friends"]}
      />,
    );

    expect(screen.getByLabelText("First Name")).toHaveValue("Mia");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Cole");
    expect(screen.getByRole("button", { name: "Partner 2" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("clears stale edit values when reopening in add plus-one mode", () => {
    const { rerender } = render(
      <GuestForm
        guest={makeGuest({
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@example.com",
        })}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={["Family", "Friends"]}
      />,
    );

    rerender(
      <GuestForm
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={["Family", "Friends"]}
        primaryGuestId="00000000-0000-0000-0000-000000000003"
        defaultSide="partner2"
      />,
    );

    expect(screen.getByLabelText("First Name")).toHaveValue("");
    expect(screen.getByLabelText("Last Name")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(getSubmitButton("Add Plus-One")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Partner 2" })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  it("preserves in-progress edits when the same guest rerenders", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <GuestForm
        guest={makeGuest({
          id: "00000000-0000-0000-0000-000000000010",
          firstName: "Jane",
          lastName: "Doe",
        })}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={["Family", "Friends"]}
      />,
    );

    await user.clear(screen.getByLabelText("First Name"));
    await user.type(screen.getByLabelText("First Name"), "Edited");

    rerender(
      <GuestForm
        guest={makeGuest({
          id: "00000000-0000-0000-0000-000000000010",
          firstName: "Jane",
          lastName: "Doe",
        })}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={["Family", "Friends"]}
      />,
    );

    expect(screen.getByLabelText("First Name")).toHaveValue("Edited");
  });

  it("resets to persisted values when the same guest form is reopened", async () => {
    const user = userEvent.setup();
    const guest = makeGuest({
      id: "00000000-0000-0000-0000-000000000013",
      firstName: "Persisted",
      lastName: "Guest",
    });
    const { rerender } = render(
      <GuestForm
        guest={guest}
        isOpen={true}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
      />,
    );

    await user.clear(screen.getByLabelText("First Name"));
    await user.type(screen.getByLabelText("First Name"), "Draft");
    expect(screen.getByLabelText("First Name")).toHaveValue("Draft");

    rerender(
      <GuestForm
        guest={guest}
        isOpen={false}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
      />,
    );

    rerender(
      <GuestForm
        guest={guest}
        isOpen={true}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
      />,
    );

    expect(screen.getByLabelText("First Name")).toHaveValue("Persisted");
  });

  it("keeps the edit CTA when editing an existing plus-one", () => {
    const guest = makeGuest({
      primaryGuestId: "00000000-0000-0000-0000-000000000003",
    });
    render(
      <GuestForm
        guest={guest}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={["Family", "Friends"]}
        primaryGuestId="00000000-0000-0000-0000-000000000003"
      />,
    );

    expect(getSubmitButton("Save Changes")).toBeInTheDocument();
  });

  it("calls onSubmit with form data when submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm onSubmit={onSubmit} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit).toHaveBeenCalledOnce();
    const call = onSubmit.mock.calls[0][0];
    expect(call.firstName).toBe("Alice");
    expect(call.lastName).toBe("Smith");
  });

  it("calls onCancel when cancel clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <GuestForm onSubmit={() => {}} onCancel={onCancel} existingGroups={[]} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows 'Add Plus-One' as submit label when primaryGuestId is set", () => {
    render(
      <GuestForm
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
        primaryGuestId="00000000-0000-0000-0000-000000000003"
      />,
    );

    expect(getSubmitButton("Add Plus-One")).toBeInTheDocument();
  });

  it("disables submit button when firstName is empty", () => {
    render(
      <GuestForm onSubmit={() => {}} onCancel={() => {}} existingGroups={[]} />,
    );

    expect(getSubmitButton("Add Guest")).toBeDisabled();
  });

  it("disables submit button when lastName is empty", async () => {
    const user = userEvent.setup();
    render(
      <GuestForm onSubmit={() => {}} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    expect(getSubmitButton("Add Guest")).toBeDisabled();
  });

  it("enables submit button when both first and last name are filled", async () => {
    const user = userEvent.setup();
    render(
      <GuestForm onSubmit={() => {}} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    expect(getSubmitButton("Add Guest")).toBeEnabled();
  });

  it("pre-fills defaultSide when provided", () => {
    render(
      <GuestForm
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
        defaultSide="partner2"
      />,
    );

    const partner2Btn = screen.getByRole("button", { name: "Partner 2" });
    expect(partner2Btn).toHaveAttribute("data-active", "true");
  });

  it("submits correct side selection", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm onSubmit={onSubmit} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Bob");
    await user.type(screen.getByLabelText("Last Name"), "Jones");
    await user.click(screen.getByRole("button", { name: "Partner 2" }));
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0].side).toBe("partner2");
  });

  it("toggles dietary tags and includes them in submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm onSubmit={onSubmit} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.click(screen.getByRole("button", { name: /vegetarian/i }));
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0].dietaryTags).toContain("vegetarian");
  });

  it("untoggling a dietary tag removes it from submit data", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm onSubmit={onSubmit} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.click(screen.getByRole("button", { name: /vegetarian/i }));
    await user.click(screen.getByRole("button", { name: /vegetarian/i }));
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit.mock.calls[0][0].dietaryTags).not.toContain("vegetarian");
  });

  it("pre-fills dietary tags from guest in edit mode", () => {
    const guest = makeGuest({ dietaryTags: ["vegan", "gluten_free"] });
    render(
      <GuestForm
        guest={guest}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
      />,
    );

    expect(screen.getByRole("button", { name: /vegan/i })).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /gluten.free/i }),
    ).toHaveAttribute("data-active", "true");
  });

  it("includes primaryGuestId in submitted data", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const primaryId = "00000000-0000-0000-0000-000000000003";
    render(
      <GuestForm
        onSubmit={onSubmit}
        onCancel={() => {}}
        existingGroups={[]}
        primaryGuestId={primaryId}
      />,
    );

    await user.type(screen.getByLabelText("First Name"), "Bob");
    await user.type(screen.getByLabelText("Last Name"), "Plus");
    await user.click(getSubmitButton("Add Plus-One"));

    expect(onSubmit.mock.calls[0][0].primaryGuestId).toBe(primaryId);
  });

  it("renders RSVP status select with correct options", () => {
    render(
      <GuestForm onSubmit={() => {}} onCancel={() => {}} existingGroups={[]} />,
    );

    const select = screen.getByLabelText("RSVP Status");
    expect(select).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /pending/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /invited/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /accepted/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /declined/i }),
    ).toBeInTheDocument();
  });

  it("disables submit while isSubmitting is true", () => {
    render(
      <GuestForm
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
        isSubmitting={true}
        guest={makeGuest()}
      />,
    );

    expect(getSubmitButton("Saving...")).toBeDisabled();
  });

  it("submits email and phone when provided", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm onSubmit={onSubmit} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.type(screen.getByLabelText("Email"), "alice@example.com");
    await user.type(screen.getByLabelText("Phone"), "555-9999");
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0].email).toBe("alice@example.com");
    expect(onSubmit.mock.calls[0][0].phone).toBe("555-9999");
  });

  it("submits groupName when typed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm
        onSubmit={onSubmit}
        onCancel={() => {}}
        existingGroups={["Family"]}
      />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.type(screen.getByLabelText("Group"), "Family");
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit.mock.calls[0][0].groupName).toBe("Family");
  });

  it("submits dietaryNotes when typed", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm onSubmit={onSubmit} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.type(
      screen.getByLabelText("Dietary Notes"),
      "No peanuts please",
    );
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit.mock.calls[0][0].dietaryNotes).toBe("No peanuts please");
  });

  it("submits selected RSVP status", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm onSubmit={onSubmit} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.selectOptions(screen.getByLabelText("RSVP Status"), "accepted");
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit.mock.calls[0][0].rsvpStatus).toBe("accepted");
  });

  it("submits null for email and phone when left empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <GuestForm onSubmit={onSubmit} onCancel={() => {}} existingGroups={[]} />,
    );

    await user.type(screen.getByLabelText("First Name"), "Alice");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.click(getSubmitButton("Add Guest"));

    expect(onSubmit.mock.calls[0][0].email).toBeNull();
    expect(onSubmit.mock.calls[0][0].phone).toBeNull();
  });

  it("clears typed input when the key changes for a plus-one form (key is the fix, not useEffect)", async () => {
    const user = userEvent.setup();
    const primaryA = makeGuest({ id: "00000000-0000-0000-0000-000000000020" });
    const primaryB = makeGuest({ id: "00000000-0000-0000-0000-000000000021" });

    // Render as plus-one form for primaryA (guest=undefined, key uses po-${primaryA.id})
    const { rerender } = render(
      <GuestForm
        key={`po-${primaryA.id}`}
        guest={undefined}
        primaryGuestId={primaryA.id}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        existingGroups={[]}
      />,
    );

    // Type something in the first name field
    const firstNameInput = screen.getByLabelText("First Name");
    await user.type(firstNameInput, "Typed Value");
    expect(firstNameInput).toHaveValue("Typed Value");

    // Switch to plus-one form for primaryB (same guest=undefined, different key)
    rerender(
      <GuestForm
        key={`po-${primaryB.id}`}
        guest={undefined}
        primaryGuestId={primaryB.id}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        existingGroups={[]}
      />,
    );

    // The field should be empty — remount cleared it (useEffect alone would NOT clear it
    // because guest?.id stayed undefined→undefined, so no dep change fired)
    expect(screen.getByLabelText("First Name")).toHaveValue("");
  });

  it("resets to a different guest's values when rendered with a new key", () => {
    const guestA = makeGuest({
      id: "00000000-0000-0000-0000-000000000011",
      firstName: "GuestA",
      lastName: "One",
    });
    const guestB = makeGuest({
      id: "00000000-0000-0000-0000-000000000012",
      firstName: "GuestB",
      lastName: "Two",
    });

    const { rerender } = render(
      <GuestForm
        key={guestA.id}
        guest={guestA}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
      />,
    );

    expect(screen.getByLabelText("First Name")).toHaveValue("GuestA");

    rerender(
      <GuestForm
        key={guestB.id}
        guest={guestB}
        onSubmit={() => {}}
        onCancel={() => {}}
        existingGroups={[]}
      />,
    );

    expect(screen.getByLabelText("First Name")).toHaveValue("GuestB");
  });
});
