import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLogo } from "../../src/components/brand-logo";

describe("BrandLogo", () => {
  it("renders the full wedding planning wordmark by default", () => {
    render(<BrandLogo />);

    const logo = screen.getByAltText("Kaiplan wedding planning");
    expect(logo).toHaveAttribute("src", "/logo-light.svg");
    expect(logo).toHaveAttribute("width", "150");
    expect(logo).toHaveAttribute("height", "40");
    expect(logo).toHaveClass("h-10", "w-auto");
  });

  it("renders the compact mark for constrained app surfaces", () => {
    render(<BrandLogo compact />);

    const logo = screen.getByAltText("Kaiplan");
    expect(logo).toHaveAttribute("src", "/logo-mark.svg");
    expect(logo).toHaveAttribute("width", "32");
    expect(logo).toHaveAttribute("height", "32");
    expect(logo).toHaveClass("h-8", "w-8");
  });

  it("allows callers to override sizing classes", () => {
    render(<BrandLogo className="h-12 w-auto" />);

    expect(screen.getByAltText("Kaiplan wedding planning")).toHaveClass(
      "h-12",
      "w-auto",
    );
  });
});
