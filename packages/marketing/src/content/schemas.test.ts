import { describe, it, expect } from "vitest";
import {
  baseContentSchema,
  alternativeSchema,
  comparisonSchema,
  pricingBreakdownSchema,
  listicleSchema,
  guideSchema,
  statePageSchema,
  verticalPageSchema,
  orgTypePageSchema,
  featureSchema,
  reviewSchema,
  phasePageSchema,
  goalPageSchema,
  symptomsSchema,
  leadMagnetSchema,
} from "./schemas";

const validBase = {
  title: "Test Title",
  description: "A description",
  publishedAt: "2026-01-01",
  updatedAt: "2026-01-02",
  buyerStage: "tofu" as const,
  bluf: "Bottom line up front",
  relatedPages: ["/resources/guides/test-guide"],
};

describe("baseContentSchema", () => {
  it("parses valid base content with defaults", () => {
    const result = baseContentSchema.parse(validBase);
    expect(result.schema).toBe("Article");
    expect(result.faqs).toEqual([]);
    expect(result.relatedPages).toEqual(["/resources/guides/test-guide"]);
    expect(result.noindex).toBe(false);
  });

  it("rejects empty relatedPages array", () => {
    expect(() =>
      baseContentSchema.parse({ ...validBase, relatedPages: [] }),
    ).toThrow();
  });

  it("accepts all buyerStage values", () => {
    for (const stage of ["tofu", "mofu", "bofu"]) {
      const result = baseContentSchema.parse({
        ...validBase,
        buyerStage: stage,
      });
      expect(result.buyerStage).toBe(stage);
    }
  });

  it("rejects invalid buyerStage", () => {
    expect(() =>
      baseContentSchema.parse({ ...validBase, buyerStage: "invalid" }),
    ).toThrow();
  });

  it("accepts optional ctaMode", () => {
    const result = baseContentSchema.parse({
      ...validBase,
      ctaMode: "convert",
    });
    expect(result.ctaMode).toBe("convert");
  });

  it("accepts schema enum values", () => {
    for (const s of ["Article", "FAQPage", "HowTo", "Product", "ItemList"]) {
      const result = baseContentSchema.parse({ ...validBase, schema: s });
      expect(result.schema).toBe(s);
    }
  });

  it("accepts faqs array", () => {
    const result = baseContentSchema.parse({
      ...validBase,
      faqs: [{ q: "Why?", a: "Because." }],
    });
    expect(result.faqs).toHaveLength(1);
  });

  it("rejects missing required fields", () => {
    expect(() => baseContentSchema.parse({})).toThrow();
    expect(() => baseContentSchema.parse({ title: "x" })).toThrow();
  });

  it("accepts optional ogImage", () => {
    const result = baseContentSchema.parse({
      ...validBase,
      ogImage: "/images/og.png",
    });
    expect(result.ogImage).toBe("/images/og.png");
  });

  it("defaults ogImage to undefined when omitted", () => {
    const result = baseContentSchema.parse(validBase);
    expect(result.ogImage).toBeUndefined();
  });

  it("defaults tags to empty array", () => {
    const result = baseContentSchema.parse(validBase);
    expect(result.tags).toEqual([]);
  });

  it("accepts tags array", () => {
    const result = baseContentSchema.parse({
      ...validBase,
      tags: ["seo", "marketing"],
    });
    expect(result.tags).toEqual(["seo", "marketing"]);
  });

  it("defaults statistics to empty array", () => {
    const result = baseContentSchema.parse(validBase);
    expect(result.statistics).toEqual([]);
  });

  it("accepts statistics array with source and optional sourceUrl", () => {
    const result = baseContentSchema.parse({
      ...validBase,
      statistics: [
        { stat: "73% of orgs use spreadsheets", source: "NTEN 2023" },
        {
          stat: "Saves 12 hrs/mo",
          source: "NFF Survey",
          sourceUrl: "https://nff.org",
        },
      ],
    });
    expect(result.statistics).toHaveLength(2);
    expect(result.statistics[1]!.sourceUrl).toBe("https://nff.org");
  });

  it("accepts targetPersona as an array of strings", () => {
    const result = baseContentSchema.parse({
      ...validBase,
      targetPersona: ["owner-operator", "small-shop-owner"],
    });
    expect(result.targetPersona).toEqual([
      "owner-operator",
      "small-shop-owner",
    ]);
  });

  it("accepts missing targetPersona (backward compat)", () => {
    const result = baseContentSchema.parse(validBase);
    expect(result.targetPersona).toBeUndefined();
  });

  it("rejects targetPersona as a plain string", () => {
    expect(() =>
      baseContentSchema.parse({ ...validBase, targetPersona: "not-an-array" }),
    ).toThrow();
  });

  it("rejects targetPersona with non-string elements", () => {
    expect(() =>
      baseContentSchema.parse({ ...validBase, targetPersona: [123] }),
    ).toThrow();
  });
});

describe("extended schemas inherit targetPersona from base", () => {
  const validAlternative = {
    ...validBase,
    buyerStage: "bofu" as const,
    competitor: {
      name: "Rival",
      slug: "rival",
      pricing: "$50/mo",
      weakness: "slow",
    },
    targetPersona: ["fleet-manager"],
  };

  it("alternativeSchema accepts targetPersona", () => {
    const result = alternativeSchema.parse(validAlternative);
    expect(result.targetPersona).toEqual(["fleet-manager"]);
  });

  it("comparisonSchema accepts targetPersona", () => {
    const result = comparisonSchema.parse({
      ...validBase,
      buyerStage: "mofu" as const,
      competitorA: { name: "A", slug: "a", pricing: "$10" },
      competitorB: { name: "B", slug: "b", pricing: "$20" },
      verdict: "A wins",
      targetPersona: ["office-manager"],
    });
    expect(result.targetPersona).toEqual(["office-manager"]);
  });

  it("guideSchema accepts targetPersona", () => {
    const result = guideSchema.parse({
      ...validBase,
      targetPersona: ["solo-operator"],
    });
    expect(result.targetPersona).toEqual(["solo-operator"]);
  });
});

