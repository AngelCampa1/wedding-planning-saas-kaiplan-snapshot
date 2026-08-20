import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSpinner } from "../../../src/components/ui/page-spinner";

describe("PageSpinner", () => {
  it("renders with h-screen wrapper by default", () => {
    const { container } = render(<PageSpinner />);
    expect(container.firstChild).toHaveClass("h-screen");
    expect(container.firstChild).not.toHaveClass("min-h-screen");
  });

  it("renders with min-h-screen wrapper when minHeight is true", () => {
    const { container } = render(<PageSpinner minHeight />);
    expect(container.firstChild).toHaveClass("min-h-screen");
    expect(container.firstChild).not.toHaveClass("h-screen");
  });

  it("always renders the spinner element", () => {
    const { container } = render(<PageSpinner />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveClass("h-8", "w-8", "border-primary");
  });

  it("always renders bg-surface on the wrapper", () => {
    const { container } = render(<PageSpinner />);
    expect(container.firstChild).toHaveClass("bg-surface");
  });
});
