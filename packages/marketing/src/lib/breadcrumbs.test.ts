import { describe, it, expect } from "vitest";
import { formatSlugAsLabel } from "./breadcrumbs";

describe("formatSlugAsLabel", () => {
  it("converts a hyphenated slug to title case", () => {
    expect(formatSlugAsLabel("best-apps-make-friends-adult")).toBe(
      "Best Apps Make Friends Adult",
    );
  });

  it("returns an already-readable label unchanged (has spaces)", () => {
    expect(formatSlugAsLabel("Resources")).toBe("Resources");
  });

  it("returns a multi-word readable label unchanged (has spaces)", () => {
    expect(formatSlugAsLabel("Software Roundups")).toBe("Software Roundups");
  });

  it("returns a single word with no hyphens unchanged", () => {
    expect(formatSlugAsLabel("Home")).toBe("Home");
  });

  it("returns an empty string unchanged (defensive)", () => {
    expect(formatSlugAsLabel("")).toBe("");
  });

  it("normalises mixed-case slugs to title case", () => {
    expect(formatSlugAsLabel("HVAC-dispatch-SOFTWARE")).toBe(
      "Hvac Dispatch Software",
    );
  });

  it("handles a single-segment slug (no hyphens, no spaces)", () => {
    expect(formatSlugAsLabel("guides")).toBe("guides");
  });

  it("handles a slug with multiple consecutive hyphens gracefully", () => {
    // Empty segments from consecutive hyphens are collapsed to a single space
    const result = formatSlugAsLabel("foo--bar");
    expect(result).toBe("Foo Bar");
  });
});