describe("alternativeSchema", () => {
  it("parses valid alternative with competitor", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
    });
    expect(result.competitor.name).toBe("Rival");
    expect(result.competitor.weakness).toBe("slow support");
  });

  it("accepts optional setupFee", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow",
        setupFee: "$500",
      },
    });
    expect(result.competitor.setupFee).toBe("$500");
  });

  it("accepts optional url", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow",
        url: "https://rival.com",
      },
    });
    expect(result.competitor.url).toBe("https://rival.com");
  });

  it("allows missing url", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow",
      },
    });
    expect(result.competitor.url).toBeUndefined();
  });

  it("rejects missing competitor", () => {
    expect(() => alternativeSchema.parse(validBase)).toThrow();
  });

  it("accepts tableData with name, columns, and rows", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      tableData: {
        name: "Feature Comparison",
        columns: ["Feature", "Rival", "Us"],
        rows: [
          ["Trust Accounting", "Add-on ($29/mo)", "Included"],
          ["Mobile App", "Yes", "Yes"],
        ],
      },
    });
    expect(result.tableData?.name).toBe("Feature Comparison");
    expect(result.tableData?.columns).toEqual(["Feature", "Rival", "Us"]);
    expect(result.tableData?.rows).toHaveLength(2);
  });

  it("accepts tableData with optional description", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      tableData: {
        name: "Pricing Table",
        description: "Side-by-side pricing breakdown",
        columns: ["Plan", "Price"],
        rows: [["Starter", "$59/user/mo"]],
      },
    });
    expect(result.tableData?.description).toBe(
      "Side-by-side pricing breakdown",
    );
  });

  it("allows tableData to be omitted", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
    });
    expect(result.tableData).toBeUndefined();
  });

  it("accepts top-level pros array", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      pros: ["Easy to use", "Affordable"],
    });
    expect(result.pros).toEqual(["Easy to use", "Affordable"]);
  });

  it("accepts top-level cons array", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      cons: ["No mobile app", "Limited reports"],
    });
    expect(result.cons).toEqual(["No mobile app", "Limited reports"]);
  });

  it("defaults top-level pros to empty array when absent", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
    });
    expect(result.pros).toEqual([]);
  });

  it("defaults top-level cons to empty array when absent", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
    });
    expect(result.cons).toEqual([]);
  });

  it("top-level pros/cons do not affect competitor.pros/cons", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
        pros: ["Good UI"],
        cons: ["Expensive"],
      },
      pros: ["Fast setup"],
      cons: ["No API"],
    });
    expect(result.competitor.pros).toEqual(["Good UI"]);
    expect(result.competitor.cons).toEqual(["Expensive"]);
    expect(result.pros).toEqual(["Fast setup"]);
    expect(result.cons).toEqual(["No API"]);
  });

  it("normalizes answers with question/answer format to q/a", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      answers: [{ question: "What is this?", answer: "It is a thing." }],
    });
    expect(result.answers).toEqual([
      { q: "What is this?", a: "It is a thing." },
    ]);
  });

  it("accepts answers with q/a format unchanged", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      answers: [{ q: "What is this?", a: "It is a thing." }],
    });
    expect(result.answers).toEqual([
      { q: "What is this?", a: "It is a thing." },
    ]);
  });

  it("defaults expertQuotes to undefined when omitted", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
    });
    expect(result.expertQuotes).toBeUndefined();
  });

  it("accepts expertQuotes with required fields", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      expertQuotes: [
        {
          quote: "ServiceTitan is overbuilt for small shops.",
          personName: "Mike Johnson",
        },
      ],
    });
    expect(result.expertQuotes).toHaveLength(1);
    expect(result.expertQuotes![0]!.personName).toBe("Mike Johnson");
    expect(result.expertQuotes![0]!.jobTitle).toBeUndefined();
    expect(result.expertQuotes![0]!.organization).toBeUndefined();
  });

  it("accepts expertQuotes with all optional fields", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      expertQuotes: [
        {
          quote: "Small contractors need simple tools.",
          personName: "Sarah Lee",
          jobTitle: "HVAC Business Coach",
          organization: "TradeCoach Inc.",
        },
      ],
    });
    expect(result.expertQuotes![0]!.jobTitle).toBe("HVAC Business Coach");
    expect(result.expertQuotes![0]!.organization).toBe("TradeCoach Inc.");
  });

  it("rejects expertQuotes entry missing personName", () => {
    expect(() =>
      alternativeSchema.parse({
        ...validBase,
        competitor: {
          name: "Rival",
          slug: "rival",
          pricing: "$50/mo",
          weakness: "slow support",
        },
        expertQuotes: [{ quote: "Some quote." }],
      }),
    ).toThrow();
  });

  it("defaults definitions to empty array when omitted", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
    });
    expect(result.definitions).toEqual([]);
  });

  it("accepts valid definitions array with term and definition", () => {
    const result = alternativeSchema.parse({
      ...validBase,
      competitor: {
        name: "Rival",
        slug: "rival",
        pricing: "$50/mo",
        weakness: "slow support",
      },
      definitions: [
        {
          term: "tee-time aggregator",
          definition:
            "A platform that collects tee times from multiple courses.",
        },
        {
          term: "P2P exchange",
          definition: "A marketplace where players trade tee times directly.",
        },
      ],
    });
    expect(result.definitions).toHaveLength(2);
    expect(result.definitions[0]!.term).toBe("tee-time aggregator");
    expect(result.definitions[1]!.definition).toBe(
      "A marketplace where players trade tee times directly.",
    );
  });

  it("rejects definitions item missing term", () => {
    expect(() =>
      alternativeSchema.parse({
        ...validBase,
        competitor: {
          name: "Rival",
          slug: "rival",
          pricing: "$50/mo",
          weakness: "slow support",
        },
        definitions: [{ definition: "A platform that collects tee times." }],
      }),
    ).toThrow();
  });

  it("rejects definitions item missing definition", () => {
    expect(() =>
      alternativeSchema.parse({
        ...validBase,
        competitor: {
          name: "Rival",
          slug: "rival",
          pricing: "$50/mo",
          weakness: "slow support",
        },
        definitions: [{ term: "tee-time aggregator" }],
      }),
    ).toThrow();
  });
});

describe("comparisonSchema", () => {
  const validComparison = {
    ...validBase,
    competitorA: { name: "A", slug: "a", pricing: "$10" },
    competitorB: { name: "B", slug: "b", pricing: "$20" },
    verdict: "A wins",
  };

  it("parses valid comparison", () => {
    const result = comparisonSchema.parse(validComparison);
    expect(result.competitorA.name).toBe("A");
    expect(result.competitorB.name).toBe("B");
    expect(result.verdict).toBe("A wins");
  });

  it("defaults disableProsConsSchema to false", () => {
    const result = comparisonSchema.parse(validComparison);
    expect(result.disableProsConsSchema).toBe(false);
  });

  it("accepts disableProsConsSchema when provided", () => {
    const result = comparisonSchema.parse({
      ...validComparison,
      disableProsConsSchema: true,
    });
    expect(result.disableProsConsSchema).toBe(true);
  });

  it("rejects missing verdict", () => {
    const { verdict: _, ...noVerdict } = validComparison;
    expect(() => comparisonSchema.parse(noVerdict)).toThrow();
  });

  it("accepts pricingStats array", () => {
    const result = comparisonSchema.parse({
      ...validComparison,
      pricingStats: [
        { stat: "Clio starts at $49/user/mo", source: "Clio.com 2026" },
        {
          stat: "Average small firm spends $180/mo on legal software",
          source: "ABA TechReport 2025",
          sourceUrl: "https://www.americanbar.org/techreport",
        },
      ],
    });
    expect(result.pricingStats).toHaveLength(2);
    expect(result.pricingStats?.[1]!.sourceUrl).toBe(
      "https://www.americanbar.org/techreport",
    );
  });

  it("accepts pricingStats entry without sourceUrl", () => {
    const result = comparisonSchema.parse({
      ...validComparison,
      pricingStats: [
        { stat: "MyCase starts at $39/user/mo", source: "MyCase.com 2026" },
      ],
    });
    expect(result.pricingStats?.[0]!.sourceUrl).toBeUndefined();
  });

  it("allows pricingStats to be omitted", () => {
    const result = comparisonSchema.parse(validComparison);
    expect(result.pricingStats).toBeUndefined();
  });
});

