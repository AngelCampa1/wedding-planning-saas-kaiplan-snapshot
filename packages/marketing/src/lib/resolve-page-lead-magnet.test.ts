import { describe, it, expect } from "vitest";
import { resolvePageLeadMagnet } from "./resolve-page-lead-magnet";
import type { LeadMagnet } from "../types";

const knowledge: LeadMagnet[] = [
  {
    slug: "budget-template",
    title: "Free Wedding Budget Template",
    description: "Track quotes and deposits.",
  },
  {
    slug: "hidden-cost-calculator-worksheet",
    title: "Hidden Wedding Cost Calculator",
    description: "Find hidden fees.",
  },
  {
    slug: "vendor-interview-question-list",
    title: "Vendor Interview Questions",
    description: "Ask sharper questions.",
  },
  {
    slug: "vendor-contract-review-checklist",
    title: "Vendor Contract Review Checklist",
    description: "Review contracts.",
  },
  {
    slug: "wedding-timeline-template",
    title: "Wedding Day Timeline Template",
    description: "Plan the day.",
  },
  {
    slug: "seating-chart-planning-template",
    title: "Seating Chart Planning Template",
    description: "Plan seating.",
  },
  {
    slug: "wedding-app-comparison-scorecard",
    title: "Wedding App Comparison Scorecard",
    description: "Compare apps.",
  },
  {
    slug: "wedding-venue-comparison-worksheet",
    title: "Wedding Venue Comparison Worksheet",
    description: "Compare venues.",
  },
  {
    slug: "complete-wedding-checklist",
    title: "Complete Wedding Checklist",
    description: "Every step covered.",
  },
];

