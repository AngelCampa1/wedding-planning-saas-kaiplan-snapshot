import { describe, it, expect, vi } from "vitest";
import {
  buildContentMap,
  buildEntrySeoProps,
  buildLeadMagnetSchemaGraph,
  resolveIndexableRelatedPageLinks,
  padToolIndex,
  buildOptionalHowToSchema,
  alternativeUrl,
  comparisonUrl,
  pricingUrl,
  listicleUrl,
  guideUrl,
  paginatedUrl,
} from "./page-helpers";

vi.mock("@kaiplan/marketing/lib/schema-builders", () => ({
  buildArticleSchema: vi.fn(
    (opts: {
      headline: string;
      description: string;
      datePublished: string;
      dateModified: string;
      publisher: { "@id": string };
      image?: string;
      mainEntityOfPage?: string;
    }) => ({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: opts.headline,
      description: opts.description,
      datePublished: opts.datePublished,
      dateModified: opts.dateModified,
      publisher: opts.publisher,
      image: opts.image,
      mainEntityOfPage: opts.mainEntityOfPage,
    }),
  ),
  buildBreadcrumbSchema: vi.fn(
    (items: { label: string; href: string }[], siteUrl: string) => ({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.label,
        item: `${siteUrl}${item.href}`,
      })),
    }),
  ),
  mergeFaqSources: vi.fn(
    (
      faqs: { q: string; a: string }[],
      answers: { question: string; answer: string }[],
    ) =>
      [
        ...faqs,
        ...answers.map((answer) => ({ q: answer.question, a: answer.answer })),
      ].length > 0
        ? {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              ...faqs,
              ...answers.map((answer) => ({
                q: answer.question,
                a: answer.answer,
              })),
            ],
          }
        : undefined,
  ),
  buildHowToSchema: vi.fn(
    (opts: {
      name: string;
      description: string;
      steps: { title: string; content: string }[];
    }) => ({
      "@type": "HowTo",
      name: opts.name,
      description: opts.description,
      step: opts.steps,
    }),
  ),
}));

function makeAlt(slug: string, title = "Alt Title", description = "Alt desc") {
  return {
    id: slug,
    data: {
      competitor: { slug },
      title,
      description,
      noindex: false,
    },
  } as unknown as import("astro:content").CollectionEntry<"alternatives">;
}

function makeComparison(
  entrySlug: string,
  title = "Comp Title",
  description = "Comp desc",
) {
  return {
    id: entrySlug,
    slug: entrySlug,
    data: { title, description, noindex: false },
  } as unknown as import("astro:content").CollectionEntry<"comparisons">;
}

function makePricing(
  entrySlug: string,
  title = "Pricing Title",
  description = "Pricing desc",
  competitorSlug = entrySlug,
) {
  return {
    id: entrySlug,
    slug: entrySlug,
    data: {
      competitor: { slug: competitorSlug },
      title,
      description,
      noindex: false,
    },
  } as unknown as import("astro:content").CollectionEntry<"pricing-breakdowns">;
}

function makeListicle(
  entrySlug: string,
  title = "Listicle Title",
  description = "Listicle desc",
) {
  return {
    id: entrySlug,
    slug: entrySlug,
    data: { title, description, noindex: false },
  } as unknown as import("astro:content").CollectionEntry<"listicles">;
}

function makeGuide(
  entrySlug: string,
  title = "Guide Title",
  description = "Guide desc",
) {
  return {
    id: entrySlug,
    slug: entrySlug,
    data: { title, description, noindex: false },
  } as unknown as import("astro:content").CollectionEntry<"guides">;
}

function makeLeadMagnet(
  entrySlug: string,
  title = "Lead Magnet Title",
  description = "Lead magnet desc",
) {
  return {
    id: entrySlug,
    slug: entrySlug,
    data: { title, description, noindex: false },
  } as unknown as import("astro:content").CollectionEntry<"lead-magnets">;
}