describe("pricingBreakdownSchema", () => {
  const validPricing = {
    ...validBase,
    competitor: { name: "X", slug: "x", pricing: "$30" },
    tiers: [{ name: "Basic", price: "$10", features: ["f1"] }],
    hiddenCosts: ["setup fee"],
  };

  it("parses valid pricing breakdown", () => {
    const result = pricingBreakdownSchema.parse(validPricing);
    expect(result.tiers).toHaveLength(1);
    expect(result.tiers[0]!.features).toContain("f1");
    expect(result.hiddenCosts).toContain("setup fee");
  });

  it("rejects missing tiers", () => {
    const { tiers: _, ...noTiers } = validPricing;
    expect(() => pricingBreakdownSchema.parse(noTiers)).toThrow();
  });

  it("defaults expertQuotes to undefined when omitted", () => {
    const result = pricingBreakdownSchema.parse(validPricing);
    expect(result.expertQuotes).toBeUndefined();
  });

  it("accepts expertQuotes with required fields", () => {
    const result = pricingBreakdownSchema.parse({
      ...validPricing,
      expertQuotes: [
        {
          quote: "Hidden fees are the biggest complaint we hear.",
          personName: "Tom Davis",
        },
      ],
    });
    expect(result.expertQuotes).toHaveLength(1);
    expect(result.expertQuotes![0]!.personName).toBe("Tom Davis");
    expect(result.expertQuotes![0]!.jobTitle).toBeUndefined();
    expect(result.expertQuotes![0]!.organization).toBeUndefined();
  });

  it("accepts expertQuotes with all optional fields", () => {
    const result = pricingBreakdownSchema.parse({
      ...validPricing,
      expertQuotes: [
        {
          quote: "Transparent pricing builds trust with contractors.",
          personName: "Lisa Chen",
          jobTitle: "Pricing Analyst",
          organization: "Field Service Insights",
        },
      ],
    });
    expect(result.expertQuotes![0]!.jobTitle).toBe("Pricing Analyst");
    expect(result.expertQuotes![0]!.organization).toBe(
      "Field Service Insights",
    );
  });

  it("rejects expertQuotes entry missing personName", () => {
    expect(() =>
      pricingBreakdownSchema.parse({
        ...validPricing,
        expertQuotes: [{ quote: "Some quote." }],
      }),
    ).toThrow();
  });
});

describe("listicleSchema", () => {
  const validListicle = {
    ...validBase,
    category: "CRM",
    qualifier: "best",
    tools: [
      {
        name: "Tool1",
        summary: "A tool",
        pros: ["fast"],
        cons: ["expensive"],
        pricing: "$99/mo",
        verdict: "Good for teams",
      },
    ],
  };

  it("parses valid listicle", () => {
    const result = listicleSchema.parse(validListicle);
    expect(result.category).toBe("CRM");
    expect(result.tools[0]!.pros).toContain("fast");
  });

  it("rejects missing tools", () => {
    const { tools: _, ...noTools } = validListicle;
    expect(() => listicleSchema.parse(noTools)).toThrow();
  });
});

describe("guideSchema", () => {
  it("parses valid guide with optional fields", () => {
    const result = guideSchema.parse({
      ...validBase,
      steps: [{ title: "Step 1", content: "Do this" }],
      timeEstimate: "10 min",
      difficulty: "beginner",
    });
    expect(result.steps).toHaveLength(1);
    expect(result.timeEstimate).toBe("10 min");
  });

  it("parses guide without optional fields", () => {
    const result = guideSchema.parse(validBase);
    expect(result.steps).toBeUndefined();
    expect(result.timeEstimate).toBeUndefined();
    expect(result.difficulty).toBeUndefined();
  });

  it("defaults definitions to empty array", () => {
    const result = guideSchema.parse(validBase);
    expect(result.definitions).toEqual([]);
  });

  it("accepts definitions array", () => {
    const result = guideSchema.parse({
      ...validBase,
      definitions: [
        {
          term: "Restricted funds",
          definition: "Funds designated for a specific purpose.",
        },
      ],
    });
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0]!.term).toBe("Restricted funds");
  });

  it("accepts optional tableData", () => {
    const result = guideSchema.parse({
      ...validBase,
      tableData: {
        name: "Wedding cost breakdown",
        columns: ["Category", "Budget", "Average"],
        rows: [["Venue", "$5,000", "$15,000"]],
      },
    });
    expect(result.tableData?.name).toBe("Wedding cost breakdown");
    expect(result.tableData?.columns).toHaveLength(3);
  });

  it("defaults tableData to undefined when omitted", () => {
    const result = guideSchema.parse(validBase);
    expect(result.tableData).toBeUndefined();
  });
});

describe("statePageSchema", () => {
  const validState = {
    ...validBase,
    state: "Texas",
    stateCode: "TX",
    establishmentCount: 5000,
    topMetros: [{ name: "Houston", count: 1200 }],
    licensingNotes: "License required",
    seasonalNotes: "Summer peak",
  };

  it("parses valid state page", () => {
    const result = statePageSchema.parse(validState);
    expect(result.state).toBe("Texas");
    expect(result.stateCode).toBe("TX");
    expect(result.establishmentCount).toBe(5000);
    expect(result.topMetros?.[0]!.name).toBe("Houston");
  });

  it("rejects missing state fields", () => {
    expect(() => statePageSchema.parse(validBase)).toThrow();
  });

  it("parses with only state + stateCode (no HVAC or generic fields)", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "Florida",
      stateCode: "FL",
    });
    expect(result.state).toBe("Florida");
    expect(result.stateCode).toBe("FL");
    expect(result.establishmentCount).toBeUndefined();
    expect(result.topMetros).toBeUndefined();
    expect(result.licensingNotes).toBeUndefined();
    expect(result.seasonalNotes).toBeUndefined();
  });

  it("parses with new generic fields (marketSize, topMarkets, regulations)", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "California",
      stateCode: "CA",
      marketSize: 25000,
      topMarkets: [
        { name: "Los Angeles", count: 5000, label: "HOA communities" },
      ],
      regulations: [
        {
          heading: "Davis-Stirling Act",
          content: "Governs HOAs",
          variant: "warning",
        },
      ],
    });
    expect(result.marketSize).toBe(25000);
    expect(result.topMarkets[0]!.name).toBe("Los Angeles");
    expect(result.topMarkets[0]!.label).toBe("HOA communities");
    expect(result.regulations[0]!.variant).toBe("warning");
  });

  it("parses with both legacy HVAC and new generic fields (mixed usage)", () => {
    const result = statePageSchema.parse({
      ...validState,
      marketSize: 8000,
      topMarkets: [{ name: "Dallas", count: 3000 }],
      regulations: [{ heading: "HVAC License", content: "Required statewide" }],
    });
    expect(result.establishmentCount).toBe(5000);
    expect(result.marketSize).toBe(8000);
    expect(result.topMarkets[0]!.name).toBe("Dallas");
    expect(result.regulations[0]!.heading).toBe("HVAC License");
  });

  it("defaults regulations variant to info", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "Oregon",
      stateCode: "OR",
      regulations: [{ heading: "Test", content: "Content" }],
    });
    expect(result.regulations[0]!.variant).toBe("info");
  });

  it("defaults topMarkets to empty array", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "Nevada",
      stateCode: "NV",
    });
    expect(result.topMarkets).toEqual([]);
  });

  it("defaults regulations to empty array", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "Utah",
      stateCode: "UT",
    });
    expect(result.regulations).toEqual([]);
  });

  it("accepts optional pricingStats and answers", () => {
    const result = statePageSchema.parse({
      ...validState,
      pricingStats: [{ stat: "90,000 nonprofits", source: "CA AG Office" }],
      answers: [{ q: "Q?", a: "A." }],
    });
    expect(result.pricingStats).toHaveLength(1);
    expect(result.answers).toHaveLength(1);
  });

  it("accepts answers in question/answer format and normalizes to q/a", () => {
    const result = statePageSchema.parse({
      ...validState,
      answers: [
        {
          question: "What software do CA nonprofits need?",
          answer: "Fund accounting software.",
        },
      ],
    });
    expect(result.answers).toHaveLength(1);
    expect(result.answers![0]!.q).toBe("What software do CA nonprofits need?");
    expect(result.answers![0]!.a).toBe("Fund accounting software.");
  });

  it("defaults definitions to empty array when omitted", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "Texas",
      stateCode: "TX",
    });
    expect(result.definitions).toEqual([]);
  });

  it("parses definitions with term and definition fields", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "California",
      stateCode: "CA",
      definitions: [
        {
          term: "CMIA",
          definition:
            "Confidentiality of Medical Information Act — California state law governing PHI.",
        },
        {
          term: "BAA",
          definition:
            "Business Associate Agreement — required by HIPAA for covered entities.",
        },
      ],
    });
    expect(result.definitions).toHaveLength(2);
    expect(result.definitions[0]!.term).toBe("CMIA");
    expect(result.definitions[0]!.definition).toContain("California state law");
    expect(result.definitions[1]!.term).toBe("BAA");
  });

  it("defaults expertQuotes to undefined when omitted", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "Texas",
      stateCode: "TX",
    });
    expect(result.expertQuotes).toBeUndefined();
  });

  it("parses expertQuotes with required and optional fields", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "New York",
      stateCode: "NY",
      expertQuotes: [
        {
          quote: "HIPAA compliance is non-negotiable for small clinics.",
          personName: "Dr. Jane Smith",
          jobTitle: "Privacy Officer",
          organization: "NY Health Assoc.",
        },
      ],
    });
    expect(result.expertQuotes).toHaveLength(1);
    expect(result.expertQuotes![0]!.personName).toBe("Dr. Jane Smith");
    expect(result.expertQuotes![0]!.jobTitle).toBe("Privacy Officer");
    expect(result.expertQuotes![0]!.organization).toBe("NY Health Assoc.");
  });

  it("parses expertQuotes with only required fields (no jobTitle or organization)", () => {
    const result = statePageSchema.parse({
      ...validBase,
      state: "Florida",
      stateCode: "FL",
      expertQuotes: [
        {
          quote: "Audit trails matter most.",
          personName: "Alice Johnson",
        },
      ],
    });
    expect(result.expertQuotes).toHaveLength(1);
    expect(result.expertQuotes![0]!.jobTitle).toBeUndefined();
    expect(result.expertQuotes![0]!.organization).toBeUndefined();
  });
});

