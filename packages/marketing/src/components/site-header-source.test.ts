import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(__dirname, "./site-header.astro"), "utf8");

describe("site-header editorial masthead source", () => {
  it("does not retain legacy mobile-nav close affordance markers", () => {
    expect(source).not.toContain("data-mobile-nav-close");
    expect(source).not.toContain('aria-label="Close navigation menu"');
  });

  it("renders the editorial masthead markup", () => {
    expect(source).toContain("editorial-masthead");
    expect(source).toContain("data-masthead-wordmark");
    expect(source).toContain("data-masthead-stamp");
  });

  it("does not render a sticky promo banner with the masthead", () => {
    expect(source).not.toContain("offer");
    expect(source).not.toContain("promo");
  });

  it("wires the editorial mobile-nav controller", () => {
    expect(source).toContain("data-editorial-nav-trigger");
    expect(source).toContain("data-editorial-nav-overlay");
    expect(source).toContain("initEditorialMobileNav");
  });

  it("keeps deep mobile navigation groups collapsed by default", () => {
    expect(source).toContain("<details");
    expect(source).toContain("<summary");
    expect(source).not.toContain("editorial-mobile-nav-overlay__mega");
  });

  it("does not reuse the legacy SaaS sticky header treatment", () => {
    expect(source).not.toContain("marketing-shell");
    expect(source).not.toContain("btn-primary");
    expect(source).not.toContain("btn-secondary");
  });
});