describe("buildContentMap", () => {
  it("maps alternative by competitor slug", () => {
    const map = buildContentMap({
      alternatives: [makeAlt("zola", "Zola Alternative", "Zola desc")],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [],
      leadMagnets: [],
    });
    expect(map.get("/compare/alternatives/zola")).toEqual({
      title: "Zola Alternative",
      description: "Zola desc",
    });
  });

  it("maps comparison by entry slug", () => {
    const map = buildContentMap({
      alternatives: [],
      comparisons: [
        makeComparison("zola-vs-the-knot", "Zola vs The Knot", "A vs B"),
      ],
      pricingBreakdowns: [],
      listicles: [],
      guides: [],
      leadMagnets: [],
    });
    expect(map.get("/compare/versus/zola-vs-the-knot")).toEqual({
      title: "Zola vs The Knot",
      description: "A vs B",
    });
  });

  it("maps pricing breakdown by entry slug", () => {
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [
        makePricing(
          "the-knot-pricing",
          "The Knot Pricing",
          "Pricing desc",
          "the-knot",
        ),
      ],
      listicles: [],
      guides: [],
      leadMagnets: [],
    });
    expect(map.get("/compare/pricing/the-knot-pricing")).toEqual({
      title: "The Knot Pricing",
      description: "Pricing desc",
    });
  });

  it("maps listicle by entry slug", () => {
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [
        makeListicle("best-wedding-apps", "Best Wedding Apps", "Top tools"),
      ],
      guides: [],
      leadMagnets: [],
    });
    expect(map.get("/resources/best/best-wedding-apps")).toEqual({
      title: "Best Wedding Apps",
      description: "Top tools",
    });
  });

  it("maps guide by entry slug", () => {
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [
        makeGuide(
          "wedding-budget-guide",
          "Wedding Budget Guide",
          "Budget help",
        ),
      ],
      leadMagnets: [],
    });
    expect(map.get("/resources/guides/wedding-budget-guide")).toEqual({
      title: "Wedding Budget Guide",
      description: "Budget help",
    });
  });

  it("maps lead magnet by entry slug", () => {
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [],
      leadMagnets: [
        makeLeadMagnet("budget-template", "Budget Template", "Free budget"),
      ],
    });
    expect(map.get("/free/budget-template")).toEqual({
      title: "Budget Template",
      description: "Free budget",
    });
  });

  it("returns an empty map when all collections are empty", () => {
    const map = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [],
      leadMagnets: [],
    });
    expect(map.size).toBe(0);
  });

  it("handles multiple entries across all collections", () => {
    const map = buildContentMap({
      alternatives: [makeAlt("zola"), makeAlt("the-knot")],
      comparisons: [makeComparison("zola-vs-knot")],
      pricingBreakdowns: [
        makePricing(
          "zola-pricing",
          "Zola Pricing",
          "Zola pricing desc",
          "zola",
        ),
      ],
      listicles: [makeListicle("top-tools")],
      guides: [makeGuide("budget-guide")],
      leadMagnets: [makeLeadMagnet("wedding-timeline-template")],
    });
    expect(map.size).toBe(7);
    expect(map.has("/compare/alternatives/zola")).toBe(true);
    expect(map.has("/compare/alternatives/the-knot")).toBe(true);
    expect(map.has("/compare/versus/zola-vs-knot")).toBe(true);
    expect(map.has("/compare/pricing/zola-pricing")).toBe(true);
    expect(map.has("/resources/best/top-tools")).toBe(true);
    expect(map.has("/resources/guides/budget-guide")).toBe(true);
    expect(map.has("/free/wedding-timeline-template")).toBe(true);
  });

  it("skips entries marked noindex", () => {
    const hiddenAlternative = makeAlt(
      "the-knot-no-ads",
      "The Knot No Ads",
      "Hidden alt",
    );
    hiddenAlternative.data.noindex = true;

    const hiddenGuide = makeGuide(
      "how-to-write-wedding-vows",
      "How to Write Wedding Vows",
      "Hidden guide",
    );
    hiddenGuide.data.noindex = true;

    const hiddenComparison = makeComparison(
      "aisle-planner-vs-the-knot-for-planners",
      "Hidden comparison",
      "Hidden comparison desc",
    );
    hiddenComparison.data.noindex = true;

    const hiddenPricing = makePricing(
      "aisle-planner-pricing-for-couples",
      "Hidden pricing",
      "Hidden pricing desc",
      "aisle-planner",
    );
    hiddenPricing.data.noindex = true;

    const hiddenListicle = makeListicle(
      "best-free-wedding-planning-apps",
      "Hidden listicle",
      "Hidden listicle desc",
    );
    hiddenListicle.data.noindex = true;

    const hiddenLeadMagnet = makeLeadMagnet(
      "budget-template",
      "Hidden lead magnet",
      "Hidden lead magnet desc",
    );
    hiddenLeadMagnet.data.noindex = true;

    const map = buildContentMap({
      alternatives: [hiddenAlternative, makeAlt("zola")],
      comparisons: [hiddenComparison, makeComparison("zola-vs-the-knot")],
      pricingBreakdowns: [hiddenPricing, makePricing("zola-pricing")],
      listicles: [hiddenListicle, makeListicle("best-wedding-apps")],
      guides: [hiddenGuide, makeGuide("wedding-budget-guide")],
      leadMagnets: [
        hiddenLeadMagnet,
        makeLeadMagnet("wedding-timeline-template"),
      ],
    });

    expect(map.has("/compare/alternatives/the-knot-no-ads")).toBe(false);
    expect(
      map.has("/compare/versus/aisle-planner-vs-the-knot-for-planners"),
    ).toBe(false);
    expect(map.has("/compare/pricing/aisle-planner-pricing-for-couples")).toBe(
      false,
    );
    expect(map.has("/resources/best/best-free-wedding-planning-apps")).toBe(
      false,
    );
    expect(map.has("/resources/guides/how-to-write-wedding-vows")).toBe(false);
    expect(map.has("/free/budget-template")).toBe(false);
    expect(map.has("/compare/alternatives/zola")).toBe(true);
    expect(map.has("/compare/versus/zola-vs-the-knot")).toBe(true);
    expect(map.has("/compare/pricing/zola-pricing")).toBe(true);
    expect(map.has("/resources/best/best-wedding-apps")).toBe(true);
    expect(map.has("/resources/guides/wedding-budget-guide")).toBe(true);
    expect(map.has("/free/wedding-timeline-template")).toBe(true);
  });
});