describe("verticalPageSchema", () => {
  const validVertical = {
    ...validBase,
    verticalType: "churches",
    keyPainPoints: ["Restricted fund tracking", "Multi-fund reporting"],
    commonGrantTypes: ["Faith-based grants", "Community foundation grants"],
    complianceNotes: "Must file Form 990 if over $200K gross receipts",
  };

  it("parses valid vertical page with required fields", () => {
    const result = verticalPageSchema.parse(validVertical);
    expect(result.verticalType).toBe("churches");
    expect(result.keyPainPoints).toHaveLength(2);
    expect(result.commonGrantTypes).toHaveLength(2);
    expect(result.complianceNotes).toBe(
      "Must file Form 990 if over $200K gross receipts",
    );
  });

  it("accepts optional estimatedOrgCount", () => {
    const result = verticalPageSchema.parse({
      ...validVertical,
      estimatedOrgCount: 380000,
    });
    expect(result.estimatedOrgCount).toBe(380000);
  });

  it("defaults estimatedOrgCount to undefined when omitted", () => {
    const result = verticalPageSchema.parse(validVertical);
    expect(result.estimatedOrgCount).toBeUndefined();
  });

  it("accepts optional pricingStats", () => {
    const result = verticalPageSchema.parse({
      ...validVertical,
      pricingStats: [
        {
          stat: "73% of churches use spreadsheets for donor tracking",
          source: "ECFA 2024 Report",
          sourceUrl: "https://www.ecfa.org",
        },
      ],
    });
    expect(result.pricingStats).toHaveLength(1);
    expect(result.pricingStats![0]!.stat).toContain("73%");
  });

  it("defaults pricingStats to undefined when omitted", () => {
    const result = verticalPageSchema.parse(validVertical);
    expect(result.pricingStats).toBeUndefined();
  });

  it("accepts optional tableData", () => {
    const result = verticalPageSchema.parse({
      ...validVertical,
      tableData: {
        name: "Donor Management Comparison",
        columns: ["Feature", "Spreadsheet", "GrantPipe"],
        rows: [["Restricted fund tracking", "Manual", "Automated"]],
      },
    });
    expect(result.tableData?.name).toBe("Donor Management Comparison");
    expect(result.tableData?.columns).toHaveLength(3);
  });

  it("defaults tableData to undefined when omitted", () => {
    const result = verticalPageSchema.parse(validVertical);
    expect(result.tableData).toBeUndefined();
  });

  it("accepts optional answers", () => {
    const result = verticalPageSchema.parse({
      ...validVertical,
      answers: [
        {
          q: "Do churches need grant management software?",
          a: "Yes. Churches managing multiple restricted funds benefit from automated compliance tracking to avoid commingling funds and simplify Form 990 reporting.",
        },
      ],
    });
    expect(result.answers).toHaveLength(1);
    expect(result.answers![0]!.q).toContain("churches");
  });

  it("defaults answers to undefined when omitted", () => {
    const result = verticalPageSchema.parse(validVertical);
    expect(result.answers).toBeUndefined();
  });

  it("rejects missing verticalType", () => {
    const { verticalType: _, ...noType } = validVertical;
    expect(() => verticalPageSchema.parse(noType)).toThrow();
  });

  it("rejects missing keyPainPoints", () => {
    const { keyPainPoints: _, ...noPainPoints } = validVertical;
    expect(() => verticalPageSchema.parse(noPainPoints)).toThrow();
  });

  it("rejects missing complianceNotes", () => {
    const { complianceNotes: _, ...noNotes } = validVertical;
    expect(() => verticalPageSchema.parse(noNotes)).toThrow();
  });

  it("inherits base content fields", () => {
    const result = verticalPageSchema.parse(validVertical);
    expect(result.title).toBe("Test Title");
    expect(result.buyerStage).toBe("tofu");
    expect(result.schema).toBe("Article");
  });
});

