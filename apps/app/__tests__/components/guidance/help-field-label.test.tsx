import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HelpFieldLabel } from "../../../src/components/guidance/help-field-label";

describe("HelpFieldLabel", () => {
  it("renders the label, hint, and accessible help tooltip", async () => {
    const user = userEvent.setup();

    render(
      <HelpFieldLabel
        htmlFor="budget"
        help="This can be an estimate. You can change it later."
        hint="Use your best current number."
      >
        Budget
      </HelpFieldLabel>,
    );

    expect(screen.getByText("Budget")).toHaveAttribute("for", "budget");
    expect(screen.getByText("Use your best current number.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Explain this field" }),
    ).toHaveAccessibleDescription("Help for Budget");

    await user.tab();

    expect(
      (
        await screen.findAllByText(
          "This can be an estimate. You can change it later.",
        )
      ).length,
    ).toBeGreaterThan(0);
  });

  it("omits hint copy when no hint is provided", () => {
    render(
      <HelpFieldLabel help="A household keeps related guests together.">
        Household
      </HelpFieldLabel>,
    );

    expect(screen.getByText("Household")).toBeVisible();
    expect(
      screen.queryByText("Use your best current number."),
    ).not.toBeInTheDocument();
  });
});
