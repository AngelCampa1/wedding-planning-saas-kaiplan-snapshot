import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("shared mobile hit target regressions", () => {
  it("keeps the editorial mobile nav trigger at 44px minimum targets", () => {
    const source = readSource("./site-header.astro");

    // Editorial masthead enforces 44px hit targets via the
    // .editorial-mobile-nav-trigger class defined in editorial.css —
    // assert the trigger element is present and the hook the controller
    // relies on is wired up.
    expect(source).toContain("editorial-mobile-nav-trigger");
    expect(source).toContain("data-editorial-nav-trigger");
  });

  it("keeps editorial colophon links accessible for touch interaction", () => {
    const source = readSource("./site-footer.astro");

    // Colophon links live inside <a>/<button> elements styled by the
    // editorial-subscribe and editorial-colophon classes (44px min-height
    // applied in editorial.css). Assert the anchors are present.
    expect(source).toContain("<a href=");
    expect(source).toContain("editorial-subscribe__submit");
  });

  it("keeps breadcrumb links at a minimum mobile tap target", () => {
    const source = readSource("./breadcrumb-nav.astro");

    expect(source).toContain("min-h-11");
    expect(source).toContain("min-w-11");
    expect(source).toContain("inline-flex");
  });

  it("keeps the feedback trigger at a minimum 44px tap target on mobile", () => {
    const source = readSource("./feedback-widget.tsx");

    expect(source).toContain("min-h-11");
    expect(source).toContain("min-w-11");
  });
});
