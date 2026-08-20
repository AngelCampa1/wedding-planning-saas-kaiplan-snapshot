import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../../src/pages/500.astro", import.meta.url)),
  "utf8",
);

describe("500 page source", () => {
  it("uses LandingLayout (noindex is handled via the meta config)", () => {
    // Wave 5: 500.astro was rebuilt as an editorial error moment.
    // LandingLayout wraps the page with the shared editorial masthead/colophon.
    expect(source).toContain("LandingLayout");
    expect(source).not.toContain(
      "@kaiplan/marketing/components/theme-toggle.astro",
    );
  });

  it("keeps the fallback copy generic and action-oriented", () => {
    expect(source).toContain("Something went sideways.");
    expect(source).toContain("siteConfig.contactEmail");
    expect(source).toContain("Try refreshing");
    expect(source).not.toContain("error.message");
  });

  it("sets Astro.response.status = 500 so server errors return a real 500 (not a soft-200)", () => {
    expect(source).toContain("Astro.response.status = 500");
    expect(source).toContain(
      'Astro.response.statusText = "Internal Server Error"',
    );
  });
});
