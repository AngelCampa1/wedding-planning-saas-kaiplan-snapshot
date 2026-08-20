import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { HelpTooltip } from "../../../src/components/guidance/help-tooltip";

describe("HelpTooltip", () => {
  it("shows short guidance for icon-only controls on focus", async () => {
    const user = userEvent.setup();

    render(
      <HelpTooltip content="This opens the plain-language help guide.">
        <button type="button" aria-label="Open help">
          ?
        </button>
      </HelpTooltip>,
    );

    await user.tab();

    expect(
      (await screen.findAllByText("This opens the plain-language help guide."))
        .length,
    ).toBeGreaterThan(0);
  });

  it("does not render empty tooltip wrappers", () => {
    render(
      <HelpTooltip content="">
        <button type="button">Save draft</button>
      </HelpTooltip>,
    );

    expect(screen.getByRole("button", { name: "Save draft" })).toBeVisible();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
