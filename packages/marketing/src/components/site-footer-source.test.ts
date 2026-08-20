import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("site footer source regressions", () => {
  it("renders the editorial colophon (no card grid, no marketing-panel)", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("editorial-colophon");
    expect(source).toContain("marketingCaptureDefaults.footerDispatchHeading");
    expect(source).not.toContain("marketing-panel");
    expect(source).not.toContain("marketing-card-grid");
  });

  it("does not render an unsecured native email subscribe form", () => {
    const source = readSource("./site-footer.astro");

    expect(source).not.toContain("/api/leads/subscribe");
    expect(source).not.toContain('type="email"');
    expect(source).not.toContain('method="post"');
  });

  it("uses semantic footer markup with hairline rule", () => {
    const source = readSource("./site-footer.astro");

    expect(source).toContain("<footer");
    expect(source).toContain("editorial-rule");
  });
});
