import { describe, it, expect } from "vitest";
import {
  buildAlternativeBreadcrumbs,
  buildComparisonBreadcrumbs,
  buildPricingBreadcrumbs,
  buildListicleBreadcrumbs,
  buildGuideBreadcrumbs,
} from "./breadcrumbs";

describe("buildAlternativeBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with correct labels and hrefs", () => {
    const result = buildAlternativeBreadcrumbs(
      "Zola Alternative",
      "/compare/alternatives/zola/",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Compare", href: "/compare/" },
      { label: "Alternatives", href: "/compare/alternatives/" },
      { label: "Zola Alternative", href: "/compare/alternatives/zola/" },
    ]);
  });

  it("uses the title as the last breadcrumb label", () => {
    const result = buildAlternativeBreadcrumbs(
      "The Knot Alternative",
      "/compare/alternatives/the-knot/",
    );
    expect(result[3]).toEqual({
      label: "The Knot Alternative",
      href: "/compare/alternatives/the-knot/",
    });
  });

  it("sets canonicalPath as the last item href", () => {
    const result = buildAlternativeBreadcrumbs(
      "Honeybook Alternative",
      "/compare/alternatives/honeybook/",
    );
    expect(result[3].href).toBe("/compare/alternatives/honeybook/");
  });

  it("leaves root canonical paths unchanged", () => {
    const result = buildAlternativeBreadcrumbs("Root", "/");
    expect(result[3].href).toBe("/");
  });

  it("leaves file canonical paths unchanged", () => {
    const result = buildAlternativeBreadcrumbs("File", "/robots.txt");
    expect(result[3].href).toBe("/robots.txt");
  });

  it("leaves query and hash canonical paths unchanged", () => {
    expect(buildAlternativeBreadcrumbs("Query", "/compare?x=1")[3].href).toBe(
      "/compare?x=1",
    );
    expect(buildAlternativeBreadcrumbs("Hash", "/compare#top")[3].href).toBe(
      "/compare#top",
    );
  });

  it("leaves empty canonical paths unchanged", () => {
    const result = buildAlternativeBreadcrumbs("Empty", "");
    expect(result[3].href).toBe("");
  });

  it("returns exactly 4 items", () => {
    expect(
      buildAlternativeBreadcrumbs(
        "Any Title",
        "/compare/alternatives/any-title",
      ),
    ).toHaveLength(4);
  });

  it("Home always links to /", () => {
    const result = buildAlternativeBreadcrumbs("X", "/compare/alternatives/x");
    expect(result[0]).toEqual({ label: "Home", href: "/" });
  });

  it("second item links to /compare", () => {
    const result = buildAlternativeBreadcrumbs("X", "/compare/alternatives/x");
    expect(result[1]).toEqual({ label: "Compare", href: "/compare/" });
  });

  it("third item links to /compare/alternatives", () => {
    const result = buildAlternativeBreadcrumbs("X", "/compare/alternatives/x");
    expect(result[2]).toEqual({
      label: "Alternatives",
      href: "/compare/alternatives/",
    });
  });
});

describe("buildComparisonBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with correct labels and hrefs", () => {
    const result = buildComparisonBreadcrumbs(
      "Zola vs The Knot",
      "/compare/versus/zola-vs-the-knot/",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Compare", href: "/compare/" },
      { label: "Comparisons", href: "/compare/versus/" },
      { label: "Zola vs The Knot", href: "/compare/versus/zola-vs-the-knot/" },
    ]);
  });

  it("uses the title as the last breadcrumb label", () => {
    const result = buildComparisonBreadcrumbs(
      "Honeybook vs Dubsado",
      "/compare/versus/honeybook-vs-dubsado/",
    );
    expect(result[3]).toEqual({
      label: "Honeybook vs Dubsado",
      href: "/compare/versus/honeybook-vs-dubsado/",
    });
  });

  it("sets canonicalPath as the last item href", () => {
    const result = buildComparisonBreadcrumbs(
      "Zola vs Aisle",
      "/compare/versus/zola-vs-aisle/",
    );
    expect(result[3].href).toBe("/compare/versus/zola-vs-aisle/");
  });

  it("returns exactly 4 items", () => {
    expect(
      buildComparisonBreadcrumbs("Any Title", "/compare/versus/any-title"),
    ).toHaveLength(4);
  });

  it("third item links to /compare/versus", () => {
    const result = buildComparisonBreadcrumbs(
      "X vs Y",
      "/compare/versus/x-vs-y",
    );
    expect(result[2]).toEqual({
      label: "Comparisons",
      href: "/compare/versus/",
    });
  });
});