describe("resolvePageLeadMagnet", () => {
  it("uses explicitSlug when it matches", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/free/x",
        knowledge,
        explicitSlug: "seating-chart-planning-template",
      })?.slug,
    ).toBe("seating-chart-planning-template");
  });
  it("ignores explicitSlug when it does not match a known magnet", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/about",
        knowledge,
        explicitSlug: "nope",
      })?.slug,
    ).toBe("budget-template");
  });
  it("matches budget pages", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/resources/guides/wedding-budget-breakdown",
        knowledge,
      })?.slug,
    ).toBe("budget-template");
  });
  it("prefers hidden-cost over generic budget when 'hidden cost' present", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/resources/guides/hidden-cost-of-weddings",
        knowledge,
      })?.slug,
    ).toBe("hidden-cost-calculator-worksheet");
  });
  it("matches vendor pages", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/resources/guides/how-to-choose-a-photographer",
        knowledge,
      })?.slug,
    ).toBe("vendor-interview-question-list");
  });
  it("prefers contract magnet when 'contract' present", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/resources/guides/vendor-contract-tips",
        knowledge,
      })?.slug,
    ).toBe("vendor-contract-review-checklist");
  });
  it("matches timeline pages via hint", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/",
        knowledge,
        hint: "Wedding Day Timeline Guide",
      })?.slug,
    ).toBe("wedding-timeline-template");
  });
  it("matches compare pages to the comparison scorecard", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/compare/alternatives/zola",
        knowledge,
      })?.slug,
    ).toBe("wedding-app-comparison-scorecard");
  });
  it("falls back to budget-template for unknown topics", () => {
    expect(
      resolvePageLeadMagnet({ pathname: "/privacy", knowledge })?.slug,
    ).toBe("budget-template");
  });
  it("falls back to first entry when budget-template absent", () => {
    const noBudget = knowledge.filter((k) => k.slug !== "budget-template");
    expect(
      resolvePageLeadMagnet({ pathname: "/privacy", knowledge: noBudget })
        ?.slug,
    ).toBe(noBudget[0]!.slug);
  });
  it("returns null when knowledge is empty", () => {
    expect(resolvePageLeadMagnet({ pathname: "/x", knowledge: [] })).toBeNull();
  });

  // Word-boundary false-positive regression tests
  it("does NOT match 'band' inside 'husband' — husband's guide should not resolve to vendor-interview-question-list", () => {
    const result = resolvePageLeadMagnet({
      pathname: "/the-husbands-planning-guide",
      knowledge,
    });
    expect(result?.slug).not.toBe("vendor-interview-question-list");
  });
  it("still matches a real DJ page via bounded 'dj' token", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/vendors/wedding-dj/",
        knowledge,
      })?.slug,
    ).toBe("vendor-interview-question-list");
  });
  it("does NOT match 'dj' inside 'adjustments' — budget page should resolve to budget-template", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/budget-adjustments/",
        knowledge,
      })?.slug,
    ).toBe("budget-template");
  });
  it("still matches hyphenated keyword 'hidden-cost'", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/the-hidden-cost-of-flowers",
        knowledge,
      })?.slug,
    ).toBe("hidden-cost-calculator-worksheet");
  });
  it("does NOT match 'vow' inside 'removal' or 'overthrow'", () => {
    const result = resolvePageLeadMagnet({
      pathname: "/wedding-photo-removal-guide",
      knowledge,
    });
    expect(result?.slug).not.toBe("wedding-vows-writing-worksheet");
  });

  it("skips a matching rule whose slug is absent from knowledge and falls through to next match", () => {
    // pathname matches "contract" rule (vendor-contract-review-checklist) first,
    // but that slug is removed from knowledge, so it must fall through to the
    // vendor-interview-question-list rule (triggered by "vendor").
    const noContract = knowledge.filter(
      (k) => k.slug !== "vendor-contract-review-checklist",
    );
    expect(
      resolvePageLeadMagnet({
        pathname: "/resources/guides/vendor-contract-tips",
        knowledge: noContract,
      })?.slug,
    ).toBe("vendor-interview-question-list");
  });

  // Plural regression tests
  it("plural: /resources/guides/wedding-vendors/ resolves to vendor-interview-question-list", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/resources/guides/wedding-vendors/",
        knowledge,
      })?.slug,
    ).toBe("vendor-interview-question-list");
  });

  it("plural: /venues/ resolves to wedding-venue-comparison-worksheet", () => {
    expect(
      resolvePageLeadMagnet({ pathname: "/venues/", knowledge })?.slug,
    ).toBe("wedding-venue-comparison-worksheet");
  });

  it("plural: /wedding-checklists/ resolves to complete-wedding-checklist", () => {
    expect(
      resolvePageLeadMagnet({ pathname: "/wedding-checklists/", knowledge })
        ?.slug,
    ).toBe("complete-wedding-checklist");
  });

  // Comparison tightening: bare "alternative" in a venue context must NOT fire comparison rule
  it("comparison tightening: bare 'alternative' in venue context resolves to venue worksheet, not comparison scorecard", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/blog/an-alternative-venue-idea/",
        knowledge,
        hint: "An alternative venue idea",
      })?.slug,
    ).toBe("wedding-venue-comparison-worksheet");
  });

  // Comparison still works via /alternatives/ segment
  it("comparison still works: /compare/alternatives/the-knot/ resolves to wedding-app-comparison-scorecard", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/compare/alternatives/the-knot/",
        knowledge,
      })?.slug,
    ).toBe("wedding-app-comparison-scorecard");
  });

  // Uppercase pathname
  it("uppercase pathname: /VENDORS/ resolves to vendor-interview-question-list", () => {
    expect(
      resolvePageLeadMagnet({ pathname: "/VENDORS/", knowledge })?.slug,
    ).toBe("vendor-interview-question-list");
  });

  // First-wins ordering: path containing both "seating" and "timeline"
  // In RULES, seating-chart-planning-template (index 4) comes before
  // wedding-timeline-template (index 5), so seating wins.
  it("first-wins: path with both seating and timeline keywords resolves to seating-chart-planning-template", () => {
    expect(
      resolvePageLeadMagnet({
        pathname: "/seating-timeline-guide/",
        knowledge,
      })?.slug,
    ).toBe("seating-chart-planning-template");
  });
});
