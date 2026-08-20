import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const notFoundSource = readFileSync(
  fileURLToPath(new URL("./404.astro", import.meta.url)),
  "utf8",
);

describe("404 page (Wave 5 — editorial error moment)", () => {
  it("uses LandingLayout so the editorial masthead and colophon are included", () => {
    expect(notFoundSource).toContain("LandingLayout");
    expect(notFoundSource).not.toContain("BaseLayout");
  });

  it("renders the editorial display-XL italic headline", () => {
    expect(notFoundSource).toContain("editorial-display-xl");
    expect(notFoundSource).toContain("editorial-italic");
    expect(notFoundSource).toContain("This page is not on");
    expect(notFoundSource).toContain("the seating chart.");
  });

  it("renders a single back link to the homepage using editorial-link", () => {
    expect(notFoundSource).toContain("editorial-link");
    expect(notFoundSource).toContain('href="/"');
    expect(notFoundSource).toContain("planning desk");
  });

  it("does not render marketing-card, marketing-panel, or marketing-card-grid", () => {
    expect(notFoundSource).not.toContain("marketing-card");
    expect(notFoundSource).not.toContain("marketing-panel");
    expect(notFoundSource).not.toContain("marketing-card-grid");
  });

  it("does not import or render legacy SiteHeader/SiteFooter directly", () => {
    expect(notFoundSource).not.toContain('SiteHeader slot="header"');
    expect(notFoundSource).not.toContain('SiteFooter slot="footer"');
  });

  it("sets Astro.response.status = 404 so unmatched URLs return a real 404 (not a soft-200)", () => {
    expect(notFoundSource).toContain("Astro.response.status = 404");
    expect(notFoundSource).toContain('Astro.response.statusText = "Not Found"');
  });
});
