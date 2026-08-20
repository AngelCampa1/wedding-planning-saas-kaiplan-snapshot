import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkRsvpBar } from "../../../src/components/guest/bulk-rsvp-bar";

describe("BulkRsvpBar", () => {
  it("shows selected count", () => {
    render(
      <BulkRsvpBar
        selectedCount={5}
        onBulkUpdate={vi.fn()}
        isUpdating={false}
      />,
    );
    expect(screen.getByText("5 guests selected")).toBeInTheDocument();
  });

  it("calls onBulkUpdate with 'accepted' when Accepted button clicked", async () => {
    const onBulkUpdate = vi.fn();
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={onBulkUpdate}
        isUpdating={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /accepted/i }));
    expect(onBulkUpdate).toHaveBeenCalledWith("accepted");
  });

  it("calls onBulkUpdate with 'invited' when Invited button clicked", async () => {
    const onBulkUpdate = vi.fn();
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={onBulkUpdate}
        isUpdating={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /invited/i }));
    expect(onBulkUpdate).toHaveBeenCalledWith("invited");
  });

  it("opens a confirmation dialog when Declined button clicked", async () => {
    const onBulkUpdate = vi.fn();
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={onBulkUpdate}
        isUpdating={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /declined/i }));
    expect(screen.getByText("Confirm bulk decline?")).toBeInTheDocument();
    expect(onBulkUpdate).not.toHaveBeenCalled();
  });

  it("asks for confirmation before bulk declining guests", async () => {
    const user = userEvent.setup();
    const onBulkUpdate = vi.fn();
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={onBulkUpdate}
        isUpdating={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /declined/i }));

    expect(screen.getByText("Confirm bulk decline?")).toBeInTheDocument();
    expect(onBulkUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /confirm decline/i }));

    expect(onBulkUpdate).toHaveBeenCalledWith("declined");
  });

  it("disables buttons when isUpdating is true", () => {
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={vi.fn()}
        isUpdating={true}
      />,
    );
    expect(screen.getByRole("button", { name: /invited/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /accepted/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /declined/i })).toBeDisabled();
  });

  it("returns null when selectedCount is 0", () => {
    const { container } = render(
      <BulkRsvpBar
        selectedCount={0}
        onBulkUpdate={vi.fn()}
        isUpdating={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("closes the decline confirmation dialog when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onBulkUpdate = vi.fn();
    render(
      <BulkRsvpBar
        selectedCount={3}
        onBulkUpdate={onBulkUpdate}
        isUpdating={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /declined/i }));
    expect(screen.getByText("Confirm bulk decline?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText("Confirm bulk decline?")).not.toBeInTheDocument();
    expect(onBulkUpdate).not.toHaveBeenCalled();
  });

  it("uses singular form in decline dialog description when selectedCount is 1", async () => {
    const user = userEvent.setup();
    render(
      <BulkRsvpBar
        selectedCount={1}
        onBulkUpdate={vi.fn()}
        isUpdating={false}
      />,
    );
    await user.click(screen.getByRole("button", { name: /declined/i }));
    expect(
      screen.getByText("This will mark 1 selected guest as declined."),
    ).toBeInTheDocument();
  });
});
