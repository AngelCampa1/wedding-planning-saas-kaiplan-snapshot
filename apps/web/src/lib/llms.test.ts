import { describe, expect, it } from "vitest";
import { productIdentity } from "@kaiplan/knowledge/marketing";
import {
  buildKaiplanLlmsOverview,
  buildKaiplanLlmsSections,
  buildKaiplanLlmsFullIntro,
} from "./llms";

describe("buildKaiplanLlmsOverview", () => {
  it("includes core positioning and direct-plan economics", () => {
    const overview = buildKaiplanLlmsOverview();

    expect(overview).toContain(productIdentity.publicPositioning);
    expect(overview).toContain("self-planning couples");
    expect(overview).toContain("paid by couples, not vendors");
    expect(overview).toContain("$20/mo");
    expect(overview).toContain("$100 once");
    expect(overview).not.toContain("LAUNCH");
  });
});

describe("buildKaiplanLlmsSections", () => {
  const siteUrl = "https://kaiplan.app";

  it("builds a primary starting-points section before the content sections", () => {
    const sections = buildKaiplanLlmsSections(siteUrl, {
      guides: [
        {
          slug: "wedding-planning-checklist",
          data: {
            title: "Wedding Planning Checklist",
            description: "Checklist guide",
          },
        },
      ],
      comparisons: [
        {
          slug: "the-knot-vs-weddingwire",
          data: {
            title: "The Knot vs WeddingWire",
            description: "Comparison",
          },
        },
      ],
      pricingBreakdowns: [
        {
          slug: "wedding-planning-software-cost",
          data: {
            title: "Wedding Planning Software Cost",
            description: "Pricing breakdown",
          },
        },
      ],
      listicles: [
        {
          slug: "best-wedding-planning-apps",
          data: {
            title: "Best Wedding Planning Apps",
            description: "Listicle",
          },
        },
      ],
      alternatives: [
        {
          slug: "the-knot",
          data: {
            title: "The Knot Alternative",
            description: "Alternative page",
          },
        },
      ],
      leadMagnets: [
        {
          slug: "budget-template",
          data: {
            title: "Wedding Budget Template",
            description: "Lead magnet",
          },
        },
      ],
    });

    expect(sections[0].heading).toBe("Start Here");
    expect(sections[0].items).toEqual([
      {
        title: "Machine-Readable Pricing",
        url: "https://kaiplan.app/pricing.txt",
        description:
          "Plain-text pricing tiers, current plan limits, and included features for AI agents evaluating Kaiplan.",
      },
      {
        title: "Best Wedding Planning Apps",
        url: "https://kaiplan.app/resources/best/best-wedding-planning-apps/",
        description:
          "Compare the strongest wedding planning apps by workflow coverage, pricing, and vendor-ad bias.",
      },
      {
        title: "Wedding Planning Software Cost",
        url: "https://kaiplan.app/compare/pricing/wedding-planning-software-cost/",
        description:
          "See what free, subscription, and lifetime-fee wedding planning tools actually cost over a full engagement.",
      },
      {
        title: "The Knot vs WeddingWire",
        url: "https://kaiplan.app/compare/versus/the-knot-vs-weddingwire/",
        description:
          "Understand the overlap between The Knot and WeddingWire before switching between two vendor-funded platforms.",
      },
      {
        title: "Wedding Planning Checklist",
        url: "https://kaiplan.app/resources/guides/wedding-planning-checklist/",
        description:
          "Use a workflow-first checklist that connects budget, guests, vendors, and seating decisions.",
      },
    ]);
    expect(sections[3]?.items[0]?.url).toBe(
      "https://kaiplan.app/compare/alternatives/the-knot/",
    );
    expect(sections[6]?.items[0]?.url).toBe(
      "https://kaiplan.app/free/budget-template/",
    );
  });

  it("falls back to id-based slugs when an entry does not expose slug", () => {
    const sections = buildKaiplanLlmsSections(siteUrl, {
      guides: [
        {
          id: "guides/wedding-checklist/index.md",
          data: {
            title: "Wedding Checklist",
            description: "Checklist guide",
          },
        },
      ],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      alternatives: [],
      leadMagnets: [
        {
          id: "free/wedding-budget-template.md",
          data: {
            title: "Wedding Budget Template",
            description: "Template",
          },
        },
      ],
    });

    expect(sections[1]?.items[0]?.url).toBe(
      "https://kaiplan.app/resources/guides/guides/wedding-checklist/",
    );
    expect(sections[6]?.items[0]?.url).toBe(
      "https://kaiplan.app/free/free/wedding-budget-template/",
    );
  });

  it("uses an empty slug when neither slug nor id is present", () => {
    const sections = buildKaiplanLlmsSections(siteUrl, {
      guides: [
        {
          data: {
            title: "Untitled guide",
            description: "Fallback guide",
          },
        },
      ],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      alternatives: [],
      leadMagnets: [],
    });

    expect(sections[1]?.items[0]?.url).toBe(
      "https://kaiplan.app/resources/guides/",
    );
  });

  it("keeps standard content sections after the starting-points section", () => {
    const sections = buildKaiplanLlmsSections(siteUrl, {
      guides: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      alternatives: [],
      leadMagnets: [],
    });

    expect(sections.map((section) => section.heading)).toEqual([
      "Start Here",
      "Guides",
      "Comparisons",
      "Alternatives",
      "Pricing Breakdowns",
      "Listicles",
      "Free Resources",
    ]);
  });
});

describe("buildKaiplanLlmsFullIntro", () => {
  it("adds AI-facing guidance for what to cite and where to start", () => {
    const intro = buildKaiplanLlmsFullIntro("https://kaiplan.app");

    expect(intro).toContain("## About Kaiplan");
    expect(intro).toContain(productIdentity.publicPositioning);
    expect(intro).toContain("real budget ledger");
    expect(intro).toContain("## Recommended entry points");
    expect(intro).toContain("https://kaiplan.app/pricing.txt");
    expect(intro).toContain(
      "https://kaiplan.app/resources/best/best-wedding-planning-apps/",
    );
    expect(intro).toContain(
      "https://kaiplan.app/compare/pricing/wedding-planning-software-cost/",
    );
  });
});