describe("orgTypePageSchema", () => {
  const validOrgType = {
    ...validBase,
    orgType: "Churches",
    orgTypeSlug: "churches",
    uniqueNeeds: ["Tithe tracking", "Building fund restrictions"],
  };

  it("parses valid org-type page with required fields", () => {
    const result = orgTypePageSchema.parse(validOrgType);
    expect(result.orgType).toBe("Churches");
    expect(result.orgTypeSlug).toBe("churches");
    expect(result.uniqueNeeds).toEqual([
      "Tithe tracking",
      "Building fund restrictions",
    ]);
  });

  it("accepts optional estimatedCount", () => {
    const result = orgTypePageSchema.parse({
      ...validOrgType,
      estimatedCount: 380000,
    });
    expect(result.estimatedCount).toBe(380000);
  });

  it("defaults estimatedCount to undefined when omitted", () => {
    const result = orgTypePageSchema.parse(validOrgType);
    expect(result.estimatedCount).toBeUndefined();
  });

  it("accepts optional complianceNotes", () => {
    const result = orgTypePageSchema.parse({
      ...validOrgType,
      complianceNotes: "Must file Form 990-EZ if under $200K revenue",
    });
    expect(result.complianceNotes).toBe(
      "Must file Form 990-EZ if under $200K revenue",
    );
  });

  it("defaults complianceNotes to undefined when omitted", () => {
    const result = orgTypePageSchema.parse(validOrgType);
    expect(result.complianceNotes).toBeUndefined();
  });

  it("rejects missing orgType", () => {
    const { orgType: _, ...noOrgType } = validOrgType;
    expect(() => orgTypePageSchema.parse(noOrgType)).toThrow();
  });

  it("rejects missing orgTypeSlug", () => {
    const { orgTypeSlug: _, ...noSlug } = validOrgType;
    expect(() => orgTypePageSchema.parse(noSlug)).toThrow();
  });

  it("rejects missing uniqueNeeds", () => {
    const { uniqueNeeds: _, ...noNeeds } = validOrgType;
    expect(() => orgTypePageSchema.parse(noNeeds)).toThrow();
  });

  it("accepts optional answers", () => {
    const result = orgTypePageSchema.parse({
      ...validOrgType,
      answers: [
        {
          q: "What accounting software works for churches?",
          a: "Churches need fund accounting software that tracks restricted donations, tithe income, and building fund restrictions separately.",
        },
      ],
    });
    expect(result.answers).toHaveLength(1);
    expect(result.answers![0]!.q).toContain("churches");
  });

  it("defaults answers to undefined when omitted", () => {
    const result = orgTypePageSchema.parse(validOrgType);
    expect(result.answers).toBeUndefined();
  });

  it("inherits base content fields", () => {
    const result = orgTypePageSchema.parse(validOrgType);
    expect(result.title).toBe("Test Title");
    expect(result.buyerStage).toBe("tofu");
    expect(result.schema).toBe("Article");
  });
});

describe("reviewSchema", () => {
  const validReview = {
    ...validBase,
    competitor: {
      name: "Clio",
      slug: "clio",
      pricing: "$69/user/mo",
    },
    verdict:
      "Clio is overpriced for small firms; CaelusLaw includes IOLTA at no extra cost.",
  };

  it("parses valid review with required fields", () => {
    const result = reviewSchema.parse(validReview);
    expect(result.competitor.name).toBe("Clio");
    expect(result.competitor.slug).toBe("clio");
    expect(result.competitor.pricing).toBe("$69/user/mo");
    expect(result.verdict).toBe(
      "Clio is overpriced for small firms; CaelusLaw includes IOLTA at no extra cost.",
    );
  });

  it("accepts optional competitor url", () => {
    const result = reviewSchema.parse({
      ...validReview,
      competitor: { ...validReview.competitor, url: "https://clio.com" },
    });
    expect(result.competitor.url).toBe("https://clio.com");
  });

  it("defaults competitor url to undefined when omitted", () => {
    const result = reviewSchema.parse(validReview);
    expect(result.competitor.url).toBeUndefined();
  });

  it("rejects missing competitor", () => {
    const { competitor: _, ...noCompetitor } = validReview;
    expect(() => reviewSchema.parse(noCompetitor)).toThrow();
  });

  it("rejects missing verdict", () => {
    const { verdict: _, ...noVerdict } = validReview;
    expect(() => reviewSchema.parse(noVerdict)).toThrow();
  });

  it("rejects competitor missing required name field", () => {
    expect(() =>
      reviewSchema.parse({
        ...validReview,
        competitor: { slug: "clio", pricing: "$69/user/mo" },
      }),
    ).toThrow();
  });

  it("rejects competitor missing required slug field", () => {
    expect(() =>
      reviewSchema.parse({
        ...validReview,
        competitor: { name: "Clio", pricing: "$69/user/mo" },
      }),
    ).toThrow();
  });

  it("rejects competitor missing required pricing field", () => {
    expect(() =>
      reviewSchema.parse({
        ...validReview,
        competitor: { name: "Clio", slug: "clio" },
      }),
    ).toThrow();
  });

  it("accepts optional tableData", () => {
    const result = reviewSchema.parse({
      ...validReview,
      tableData: {
        name: "Clio vs CaelusLaw",
        columns: ["Feature", "Clio", "CaelusLaw"],
        rows: [["IOLTA included", "Add-on", "Yes"]],
      },
    });
    expect(result.tableData?.name).toBe("Clio vs CaelusLaw");
    expect(result.tableData?.columns).toHaveLength(3);
  });

  it("defaults tableData to undefined when omitted", () => {
    const result = reviewSchema.parse(validReview);
    expect(result.tableData).toBeUndefined();
  });

  it("accepts optional proscons", () => {
    const result = reviewSchema.parse({
      ...validReview,
      proscons: [
        {
          subject: "Clio",
          pros: ["Large ecosystem", "Mobile app"],
          cons: ["IOLTA sold separately", "Expensive for small firms"],
        },
      ],
    });
    expect(result.proscons).toHaveLength(1);
    expect(result.proscons![0]!.pros).toContain("Large ecosystem");
    expect(result.proscons![0]!.cons).toContain("IOLTA sold separately");
  });

  it("defaults proscons to undefined when omitted", () => {
    const result = reviewSchema.parse(validReview);
    expect(result.proscons).toBeUndefined();
  });

  it("accepts optional answers", () => {
    const result = reviewSchema.parse({
      ...validReview,
      answers: [
        {
          q: "Is Clio good for small firms?",
          a: "It depends on budget.",
        },
      ],
    });
    expect(result.answers).toHaveLength(1);
    expect(result.answers![0]!.q).toContain("Clio");
  });

  it("defaults answers to undefined when omitted", () => {
    const result = reviewSchema.parse(validReview);
    expect(result.answers).toBeUndefined();
  });

  it("accepts optional pricingStats", () => {
    const result = reviewSchema.parse({
      ...validReview,
      pricingStats: [
        {
          stat: "Clio charges $39/mo extra for IOLTA",
          source: "Clio pricing page",
        },
      ],
    });
    expect(result.pricingStats).toHaveLength(1);
    expect(result.pricingStats![0]!.stat).toContain("Clio");
  });

  it("defaults pricingStats to undefined when omitted", () => {
    const result = reviewSchema.parse(validReview);
    expect(result.pricingStats).toBeUndefined();
  });

  it("inherits base content fields with defaults", () => {
    const result = reviewSchema.parse(validReview);
    expect(result.title).toBe("Test Title");
    expect(result.buyerStage).toBe("tofu");
    expect(result.schema).toBe("Article");
    expect(result.faqs).toEqual([]);
    expect(result.relatedPages).toEqual(["/resources/guides/test-guide"]);
    expect(result.noindex).toBe(false);
  });

  it("rejects missing base required fields", () => {
    expect(() => reviewSchema.parse({})).toThrow();
    expect(() =>
      reviewSchema.parse({
        competitor: { name: "Clio", slug: "clio", pricing: "$69" },
        verdict: "Too expensive",
      }),
    ).toThrow();
  });
});