describe("buildPricingBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with correct labels and hrefs", () => {
    const result = buildPricingBreadcrumbs(
      "Zola Pricing",
      "/compare/pricing/zola/",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Compare", href: "/compare/" },
      { label: "Pricing", href: "/compare/pricing/" },
      { label: "Zola Pricing", href: "/compare/pricing/zola/" },
    ]);
  });

  it("uses the title as the last breadcrumb label", () => {
    const result = buildPricingBreadcrumbs(
      "The Knot Pricing",
      "/compare/pricing/the-knot/",
    );
    expect(result[3]).toEqual({
      label: "The Knot Pricing",
      href: "/compare/pricing/the-knot/",
    });
  });

  it("sets canonicalPath as the last item href", () => {
    const result = buildPricingBreadcrumbs(
      "Honeybook Pricing",
      "/compare/pricing/honeybook/",
    );
    expect(result[3].href).toBe("/compare/pricing/honeybook/");
  });

  it("returns exactly 4 items", () => {
    expect(
      buildPricingBreadcrumbs("Any Title", "/compare/pricing/any-title"),
    ).toHaveLength(4);
  });

  it("third item links to /compare/pricing", () => {
    const result = buildPricingBreadcrumbs("X Pricing", "/compare/pricing/x");
    expect(result[2]).toEqual({ label: "Pricing", href: "/compare/pricing/" });
  });
});

describe("buildListicleBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with correct labels and hrefs", () => {
    const result = buildListicleBreadcrumbs(
      "Best Wedding Planning Apps 2026",
      "/resources/best/wedding-planning-apps/",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Resources", href: "/resources/" },
      { label: "Best", href: "/resources/best/" },
      {
        label: "Best Wedding Planning Apps 2026",
        href: "/resources/best/wedding-planning-apps/",
      },
    ]);
  });

  it("uses the title as the last breadcrumb label", () => {
    const result = buildListicleBreadcrumbs(
      "Top 5 Wedding Budget Tools",
      "/resources/best/wedding-budget-tools/",
    );
    expect(result[3]).toEqual({
      label: "Top 5 Wedding Budget Tools",
      href: "/resources/best/wedding-budget-tools/",
    });
  });

  it("sets canonicalPath as the last item href", () => {
    const result = buildListicleBreadcrumbs(
      "Best Venue Finders",
      "/resources/best/venue-finders/",
    );
    expect(result[3].href).toBe("/resources/best/venue-finders/");
  });

  it("returns exactly 4 items", () => {
    expect(
      buildListicleBreadcrumbs("Any Title", "/resources/best/any-title"),
    ).toHaveLength(4);
  });

  it("second item links to /resources", () => {
    const result = buildListicleBreadcrumbs("X", "/resources/best/x");
    expect(result[1]).toEqual({ label: "Resources", href: "/resources/" });
  });

  it("third item links to /resources/best", () => {
    const result = buildListicleBreadcrumbs("X", "/resources/best/x");
    expect(result[2]).toEqual({ label: "Best", href: "/resources/best/" });
  });
});

describe("buildGuideBreadcrumbs", () => {
  it("returns 4-item breadcrumb trail with correct labels and hrefs", () => {
    const result = buildGuideBreadcrumbs(
      "How to Plan a Wedding on a Budget",
      "/resources/guides/plan-wedding-on-budget/",
    );
    expect(result).toEqual([
      { label: "Home", href: "/" },
      { label: "Resources", href: "/resources/" },
      { label: "Guides", href: "/resources/guides/" },
      {
        label: "How to Plan a Wedding on a Budget",
        href: "/resources/guides/plan-wedding-on-budget/",
      },
    ]);
  });

  it("uses the title as the last breadcrumb label", () => {
    const result = buildGuideBreadcrumbs(
      "Wedding Venue Checklist",
      "/resources/guides/venue-checklist/",
    );
    expect(result[3]).toEqual({
      label: "Wedding Venue Checklist",
      href: "/resources/guides/venue-checklist/",
    });
  });

  it("sets canonicalPath as the last item href", () => {
    const result = buildGuideBreadcrumbs(
      "Budget Wedding Tips",
      "/resources/guides/budget-wedding-tips/",
    );
    expect(result[3].href).toBe("/resources/guides/budget-wedding-tips/");
  });

  it("returns exactly 4 items", () => {
    expect(
      buildGuideBreadcrumbs("Any Title", "/resources/guides/any-title"),
    ).toHaveLength(4);
  });

  it("third item links to /resources/guides", () => {
    const result = buildGuideBreadcrumbs("X", "/resources/guides/x");
    expect(result[2]).toEqual({ label: "Guides", href: "/resources/guides/" });
  });
});
