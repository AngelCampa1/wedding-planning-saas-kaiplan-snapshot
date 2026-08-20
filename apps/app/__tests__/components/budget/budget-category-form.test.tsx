import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BudgetCategoryForm } from "../../../src/components/budget/budget-category-form";

describe("BudgetCategoryForm", () => {
  it("renders in create mode", () => {
    render(
      <BudgetCategoryForm
        open={true}
        onOpenChange={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getByText("Add category")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Estimated budget ($)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("renders in edit mode with pre-filled values", () => {
    render(
      <BudgetCategoryForm
        open={true}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        initialValues={{
          name: "Photography",
          estimatedCents: 500000,
        }}
      />,
    );

    expect(screen.getByText("Edit category")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Photography");
    expect(screen.getByLabelText("Estimated budget ($)")).toHaveValue(5000);
    expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument();
  });

  it("submits correct values with cents conversion", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BudgetCategoryForm
        open={true}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Catering");
    await user.type(screen.getByLabelText("Estimated budget ($)"), "8500.50");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Catering",
      estimatedCents: 850050,
    });
  });

  it("validates required name", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BudgetCategoryForm
        open={true}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Name is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows submitting state", () => {
    render(
      <BudgetCategoryForm
        open={true}
        onOpenChange={() => {}}
        onSubmit={() => {}}
        isSubmitting={true}
      />,
    );

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });

  it("does not render when closed", () => {
    render(
      <BudgetCategoryForm
        open={false}
        onOpenChange={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.queryByText("Add category")).not.toBeInTheDocument();
  });

  it("calls onOpenChange when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <BudgetCategoryForm
        open={true}
        onOpenChange={onOpenChange}
        onSubmit={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("defaults estimated to 0 when left empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <BudgetCategoryForm
        open={true}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText("Name"), "Flowers");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Flowers",
      estimatedCents: 0,
    });
  });
});