describe("buildEntrySeoProps", () => {
  it("normalizes answers and faqs and forwards noindex to layouts", () => {
    expect(
      buildEntrySeoProps({
        noindex: true,
        answers: [
          { q: "Question A", a: "Answer A" },
          { question: "Question B", answer: "Answer B" },
        ],
        faqs: [
          { q: "FAQ A", a: "FAQ answer A" },
          { q: "FAQ B", a: "FAQ answer B" },
        ],
      }),
    ).toEqual({
      noindex: true,
      answers: [
        { question: "Question A", answer: "Answer A" },
        { question: "Question B", answer: "Answer B" },
      ],
      faqs: [
        { q: "FAQ A", a: "FAQ answer A" },
        { q: "FAQ B", a: "FAQ answer B" },
      ],
    });
  });

  it("defaults to indexable and empty answers/faqs when optional fields are absent", () => {
    expect(buildEntrySeoProps({})).toEqual({
      noindex: false,
      answers: [],
      faqs: [],
    });
  });

  it("falls back to empty strings when an answer is missing either field", () => {
    expect(
      buildEntrySeoProps({
        answers: [{ q: "Only question" }, { answer: "Only answer" }],
      }),
    ).toEqual({
      noindex: false,
      answers: [
        { question: "Only question", answer: "" },
        { question: "", answer: "Only answer" },
      ],
      faqs: [],
    });
  });
});

