import { z } from "zod";

const answerSchema = z
  .array(
    z.union([
      z.object({ q: z.string(), a: z.string() }),
      z
        .object({ question: z.string(), answer: z.string() })
        .transform(({ question, answer }) => ({ q: question, a: answer })),
    ]),
  )
  .optional();
const prosConsSchema = z
  .array(
    z.object({
      subject: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
    }),
  )
  .optional();
const pricingStatSchema = z
  .array(
    z.object({
      stat: z.string(),
      source: z.string(),
      sourceUrl: z.string().optional(),
    }),
  )
  .optional();
const tableDataSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  })
  .optional();

export const baseContentSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  buyerStage: z.enum(["tofu", "mofu", "bofu"]),
  ctaMode: z.enum(["educate", "evaluate", "convert"]).optional(),
  schema: z
    .enum(["Article", "FAQPage", "HowTo", "Product", "ItemList"])
    .default("Article"),
  bluf: z.string(),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  relatedPages: z.array(z.string()).min(1),
  statistics: z
    .array(
      z.object({
        stat: z.string(),
        source: z.string(),
        sourceUrl: z.string().optional(),
      }),
    )
    .default([]),
  noindex: z.boolean().default(false),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).default([]),
  targetPersona: z.array(z.string()).optional(),
});

export const alternativeSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    url: z.string().optional(),
    pricing: z.string(),
    weakness: z.string(),
    setupFee: z.string().optional(),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
  }),
  pros: z.array(z.string()).default([]),
  cons: z.array(z.string()).default([]),
  proscons: prosConsSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const comparisonSchema = baseContentSchema.extend({
  competitorA: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string(),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
  }),
  competitorB: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string(),
    pros: z.array(z.string()).default([]),
    cons: z.array(z.string()).default([]),
  }),
  verdict: z.string(),
  disableProsConsSchema: z.boolean().default(false),
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
  proscons: prosConsSchema,
  answers: answerSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .optional(),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const pricingBreakdownSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    pricing: z.string(),
  }),
  tiers: z.array(
    z.object({
      name: z.string(),
      price: z.string(),
      features: z.array(z.string()),
    }),
  ),
  hiddenCosts: z.array(z.string()),
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
  answers: answerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const listicleSchema = baseContentSchema.extend({
  category: z.string(),
  qualifier: z.string(),
  tools: z.array(
    z.object({
      name: z.string(),
      summary: z.string(),
      pros: z.array(z.string()),
      cons: z.array(z.string()),
      pricing: z.string(),
      verdict: z.string(),
    }),
  ),
  tableData: tableDataSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .optional(),
  proscons: prosConsSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const guideSchema = baseContentSchema.extend({
  steps: z
    .array(z.object({ title: z.string(), content: z.string() }))
    .optional(),
  timeEstimate: z.string().optional(),
  difficulty: z.string().optional(),
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  answers: answerSchema,
  proscons: prosConsSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
});

export const statePageSchema = baseContentSchema.extend({
  state: z.string(),
  stateCode: z.string(),
  // Generic fields (both verticals)
  marketSize: z.number().optional(),
  topMarkets: z
    .array(
      z.object({
        name: z.string(),
        count: z.number(),
        label: z.string().optional(),
      }),
    )
    .default([]),
  regulations: z
    .array(
      z.object({
        heading: z.string(),
        content: z.string(),
        variant: z.enum(["info", "warning", "success"]).default("info"),
      }),
    )
    .default([]),
  // Legacy fields (optional for backward compat)
  establishmentCount: z.number().optional(),
  topMetros: z
    .array(z.object({ name: z.string(), count: z.number() }))
    .optional(),
  licensingNotes: z.string().optional(),
  seasonalNotes: z.string().optional(),
  // SEO blocks
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  answers: answerSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export const verticalPageSchema = baseContentSchema.extend({
  verticalType: z.string(),
  keyPainPoints: z.array(z.string()),
  commonGrantTypes: z.array(z.string()),
  complianceNotes: z.string(),
  estimatedOrgCount: z.number().optional(),
  pricingStats: pricingStatSchema,
  tableData: tableDataSchema,
  answers: answerSchema,
});

export const orgTypePageSchema = baseContentSchema.extend({
  orgType: z.string(),
  orgTypeSlug: z.string(),
  estimatedCount: z.number().optional(),
  uniqueNeeds: z.array(z.string()),
  complianceNotes: z.string().optional(),
  answers: answerSchema,
});

export const featureSchema = baseContentSchema.extend({
  tableData: tableDataSchema,
  proscons: prosConsSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
});

export const reviewSchema = baseContentSchema.extend({
  competitor: z.object({
    name: z.string(),
    slug: z.string(),
    url: z.string().optional(),
    pricing: z.string(),
  }),
  verdict: z.string(),
  tableData: tableDataSchema,
  proscons: prosConsSchema,
  answers: answerSchema,
  pricingStats: pricingStatSchema,
});

export const phasePageSchema = baseContentSchema.extend({
  phase: z.enum([
    "follicular",
    "ovulatory",
    "luteal",
    "menstrual",
    "hormone",
    "cycle",
  ]),
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  answers: answerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
});

export type PhasePageEntry = z.infer<typeof phasePageSchema>;

export const goalPageSchema = baseContentSchema.extend({
  audience: z.enum([
    "perimenopause",
    "menopause",
    "over-40",
    "active-recovery",
    "beginners",
    "lifters",
    "general",
  ]),
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  answers: answerSchema,
  expertQuotes: z
    .array(
      z.object({
        quote: z.string(),
        personName: z.string(),
        jobTitle: z.string().optional(),
        organization: z.string().optional(),
      }),
    )
    .optional(),
  statisticCitations: pricingStatSchema,
  tableData: tableDataSchema,
});

export type GoalPageEntry = z.infer<typeof goalPageSchema>;

export const symptomsSchema = guideSchema;

export const leadMagnetSchema = z.object({
  title: z.string(),
  description: z.string(),
  publishedAt: z.string(),
  updatedAt: z.string(),
  bluf: z.string(),
  freePreviewSections: z.number().default(2),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).default([]),
  relatedPages: z.array(z.string()).min(1),
  noindex: z.boolean().default(false),
  answers: answerSchema,
  definitions: z
    .array(z.object({ term: z.string(), definition: z.string() }))
    .default([]),
  buyerStage: z.enum(["tofu", "mofu", "bofu"]).default("tofu"),
  faqs: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
  schema: z
    .enum(["Article", "FAQPage", "HowTo", "Product", "ItemList"])
    .default("Article"),
});
