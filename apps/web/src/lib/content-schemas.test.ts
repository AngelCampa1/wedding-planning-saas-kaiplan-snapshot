import { describe, expect, it } from "vitest";

import {
  alternativeSchema,
  comparisonSchema,
  guideSchema,
  leadMagnetSchema,
  listicleSchema,
  pricingBreakdownSchema,
} from "./content-schemas";

function baseContent(overrides: Record<string, unknown> = {}) {
  return {
    title: "Kaiplan content",
    description: "Content description",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    buyerStage: "bofu",
    bluf: "Bottom line up front",
    relatedPages: ["/compare"],
    ...overrides,
  };
}

describe("content schemas", () => {
  it("normalizes alternative answer entries and applies base defaults", () => {
    const parsed = alternativeSchema.parse(
      baseContent({
        ctaMode: "convert",
        schema: "FAQPage",
        faqs: [{ q: "FAQ question", a: "FAQ answer" }],
        statistics: [{ stat: "Stat", source: "Source" }],
        tags: ["alternatives"],
        noindex: true,
        competitor: {
          name: "The Knot",
          slug: "the-knot",
          pricing: "Free",
          weakness: "Vendor-funded",
          pros: ["Popular"],
          cons: ["Ads"],
        },
        answers: [
          { q: "Question A", a: "Answer A" },
          { question: "Question B", answer: "Answer B" },
        ],
      }),
    );

    expect(parsed.schema).toBe("FAQPage");
    expect(parsed.ctaMode).toBe("convert");
    expect(parsed.noindex).toBe(true);
    expect(parsed.tags).toEqual(["alternatives"]);
    expect(parsed.faqs).toEqual([{ q: "FAQ question", a: "FAQ answer" }]);
    expect(parsed.statistics).toEqual([{ stat: "Stat", source: "Source" }]);
    expect(parsed.answers).toEqual([
      { q: "Question A", a: "Answer A" },
      { q: "Question B", a: "Answer B" },
    ]);
  });

  it("accepts comparison-specific fields without optional definitions", () => {
    const parsed = comparisonSchema.parse(
      baseContent({
        competitorA: {
          name: "The Knot",
          slug: "the-knot",
          pricing: "Free",
          pros: ["Popular"],
          cons: ["Vendor ads"],
        },
        competitorB: {
          name: "Kaiplan",
          slug: "kaiplan",
          pricing: "$20/mo",
          pros: ["Budget tools"],
          cons: ["Paid"],
        },
        verdict: "Kaiplan wins on workflow coverage",
        disableProsConsSchema: true,
      }),
    );

    expect(parsed.disableProsConsSchema).toBe(true);
    expect(parsed.definitions).toBeUndefined();
    expect(parsed.schema).toBe("Article");
    expect(parsed.faqs).toEqual([]);
  });

  it("accepts pricing breakdown-specific fields", () => {
    const parsed = pricingBreakdownSchema.parse(
      baseContent({
        competitor: {
          name: "Zola",
          slug: "zola",
          pricing: "Free",
        },
        tiers: [
          {
            name: "Starter",
            price: "$20/mo",
            features: ["Budget ledger"],
          },
        ],
        hiddenCosts: ["Vendor fees"],
      }),
    );

    expect(parsed.competitor.slug).toBe("zola");
    expect(parsed.tiers).toEqual([
      {
        name: "Starter",
        price: "$20/mo",
        features: ["Budget ledger"],
      },
    ]);
    expect(parsed.hiddenCosts).toEqual(["Vendor fees"]);
  });

  it("accepts listicle-specific fields", () => {
    const parsed = listicleSchema.parse(
      baseContent({
        category: "apps",
        qualifier: "best",
        tools: [
          {
            name: "Kaiplan",
            summary: "Workflow-first planning",
            pros: ["Budget"],
            cons: ["Paid"],
            pricing: "$20/mo",
            verdict: "Strong fit",
          },
        ],
      }),
    );

    expect(parsed.category).toBe("apps");
    expect(parsed.qualifier).toBe("best");
    expect(parsed.tools).toHaveLength(1);
    expect(parsed.schema).toBe("Article");
    expect(parsed.noindex).toBe(false);
  });

  it("accepts guide-specific fields and defaults the definitions array", () => {
    const parsed = guideSchema.parse(
      baseContent({
        steps: [
          {
            title: "Step 1",
            content: "Do the first thing",
          },
        ],
        answers: [{ question: "Question", answer: "Answer" }],
      }),
    );

    expect(parsed.steps).toEqual([
      {
        title: "Step 1",
        content: "Do the first thing",
      },
    ]);
    expect(parsed.answers).toEqual([{ q: "Question", a: "Answer" }]);
    expect(parsed.definitions).toEqual([]);
  });

  it("normalizes guide faq entries that mix q with answer", () => {
    const parsed = guideSchema.parse(
      baseContent({
        faqs: [
          {
            q: "What questions should I ask a potential wedding planner?",
            answer: "Ask about vendor network, venue experience, and fees.",
          },
          {
            question: "Can I use one checklist for every vendor?",
            answer: "Use the same baseline, then add category-specific asks.",
          },
          {
            question: "Should I save written notes?",
            a: "Yes. Keep notes beside quotes and contracts.",
          },
        ],
      }),
    );

    expect(parsed.faqs).toEqual([
      {
        q: "What questions should I ask a potential wedding planner?",
        a: "Ask about vendor network, venue experience, and fees.",
      },
      {
        q: "Can I use one checklist for every vendor?",
        a: "Use the same baseline, then add category-specific asks.",
      },
      {
        q: "Should I save written notes?",
        a: "Yes. Keep notes beside quotes and contracts.",
      },
    ]);
  });

  it("normalizes guide faq entries that use question with answer", () => {
    const parsed = guideSchema.parse(
      baseContent({
        faqs: [
          {
            question: "How do I compare vendor estimates fairly?",
            answer: "Normalize taxes, gratuities, travel, and service fees.",
          },
        ],
      }),
    );

    expect(parsed.faqs).toEqual([
      {
        q: "How do I compare vendor estimates fairly?",
        a: "Normalize taxes, gratuities, travel, and service fees.",
      },
    ]);
  });

  it("normalizes lead magnet faq entries that use question with a", () => {
    const parsed = leadMagnetSchema.parse(
      baseContent({
        title: "Vendor Checklist",
        description: "Checklist",
        bluf: "Use this checklist before you sign.",
        faqs: [
          {
            question: "When should I use the checklist?",
            a: "Use it before every vendor interview and contract review.",
          },
        ],
      }),
    );

    expect(parsed.faqs).toEqual([
      {
        q: "When should I use the checklist?",
        a: "Use it before every vendor interview and contract review.",
      },
    ]);
  });

  it("applies lead magnet defaults when optional fields are omitted", () => {
    const parsed = leadMagnetSchema.parse(
      baseContent({
        title: "Budget Template",
        description: "Template",
        bluf: "Use this spreadsheet",
        relatedPages: ["/compare"],
        buyerStage: undefined,
      }),
    );

    expect(parsed.freePreviewSections).toBe(2);
    expect(parsed.buyerStage).toBe("tofu");
    expect(parsed.schema).toBe("Article");
    expect(parsed.faqs).toEqual([]);
    expect(parsed.definitions).toEqual([]);
    expect(parsed.statistics).toEqual([]);
    expect(parsed.noindex).toBe(false);
    expect(parsed.tags).toEqual([]);
  });

  it("accepts lead magnet statistics for citation rendering", () => {
    const parsed = leadMagnetSchema.parse(
      baseContent({
        title: "Budget Template",
        description: "Template",
        bluf: "Use this spreadsheet",
        relatedPages: ["/compare"],
        statistics: [
          {
            stat: "74% of newly married couples went over budget.",
            source: "Zola First Look Report 2025",
            sourceUrl:
              "https://www.zola.com/expert-advice/the-first-look-report-2025",
          },
        ],
      }),
    );

    expect(parsed.statistics).toEqual([
      {
        stat: "74% of newly married couples went over budget.",
        source: "Zola First Look Report 2025",
        sourceUrl:
          "https://www.zola.com/expert-advice/the-first-look-report-2025",
      },
    ]);
  });
});