describe("featureSchema", () => {
  it("parses valid feature with only base fields", () => {
    const result = featureSchema.parse(validBase);
    expect(result.title).toBe("Test Title");
    expect(result.buyerStage).toBe("tofu");
    expect(result.tableData).toBeUndefined();
    expect(result.proscons).toBeUndefined();
    expect(result.answers).toBeUndefined();
    expect(result.pricingStats).toBeUndefined();
  });

  it("accepts optional tableData", () => {
    const result = featureSchema.parse({
      ...validBase,
      tableData: {
        name: "Feature Comparison",
        columns: ["Feature", "CaelusLaw", "Clio"],
        rows: [["IOLTA included", "Yes", "Add-on"]],
      },
    });
    expect(result.tableData?.name).toBe("Feature Comparison");
    expect(result.tableData?.columns).toHaveLength(3);
    expect(result.tableData?.rows[0]).toEqual([
      "IOLTA included",
      "Yes",
      "Add-on",
    ]);
  });

  it("accepts optional proscons", () => {
    const result = featureSchema.parse({
      ...validBase,
      proscons: [
        {
          subject: "CaelusLaw Trust Accounting",
          pros: ["IOLTA included", "No add-on fee"],
          cons: ["New product"],
        },
      ],
    });
    expect(result.proscons).toHaveLength(1);
    expect(result.proscons![0]!.pros).toContain("IOLTA included");
  });

  it("accepts optional answers", () => {
    const result = featureSchema.parse({
      ...validBase,
      answers: [{ q: "What is IOLTA?", a: "A trust accounting standard." }],
    });
    expect(result.answers).toHaveLength(1);
    expect(result.answers![0]!.q).toBe("What is IOLTA?");
  });

  it("accepts optional pricingStats", () => {
    const result = featureSchema.parse({
      ...validBase,
      pricingStats: [
        {
          stat: "Clio charges $39/mo extra for trust accounting",
          source: "Clio pricing page",
        },
      ],
    });
    expect(result.pricingStats).toHaveLength(1);
    expect(result.pricingStats![0]!.stat).toContain("Clio");
  });

  it("rejects missing required base fields", () => {
    expect(() => featureSchema.parse({})).toThrow();
    expect(() => featureSchema.parse({ title: "Only title" })).toThrow();
  });
});

describe("phasePageSchema", () => {
  const validPhase = {
    title: "Luteal Phase Nutrition Guide",
    description: "What to eat in your luteal phase",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    buyerStage: "tofu" as const,
    bluf: "Eat magnesium-rich foods in your luteal phase.",
    phase: "luteal" as const,
    relatedPages: ["/resources/guides/luteal-phase"],
  };

  it("parses valid phase page with all required fields", () => {
    const result = phasePageSchema.parse(validPhase);
    expect(result.phase).toBe("luteal");
    expect(result.title).toBe("Luteal Phase Nutrition Guide");
    expect(result.bluf).toBe("Eat magnesium-rich foods in your luteal phase.");
  });

  it("accepts all valid phase enum values", () => {
    const phases = [
      "follicular",
      "ovulatory",
      "luteal",
      "menstrual",
      "hormone",
      "cycle",
    ] as const;
    for (const phase of phases) {
      const result = phasePageSchema.parse({ ...validPhase, phase });
      expect(result.phase).toBe(phase);
    }
  });

  it("rejects invalid phase value", () => {
    expect(() =>
      phasePageSchema.parse({ ...validPhase, phase: "pms" }),
    ).toThrow();
  });

  it("rejects missing phase field", () => {
    const { phase: _, ...noPhase } = validPhase;
    expect(() => phasePageSchema.parse(noPhase)).toThrow();
  });

  it("rejects missing title", () => {
    const { title: _, ...noTitle } = validPhase;
    expect(() => phasePageSchema.parse(noTitle)).toThrow();
  });

  it("rejects missing bluf", () => {
    const { bluf: _, ...noBluf } = validPhase;
    expect(() => phasePageSchema.parse(noBluf)).toThrow();
  });

  it("rejects missing description", () => {
    const { description: _, ...noDesc } = validPhase;
    expect(() => phasePageSchema.parse(noDesc)).toThrow();
  });

  it("defaults definitions to empty array", () => {
    const result = phasePageSchema.parse(validPhase);
    expect(result.definitions).toEqual([]);
  });

  it("accepts definitions array", () => {
    const result = phasePageSchema.parse({
      ...validPhase,
      definitions: [
        {
          term: "Luteal phase",
          definition: "Post-ovulation phase of the cycle.",
        },
      ],
    });
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0]!.term).toBe("Luteal phase");
  });

  it("parses relatedPages from fixture", () => {
    const result = phasePageSchema.parse(validPhase);
    expect(result.relatedPages).toEqual(["/resources/guides/luteal-phase"]);
  });

  it("accepts multiple relatedPages", () => {
    const result = phasePageSchema.parse({
      ...validPhase,
      relatedPages: ["/guides/follicular-phase", "/listicles/best-cycle-apps"],
    });
    expect(result.relatedPages).toHaveLength(2);
  });

  it("rejects empty relatedPages array", () => {
    expect(() =>
      phasePageSchema.parse({ ...validPhase, relatedPages: [] }),
    ).toThrow();
  });

  it("defaults faqs to empty array", () => {
    const result = phasePageSchema.parse(validPhase);
    expect(result.faqs).toEqual([]);
  });

  it("accepts faqs array", () => {
    const result = phasePageSchema.parse({
      ...validPhase,
      faqs: [
        { q: "What is the luteal phase?", a: "The phase after ovulation." },
      ],
    });
    expect(result.faqs).toHaveLength(1);
  });

  it("accepts optional answers", () => {
    const result = phasePageSchema.parse({
      ...validPhase,
      answers: [
        { q: "When does the luteal phase start?", a: "After ovulation." },
      ],
    });
    expect(result.answers).toHaveLength(1);
    expect(result.answers![0]!.q).toContain("luteal");
  });

  it("defaults answers to undefined when omitted", () => {
    const result = phasePageSchema.parse(validPhase);
    expect(result.answers).toBeUndefined();
  });

  it("accepts optional statistics", () => {
    const result = phasePageSchema.parse({
      ...validPhase,
      statistics: [
        { stat: "Progesterone peaks in luteal phase", source: "NIH 2023" },
      ],
    });
    expect(result.statistics).toHaveLength(1);
  });

  it("inherits base content defaults", () => {
    const result = phasePageSchema.parse(validPhase);
    expect(result.schema).toBe("Article");
    expect(result.noindex).toBe(false);
    expect(result.tags).toEqual([]);
  });

  it("defaults expertQuotes to undefined when omitted", () => {
    const result = phasePageSchema.parse(validPhase);
    expect(result.expertQuotes).toBeUndefined();
  });

  it("accepts expertQuotes with required fields", () => {
    const result = phasePageSchema.parse({
      ...validPhase,
      expertQuotes: [
        {
          quote: "The luteal phase is critical for nutritional support.",
          personName: "Dr. Jane Smith",
        },
      ],
    });
    expect(result.expertQuotes).toHaveLength(1);
    expect(result.expertQuotes![0]!.personName).toBe("Dr. Jane Smith");
    expect(result.expertQuotes![0]!.jobTitle).toBeUndefined();
    expect(result.expertQuotes![0]!.organization).toBeUndefined();
  });

  it("accepts expertQuotes with all optional fields", () => {
    const result = phasePageSchema.parse({
      ...validPhase,
      expertQuotes: [
        {
          quote: "Progesterone peaks in the luteal phase.",
          personName: "Dr. Sarah Lee",
          jobTitle: "OB-GYN",
          organization: "Mayo Clinic",
        },
      ],
    });
    expect(result.expertQuotes![0]!.jobTitle).toBe("OB-GYN");
    expect(result.expertQuotes![0]!.organization).toBe("Mayo Clinic");
  });

  it("accepts multiple expertQuotes", () => {
    const result = phasePageSchema.parse({
      ...validPhase,
      expertQuotes: [
        { quote: "First quote.", personName: "Expert A" },
        {
          quote: "Second quote.",
          personName: "Expert B",
          jobTitle: "Nutritionist",
        },
      ],
    });
    expect(result.expertQuotes).toHaveLength(2);
  });

  it("rejects expertQuotes entry missing personName", () => {
    expect(() =>
      phasePageSchema.parse({
        ...validPhase,
        expertQuotes: [{ quote: "Some quote." }],
      }),
    ).toThrow();
  });
});

