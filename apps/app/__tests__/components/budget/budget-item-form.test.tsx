import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BudgetItemForm } from "../../../src/components/budget/budget-item-form";

describe("BudgetItemForm", () => {
  it("renders all fields", () => {
    render(<BudgetItemForm onSubmit={() => {}} onCancel={() => {}} />);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Estimated ($)")).toBeInTheDocument();
    expect(screen.getByLabelText("Quoted ($)")).toBeInTheDocument();
    expect(screen.getByLabelText("Paid ($)")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("submits with converted cents values", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BudgetItemForm onSubmit={onSubmit} onCancel={() => {}} />);

    await user.type(screen.getByLabelText("Name"), "Photographer");

    fireEvent.change(screen.getByLabelText("Estimated ($)"), {
      target: { value: "150.50" },
    });
    fireEvent.change(screen.getByLabelText("Quoted ($)"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByLabelText("Paid ($)"), {
      target: { value: "100.25" },
    });
    await user.type(screen.getByLabelText("Notes"), "Test note");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledOnce();
    const call = onSubmit.mock.calls[0][0];
    expect(call.name).toBe("Photographer");
    expect(call.estimatedCents).toBe(15050);
    expect(call.quotedCents).toBe(20000);
    expect(call.paidCents).toBe(10025);
    expect(call.notes).toBe("Test note");
  });

  it("validates required name", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BudgetItemForm onSubmit={onSubmit} onCancel={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Name is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("validates name with only spaces", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BudgetItemForm onSubmit={onSubmit} onCancel={() => {}} />);

    await user.type(screen.getByLabelText("Name"), "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Name is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onCancel when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<BudgetItemForm onSubmit={() => {}} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("shows submitting state", () => {
    render(
      <BudgetItemForm
        onSubmit={() => {}}
        onCancel={() => {}}
        isSubmitting={true}
      />,
    );
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });

  it("pre-fills initial values", () => {
    render(
      <BudgetItemForm
        initialValues={{
          name: "Videographer",
          estimatedCents: 300000,
          quotedCents: 250000,
          paidCents: 150000,
          notes: "Some notes",
        }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Videographer");
    expect(screen.getByLabelText("Estimated ($)")).toHaveValue(3000);
    expect(screen.getByLabelText("Quoted ($)")).toHaveValue(2500);
    expect(screen.getByLabelText("Paid ($)")).toHaveValue(1500);
    expect(screen.getByLabelText("Notes")).toHaveValue("Some notes");
  });

  it("submits with null notes when notes are empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BudgetItemForm onSubmit={onSubmit} onCancel={() => {}} />);

    await user.type(screen.getByLabelText("Name"), "Test");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });

  it("defaults dollar fields to 0 cents when left empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<BudgetItemForm onSubmit={onSubmit} onCancel={() => {}} />);

    await user.type(screen.getByLabelText("Name"), "Test");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        estimatedCents: 0,
        quotedCents: 0,
        paidCents: 0,
      }),
    );
  });
});
