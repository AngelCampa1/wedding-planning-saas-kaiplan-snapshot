import { z } from "astro/zod";

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

const faqItemSchema = z.union([
  z.object({ q: z.string(), a: z.string() }),
  z
    .object({ question: z.string(), answer: z.string() })
    .transform(({ question, answer }) => ({ q: question, a: answer })),
  z
    .object({ q: z.string(), answer: z.string() })
    .transform(({ q, answer }) => ({ q, a: answer })),
  z
    .object({ question: z.string(), a: z.string() })
    .transform(({ question, a }) => ({ q: question, a })),
]);

const faqsSchema = z.array(faqItemSchema).default([]);

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

const expertQuotesSchema = z
  .array(
    z.object({
      quote: z.string(),
      personName: z.string(),
      jobTitle: z.string().optional(),
      organization: z.string().optional(),
    }),
  )
  .optional();

const definitionsSchema = z
  .array(z.object({ term: z.string(), definition: z.string() }))
  .default([]);

const baseContentSchema = z.object({
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
  faqs: faqsSchema,
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
  definitions: definitionsSchema,
  expertQuotes: expertQuotesSchema,
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
  expertQuotes: expertQuotesSchema,
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
  expertQuotes: expertQuotesSchema,
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
  expertQuotes: expertQuotesSchema,
});

export const guideSchema = baseContentSchema.extend({
  steps: z
    .array(z.object({ title: z.string(), content: z.string() }))
    .optional(),
  timeEstimate: z.string().optional(),
  difficulty: z.string().optional(),
  definitions: definitionsSchema,
  answers: answerSchema,
  proscons: prosConsSchema,
  expertQuotes: expertQuotesSchema,
  tableData: tableDataSchema,
  pricingStats: pricingStatSchema,
});

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
  definitions: definitionsSchema,
  statistics: z
    .array(
      z.object({
        stat: z.string(),
        source: z.string(),
        sourceUrl: z.string().optional(),
      }),
    )
    .default([]),
  buyerStage: z.enum(["tofu", "mofu", "bofu"]).default("tofu"),
  faqs: faqsSchema,
  schema: z
    .enum(["Article", "FAQPage", "HowTo", "Product", "ItemList"])
    .default("Article"),
});
