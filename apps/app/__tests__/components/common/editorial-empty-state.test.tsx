import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditorialEmptyState } from "../../../src/components/common/editorial-empty-state";

function renderState() {
  return render(
    <EditorialEmptyState
      eyebrow="Test eyebrow"
      title="Test title"
      body="Test body text"
      actions={<button>Click me</button>}
    />,
  );
}

describe("EditorialEmptyState", () => {
  it("renders eyebrow, title, body, and actions", () => {
    renderState();
    expect(screen.getByText("Test eyebrow")).toBeInTheDocument();
    expect(screen.getByText("Test title")).toBeInTheDocument();
    expect(screen.getByText("Test body text")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Click me" }),
    ).toBeInTheDocument();
  });

  it("renders multiple action nodes", () => {
    render(
      <EditorialEmptyState
        eyebrow="Eyebrow"
        title="Title"
        body="Body"
        actions={
          <>
            <a href="/one">Primary</a>
            <a href="/two">Secondary</a>
          </>
        }
      />,
    );

    expect(screen.getByRole("link", { name: "Primary" })).toHaveAttribute(
      "href",
      "/one",
    );
    expect(screen.getByRole("link", { name: "Secondary" })).toHaveAttribute(
      "href",
      "/two",
    );
  });

  it("applies text-kicker class to the eyebrow paragraph", () => {
    renderState();
    const eyebrow = screen.getByText("Test eyebrow");
    expect(eyebrow).toHaveClass("text-kicker");
  });

  it("applies heading-display class to the title heading", () => {
    renderState();
    const heading = screen.getByRole("heading", { name: "Test title" });
    expect(heading).toHaveClass("heading-display");
  });

  it("applies rule-accent class to the decorative horizontal rule", () => {
    const { container } = renderState();
    const rule = container.querySelector("div[aria-hidden].h-px");
    expect(rule).not.toBeNull();
    expect(rule).toHaveClass("rule-accent");
  });
});