describe("goalPageSchema", () => {
  const validGoal = {
    title: "Nutrition for Women Over 40",
    description: "Cycle syncing strategies for women over 40",
    publishedAt: "2026-01-01",
    updatedAt: "2026-01-02",
    buyerStage: "tofu" as const,
    bluf: "Women over 40 can use cycle syncing to manage perimenopause symptoms.",
    audience: "over-40" as const,
    relatedPages: ["/resources/guides/perimenopause"],
  };

  it("parses valid goal page with all required fields", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.audience).toBe("over-40");
    expect(result.title).toBe("Nutrition for Women Over 40");
    expect(result.bluf).toBe(
      "Women over 40 can use cycle syncing to manage perimenopause symptoms.",
    );
  });

  it("accepts all valid audience enum values", () => {
    const audiences = [
      "perimenopause",
      "menopause",
      "over-40",
      "active-recovery",
      "beginners",
      "lifters",
      "general",
    ] as const;
    for (const audience of audiences) {
      const result = goalPageSchema.parse({ ...validGoal, audience });
      expect(result.audience).toBe(audience);
    }
  });

  it("rejects invalid audience value", () => {
    expect(() =>
      goalPageSchema.parse({ ...validGoal, audience: "men" }),
    ).toThrow();
  });

  it("parses valid perimenopause audience", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      audience: "perimenopause",
    });
    expect(result.audience).toBe("perimenopause");
  });

  it("parses valid menopause audience", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      audience: "menopause",
    });
    expect(result.audience).toBe("menopause");
  });

  it("rejects missing audience field", () => {
    const { audience: _, ...noAudience } = validGoal;
    expect(() => goalPageSchema.parse(noAudience)).toThrow();
  });

  it("rejects missing title", () => {
    const { title: _, ...noTitle } = validGoal;
    expect(() => goalPageSchema.parse(noTitle)).toThrow();
  });

  it("rejects missing bluf", () => {
    const { bluf: _, ...noBluf } = validGoal;
    expect(() => goalPageSchema.parse(noBluf)).toThrow();
  });

  it("rejects missing description", () => {
    const { description: _, ...noDesc } = validGoal;
    expect(() => goalPageSchema.parse(noDesc)).toThrow();
  });

  it("defaults definitions to empty array", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.definitions).toEqual([]);
  });

  it("accepts definitions array", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      definitions: [
        {
          term: "Perimenopause",
          definition: "The transition period before menopause.",
        },
      ],
    });
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0]!.term).toBe("Perimenopause");
  });

  it("parses relatedPages from fixture", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.relatedPages).toEqual(["/resources/guides/perimenopause"]);
  });

  it("accepts multiple relatedPages", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      relatedPages: ["/guides/menopause-nutrition", "/phase/luteal"],
    });
    expect(result.relatedPages).toHaveLength(2);
  });

  it("rejects empty relatedPages array", () => {
    expect(() =>
      goalPageSchema.parse({ ...validGoal, relatedPages: [] }),
    ).toThrow();
  });

  it("defaults faqs to empty array", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.faqs).toEqual([]);
  });

  it("accepts faqs array", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      faqs: [
        { q: "What is perimenopause?", a: "Transition before menopause." },
      ],
    });
    expect(result.faqs).toHaveLength(1);
  });

  it("accepts optional answers", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      answers: [
        {
          q: "Can you cycle sync during perimenopause?",
          a: "Yes, with modifications.",
        },
      ],
    });
    expect(result.answers).toHaveLength(1);
    expect(result.answers![0]!.q).toContain("perimenopause");
  });

  it("defaults answers to undefined when omitted", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.answers).toBeUndefined();
  });

  it("accepts optional statistics", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      statistics: [
        {
          stat: "1 in 3 women over 40 experience irregular cycles",
          source: "ACOG 2024",
        },
      ],
    });
    expect(result.statistics).toHaveLength(1);
  });

  it("inherits base content defaults", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.schema).toBe("Article");
    expect(result.noindex).toBe(false);
    expect(result.tags).toEqual([]);
  });

  it("defaults expertQuotes to undefined when omitted", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.expertQuotes).toBeUndefined();
  });

  it("accepts expertQuotes with required fields", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      expertQuotes: [
        {
          quote: "Perimenopause nutrition requires different macro ratios.",
          personName: "Dr. Maria Gonzalez",
        },
      ],
    });
    expect(result.expertQuotes).toHaveLength(1);
    expect(result.expertQuotes![0]!.personName).toBe("Dr. Maria Gonzalez");
    expect(result.expertQuotes![0]!.jobTitle).toBeUndefined();
    expect(result.expertQuotes![0]!.organization).toBeUndefined();
  });

  it("accepts expertQuotes with all optional fields", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      expertQuotes: [
        {
          quote: "Women over 40 benefit from higher protein intake.",
          personName: "Dr. Alice Chen",
          jobTitle: "Sports Nutritionist",
          organization: "Cleveland Clinic",
        },
      ],
    });
    expect(result.expertQuotes![0]!.jobTitle).toBe("Sports Nutritionist");
    expect(result.expertQuotes![0]!.organization).toBe("Cleveland Clinic");
  });

  it("accepts multiple expertQuotes", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      expertQuotes: [
        { quote: "First expert opinion.", personName: "Expert A" },
        {
          quote: "Second expert opinion.",
          personName: "Expert B",
          jobTitle: "Endocrinologist",
        },
      ],
    });
    expect(result.expertQuotes).toHaveLength(2);
  });

  it("rejects expertQuotes entry missing personName", () => {
    expect(() =>
      goalPageSchema.parse({
        ...validGoal,
        expertQuotes: [{ quote: "Missing person name." }],
      }),
    ).toThrow();
  });

  it("defaults statisticCitations to undefined when omitted", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.statisticCitations).toBeUndefined();
  });

  it("accepts statisticCitations with required fields", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      statisticCitations: [
        {
          stat: "51% of women experience hot flashes during menopause",
          source: "NAMS 2023",
        },
      ],
    });
    expect(result.statisticCitations).toHaveLength(1);
    expect(result.statisticCitations![0]!.stat).toContain("hot flashes");
    expect(result.statisticCitations![0]!.sourceUrl).toBeUndefined();
  });

  it("accepts statisticCitations with sourceUrl", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      statisticCitations: [
        {
          stat: "Average menopause onset is 51 years old",
          source: "Mayo Clinic",
          sourceUrl: "https://www.mayoclinic.org/menopause",
        },
      ],
    });
    expect(result.statisticCitations![0]!.sourceUrl).toBe(
      "https://www.mayoclinic.org/menopause",
    );
  });

  it("accepts multiple statisticCitations", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      statisticCitations: [
        { stat: "Stat one", source: "Source A" },
        {
          stat: "Stat two",
          source: "Source B",
          sourceUrl: "https://example.com",
        },
      ],
    });
    expect(result.statisticCitations).toHaveLength(2);
  });

  it("rejects statisticCitations entry missing stat", () => {
    expect(() =>
      goalPageSchema.parse({
        ...validGoal,
        statisticCitations: [{ source: "Source without stat" }],
      }),
    ).toThrow();
  });

  it("rejects statisticCitations entry missing source", () => {
    expect(() =>
      goalPageSchema.parse({
        ...validGoal,
        statisticCitations: [{ stat: "Stat without source" }],
      }),
    ).toThrow();
  });

  it("defaults tableData to undefined when omitted", () => {
    const result = goalPageSchema.parse(validGoal);
    expect(result.tableData).toBeUndefined();
  });

  it("accepts tableData with required fields", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      tableData: {
        name: "Hormone Changes by Life Stage",
        columns: ["Stage", "Estrogen", "Progesterone"],
        rows: [
          ["Perimenopause", "Fluctuating", "Declining"],
          ["Menopause", "Low", "Very Low"],
        ],
      },
    });
    expect(result.tableData!.name).toBe("Hormone Changes by Life Stage");
    expect(result.tableData!.columns).toHaveLength(3);
    expect(result.tableData!.rows).toHaveLength(2);
  });

  it("accepts tableData with optional description", () => {
    const result = goalPageSchema.parse({
      ...validGoal,
      tableData: {
        name: "Nutrition Targets",
        description: "Recommended daily intake for women over 40",
        columns: ["Nutrient", "Target"],
        rows: [["Protein", "1.6g/kg"]],
      },
    });
    expect(result.tableData!.description).toBe(
      "Recommended daily intake for women over 40",
    );
  });

  it("rejects tableData missing columns", () => {
    expect(() =>
      goalPageSchema.parse({
        ...validGoal,
        tableData: {
          name: "Broken Table",
          rows: [["value"]],
        },
      }),
    ).toThrow();
  });

  it("rejects tableData missing rows", () => {
    expect(() =>
      goalPageSchema.parse({
        ...validGoal,
        tableData: {
          name: "Broken Table",
          columns: ["Col A"],
        },
      }),
    ).toThrow();
  });
});

