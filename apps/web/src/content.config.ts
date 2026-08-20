import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import {
  alternativeSchema,
  comparisonSchema,
  pricingBreakdownSchema,
  listicleSchema,
  guideSchema,
  leadMagnetSchema,
} from "./lib/content-schemas";

const alternatives = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/alternatives",
  }),
  schema: alternativeSchema,
});

const comparisons = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/comparisons",
  }),
  schema: comparisonSchema,
});

const pricingBreakdowns = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/pricing-breakdowns",
  }),
  schema: pricingBreakdownSchema,
});

const listicles = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/listicles",
  }),
  schema: listicleSchema,
});

const guides = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/guides",
  }),
  schema: guideSchema,
});

const leadMagnets = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/lead-magnets",
  }),
  schema: leadMagnetSchema,
});

export const collections = {
  alternatives,
  comparisons,
  "pricing-breakdowns": pricingBreakdowns,
  listicles,
  guides,
  "lead-magnets": leadMagnets,
};
