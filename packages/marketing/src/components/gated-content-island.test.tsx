import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn() }));
vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));
vi.mock("../lib/exit-popup-utils", () => ({
  isSignedUp: vi.fn(() => false),
  setSignedUp: vi.fn(),
}));

import { GatedContentIsland } from "./gated-content-island";

const defaultProps: ComponentProps<typeof GatedContentIsland> = {
  apiUrl: "https://api.test",
  leadMagnetTitle: "Budget Template",
  leadMagnetSlug: "budget-template",
  description: "Get the full PDF.",
  ctaText: "Download free",
  teaserHtml: "<p>Teaser content</p>",
  gatedHtml: "<p>Gated content</p>",
  sourcePage: "/free/budget-template/",
};

describe("GatedContentIsland", () => {
  it("renders the gated content form", () => {
    render(<GatedContentIsland {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: defaultProps.ctaText }),
    ).toBeInTheDocument();
  });

  it("renders the error-boundary fallback when the inner component throws", () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    // teaserHtml is run through sanitizeHtml, which calls .replace on it;
    // null throws during render, which the boundary catches.
    const broken = {
      ...defaultProps,
      teaserHtml: null,
    } as unknown as ComponentProps<typeof GatedContentIsland>;

    try {
      render(<GatedContentIsland {...broken} />);
      expect(screen.getByRole("alert")).toBeInTheDocument();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("passes props through to the inner GatedContent component", () => {
    render(<GatedContentIsland {...defaultProps} />);

    expect(
      screen.getByText(defaultProps.description as string),
    ).toBeInTheDocument();
  });
});
