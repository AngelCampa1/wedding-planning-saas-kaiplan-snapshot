import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WidgetLoadError } from "../../../src/components/dashboard/widget-load-error";

describe("WidgetLoadError", () => {
  it("renders the fallback message when no message is provided", () => {
    render(<WidgetLoadError title="Data did not load" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Data did not load");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Refresh the page and try again. If the problem continues, contact support.",
    );
  });

  it("does not render raw error details passed by callers", () => {
    render(
      <WidgetLoadError
        title="Data did not load"
        message="SQL constraint failed for token abc123"
      />,
    );

    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "SQL constraint failed",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("abc123");
  });
});