describe("resolveIndexableRelatedPageLinks", () => {
  it("drops related hrefs that are missing from the filtered content map", () => {
    const contentMap = buildContentMap({
      alternatives: [makeAlt("zola")],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [makeGuide("wedding-budget-guide")],
      leadMagnets: [],
    });

    expect(
      resolveIndexableRelatedPageLinks(
        [
          "/compare/alternatives/the-knot-no-ads",
          "/compare/alternatives/zola",
          "/resources/guides/wedding-budget-guide",
        ],
        contentMap,
      ),
    ).toEqual([
      {
        title: "Alt Title",
        href: "/compare/alternatives/zola/",
        description: "Alt desc",
      },
      {
        title: "Guide Title",
        href: "/resources/guides/wedding-budget-guide/",
        description: "Guide desc",
      },
    ]);
  });

  it("keeps lead magnet internal links indexable and drops missing targets", () => {
    const hiddenLeadMagnet = makeLeadMagnet(
      "hidden-cost-calculator-worksheet",
      "Hidden Costs",
      "Hidden costs desc",
    );
    hiddenLeadMagnet.data.noindex = true;
    const contentMap = buildContentMap({
      alternatives: [],
      comparisons: [],
      pricingBreakdowns: [],
      listicles: [],
      guides: [
        makeGuide("wedding-budget-guide", "Budget Guide", "Budget desc"),
      ],
      leadMagnets: [
        makeLeadMagnet("budget-template", "Budget Template", "Budget desc"),
        hiddenLeadMagnet,
      ],
    });

    expect(
      resolveIndexableRelatedPageLinks(
        [
          "/free/budget-template",
          "/free/hidden-cost-calculator-worksheet",
          "/resources/guides/missing-guide",
          "/resources/guides/wedding-budget-guide",
        ],
        contentMap,
      ),
    ).toEqual([
      {
        title: "Budget Template",
        href: "/free/budget-template/",
        description: "Budget desc",
      },
      {
        title: "Budget Guide",
        href: "/resources/guides/wedding-budget-guide/",
        description: "Budget desc",
      },
    ]);
  });
});

describe("buildLeadMagnetSchemaGraph", () => {
  it("builds Article and FAQ schema with dates, image, and canonical page", () => {
    const graph = buildLeadMagnetSchemaGraph({
      title: "Free Budget Template",
      description: "Track budget details.",
      publishedAt: "2026-03-30",
      updatedAt: "2026-04-01",
      canonicalUrl: "https://kaiplan.example/free/budget-template/",
      siteDomain: "kaiplan.example",
      defaultOgImage: "/og/default.png",
      ogImage: "/og/budget.png",
      answers: [{ q: "What is included?", a: "A tracker." }],
      faqs: [{ q: "Is it free?", a: "Yes." }],
    });

    const nodes = graph["@graph"] as Record<string, unknown>[];
    expect(nodes).toContainEqual(
      expect.objectContaining({
        "@type": "Article",
        "@id": "https://kaiplan.example/free/budget-template/#article",
        headline: "Free Budget Template",
        datePublished: "2026-03-30",
        dateModified: "2026-04-01",
        mainEntityOfPage: "https://kaiplan.example/free/budget-template/",
        image: "https://kaiplan.example/og/budget.png",
      }),
    );
    expect(nodes).toContainEqual(
      expect.objectContaining({
        "@type": "FAQPage",
        mainEntity: [
          { q: "Is it free?", a: "Yes." },
          { q: "What is included?", a: "A tracker." },
        ],
      }),
    );
    expect(nodes.filter((node) => node["@type"] === "FAQPage")).toHaveLength(1);
  });

  it("emits exactly one BreadcrumbList schema for lead magnet pages", () => {
    const graph = buildLeadMagnetSchemaGraph({
      title: "Free Budget Template",
      description: "Track budget details.",
      publishedAt: "2026-03-30",
      updatedAt: "2026-04-01",
      canonicalUrl: "https://kaiplan.example/free/budget-template/",
      siteDomain: "kaiplan.example",
      defaultOgImage: "/og/default.png",
    });

    const nodes = graph["@graph"] as Record<string, unknown>[];

    expect(
      nodes.filter((node) => node["@type"] === "BreadcrumbList"),
    ).toHaveLength(1);
  });
});

describe("padToolIndex", () => {
  it("pads single-digit index to two chars", () => {
    expect(padToolIndex(0)).toBe("01");
    expect(padToolIndex(1)).toBe("02");
    expect(padToolIndex(8)).toBe("09");
  });

  it("does not pad two-digit results", () => {
    expect(padToolIndex(9)).toBe("10");
    expect(padToolIndex(99)).toBe("100");
  });
});

