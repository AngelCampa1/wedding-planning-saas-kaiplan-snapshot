import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthShell } from "../../../src/components/auth/auth-shell";

function renderShell() {
  return render(
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back"
      tagline="Pick up where you left off."
      footer={<span>No account? Sign up</span>}
    >
      <button>Submit</button>
    </AuthShell>,
  );
}

describe("AuthShell", () => {
  it("renders eyebrow, title, tagline, children, and footer", () => {
    renderShell();
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pick up where you left off.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByText(/No account/)).toBeInTheDocument();
  });

  it("applies text-kicker class to the form panel eyebrow", () => {
    renderShell();
    const eyebrow = screen.getByText("Sign in");
    expect(eyebrow).toHaveClass("text-kicker");
  });

  it("renders the Kaiplan brand logo in the brand panel", () => {
    renderShell();
    const logo = screen.getByAltText("Kaiplan wedding planning");
    expect(logo).toHaveAttribute("src", "/logo-light.svg");
    expect(logo).toHaveClass("h-12");
  });

  it("applies text-kicker class to the tagline footer kicker (Calm tools label)", () => {
    renderShell();
    // The bottom brand tagline uses text-kicker
    const taglineEl = screen.getByText(/Calm tools/);
    expect(taglineEl).toHaveClass("text-kicker");
  });

  it("applies text-kicker class to the citation (Kaiplan, est. 2025)", () => {
    renderShell();
    const cite = screen.getByText("Kaiplan, est. 2025");
    expect(cite).toHaveClass("text-kicker");
  });

  it("applies heading-display class to the blockquote display heading", () => {
    renderShell();
    const quote = screen.getByText(/The wedding tool for couples/);
    expect(quote).toHaveClass("heading-display");
  });

  it("applies rule-primary class to the vertical divider between panels", () => {
    const { container } = renderShell();
    // The vertical rule is a div[aria-hidden] between the two panels
    const verticalRule = container.querySelector(
      ".hidden.lg\\:block[aria-hidden]",
    );
    expect(verticalRule).not.toBeNull();
    expect(verticalRule).toHaveClass("rule-primary");
  });

  it("applies rule-primary class to the citation decorative rule span", () => {
    const { container } = renderShell();
    // The span before <cite> that is aria-hidden with h-px w-8
    const citationRule = container.querySelector(
      "footer span[aria-hidden].h-px",
    );
    expect(citationRule).not.toBeNull();
    expect(citationRule).toHaveClass("rule-primary");
  });
});