describe("symptomsSchema", () => {
  it("is exported", () => {
    expect(symptomsSchema).toBeDefined();
  });
  it("has the same shape as guideSchema", () => {
    expect(symptomsSchema).toBe(guideSchema);
  });
  it("parses valid symptom frontmatter", () => {
    const result = symptomsSchema.safeParse({
      title: "Perimenopause Brain Fog",
      description:
        "Why brain fog happens in perimenopause and what to do about it.",
      publishedAt: "2026-03-21",
      updatedAt: "2026-03-21",
      buyerStage: "tofu",
      bluf: "Brain fog is one of the most common perimenopause symptoms.",
      relatedPages: ["/resources/guides/perimenopause-symptoms"],
    });
    expect(result.success).toBe(true);
  });
});

describe("leadMagnetSchema", () => {
  const validLeadMagnet = {
    title: "Free Dispatch Checklist",
    description: "A checklist for optimizing dispatch.",
    publishedAt: "2026-03-01",
    updatedAt: "2026-03-15",
    bluf: "Use this checklist to save 3 hours per week on dispatch.",
    relatedPages: ["/resources/guides/dispatch-optimization"],
  };

  it("parses valid lead magnet with defaults", () => {
    const result = leadMagnetSchema.parse(validLeadMagnet);
    expect(result.freePreviewSections).toBe(2);
    expect(result.tags).toEqual([]);
    expect(result.noindex).toBe(false);
  });

  it("accepts custom freePreviewSections", () => {
    const result = leadMagnetSchema.parse({
      ...validLeadMagnet,
      freePreviewSections: 3,
    });
    expect(result.freePreviewSections).toBe(3);
  });

  it("rejects empty relatedPages", () => {
    expect(() =>
      leadMagnetSchema.parse({ ...validLeadMagnet, relatedPages: [] }),
    ).toThrow();
  });

  it("accepts optional ogImage", () => {
    const result = leadMagnetSchema.parse({
      ...validLeadMagnet,
      ogImage: "/images/og.png",
    });
    expect(result.ogImage).toBe("/images/og.png");
  });

  it("rejects missing required fields", () => {
    expect(() => leadMagnetSchema.parse({ title: "Only title" })).toThrow();
  });

  it("accepts tags", () => {
    const result = leadMagnetSchema.parse({
      ...validLeadMagnet,
      tags: ["dispatch", "checklist"],
    });
    expect(result.tags).toEqual(["dispatch", "checklist"]);
  });

  it("accepts noindex override", () => {
    const result = leadMagnetSchema.parse({
      ...validLeadMagnet,
      noindex: true,
    });
    expect(result.noindex).toBe(true);
  });

  it("defaults buyerStage to tofu when omitted", () => {
    const result = leadMagnetSchema.parse(validLeadMagnet);
    expect(result.buyerStage).toBe("tofu");
  });

  it("accepts all buyerStage values", () => {
    for (const stage of ["tofu", "mofu", "bofu"]) {
      const result = leadMagnetSchema.parse({
        ...validLeadMagnet,
        buyerStage: stage,
      });
      expect(result.buyerStage).toBe(stage);
    }
  });

  it("rejects invalid buyerStage", () => {
    expect(() =>
      leadMagnetSchema.parse({ ...validLeadMagnet, buyerStage: "invalid" }),
    ).toThrow();
  });

  it("defaults faqs to empty array when omitted", () => {
    const result = leadMagnetSchema.parse(validLeadMagnet);
    expect(result.faqs).toEqual([]);
  });

  it("accepts valid faqs with q and a objects", () => {
    const result = leadMagnetSchema.parse({
      ...validLeadMagnet,
      faqs: [
        {
          q: "What is this checklist for?",
          a: "Optimizing dispatch workflows.",
        },
        { q: "How long does it take?", a: "About 30 minutes." },
      ],
    });
    expect(result.faqs).toHaveLength(2);
    expect(result.faqs[0]!.q).toBe("What is this checklist for?");
    expect(result.faqs[1]!.a).toBe("About 30 minutes.");
  });

  it("defaults schema to Article when omitted", () => {
    const result = leadMagnetSchema.parse(validLeadMagnet);
    expect(result.schema).toBe("Article");
  });

  it("accepts all valid schema enum values", () => {
    for (const s of ["Article", "FAQPage", "HowTo", "Product", "ItemList"]) {
      const result = leadMagnetSchema.parse({ ...validLeadMagnet, schema: s });
      expect(result.schema).toBe(s);
    }
  });

  it("rejects invalid schema values", () => {
    expect(() =>
      leadMagnetSchema.parse({ ...validLeadMagnet, schema: "BlogPost" }),
    ).toThrow();
  });

  it("should reject faqs items with wrong shape { question, answer } instead of { q, a }", () => {
    const result = leadMagnetSchema.safeParse({
      ...validLeadMagnet,
      faqs: [{ question: "Q", answer: "A" }],
    });
    expect(result.success).toBe(false);
  });
});