describe("buildOptionalHowToSchema", () => {
  it("returns null when steps is undefined", () => {
    expect(buildOptionalHowToSchema(undefined, "Title", "Desc")).toBeNull();
  });

  it("returns null when steps is empty array", () => {
    expect(buildOptionalHowToSchema([], "Title", "Desc")).toBeNull();
  });

  it("returns schema object when steps are provided", () => {
    const result = buildOptionalHowToSchema(
      [{ title: "Step 1", content: "Do this" }],
      "How to Plan",
      "A guide",
    );
    expect(result).not.toBeNull();
    expect(result?.["@type"]).toBe("HowTo");
    expect(result?.["name"]).toBe("How to Plan");
  });
});

describe("alternativeUrl", () => {
  it("builds correct URL for a slug", () => {
    expect(alternativeUrl("zola")).toBe("/compare/alternatives/zola/");
  });

  it("handles slugs with hyphens", () => {
    expect(alternativeUrl("the-knot")).toBe("/compare/alternatives/the-knot/");
  });

  it("handles empty slug", () => {
    expect(alternativeUrl("")).toBe("/compare/alternatives/");
  });
});

describe("comparisonUrl", () => {
  it("builds correct URL for a slug", () => {
    expect(comparisonUrl("zola-vs-the-knot")).toBe(
      "/compare/versus/zola-vs-the-knot/",
    );
  });

  it("handles simple slugs", () => {
    expect(comparisonUrl("honeybook-vs-dubsado")).toBe(
      "/compare/versus/honeybook-vs-dubsado/",
    );
  });

  it("handles empty slug", () => {
    expect(comparisonUrl("")).toBe("/compare/versus/");
  });
});

describe("pricingUrl", () => {
  it("builds correct URL for a slug", () => {
    expect(pricingUrl("zola")).toBe("/compare/pricing/zola/");
  });

  it("handles slugs with hyphens", () => {
    expect(pricingUrl("the-knot")).toBe("/compare/pricing/the-knot/");
  });

  it("handles empty slug", () => {
    expect(pricingUrl("")).toBe("/compare/pricing/");
  });
});

describe("listicleUrl", () => {
  it("builds correct URL for a slug", () => {
    expect(listicleUrl("best-wedding-planning-apps-2026")).toBe(
      "/resources/best/best-wedding-planning-apps-2026/",
    );
  });

  it("handles simple slug", () => {
    expect(listicleUrl("top-wedding-tools")).toBe(
      "/resources/best/top-wedding-tools/",
    );
  });

  it("handles empty slug", () => {
    expect(listicleUrl("")).toBe("/resources/best/");
  });
});

describe("guideUrl", () => {
  it("builds correct URL for a slug", () => {
    expect(guideUrl("how-to-plan-a-wedding-budget")).toBe(
      "/resources/guides/how-to-plan-a-wedding-budget/",
    );
  });

  it("handles simple slug", () => {
    expect(guideUrl("wedding-venue-checklist")).toBe(
      "/resources/guides/wedding-venue-checklist/",
    );
  });

  it("handles empty slug", () => {
    expect(guideUrl("")).toBe("/resources/guides/");
  });
});

describe("paginatedUrl", () => {
  it("returns base URL for page 1", () => {
    expect(paginatedUrl("/compare/alternatives", 1)).toBe(
      "/compare/alternatives/",
    );
  });

  it("appends page number for page 2+", () => {
    expect(paginatedUrl("/compare/alternatives", 2)).toBe(
      "/compare/alternatives/2/",
    );
  });

  it("appends page 3 correctly", () => {
    expect(paginatedUrl("/resources/best", 3)).toBe("/resources/best/3/");
  });

  it("returns base for page 1 with any base path", () => {
    expect(paginatedUrl("/resources/guides", 1)).toBe("/resources/guides/");
  });

  it("normalizes a trailing-slashed base path", () => {
    expect(paginatedUrl("/resources/guides/", 2)).toBe("/resources/guides/2/");
  });

  it("handles large page numbers", () => {
    expect(paginatedUrl("/compare/versus", 100)).toBe("/compare/versus/100/");
  });
});
