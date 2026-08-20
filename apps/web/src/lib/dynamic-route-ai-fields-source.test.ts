import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  {
    path: "src/pages/compare/alternatives/[slug].astro",
    fields: [
      "answers",
      "pricingStats",
      "tableData",
      "definitions",
      "proscons",
      "expertQuotes",
    ],
  },
  {
    path: "src/pages/compare/versus/[slug].astro",
    fields: [
      "answers",
      "statistics",
      "pricingStats",
      "tableData",
      "definitions",
      "proscons",
      "expertQuotes",
    ],
  },
  {
    path: "src/pages/compare/pricing/[slug].astro",
    fields: ["answers", "pricingStats", "tableData", "expertQuotes"],
  },
];

describe("dynamic AI-extractable route sources", () => {
  it("renders supported AI SEO fields instead of discarding them", () => {
    for (const route of ROUTES) {
      const source = readFileSync(resolve(route.path), "utf8");

      expect(source).toContain("AiSeoBlocks");
      expect(source).toContain("buildEditorialSchemaGraph");
      expect(source).toContain("publishedAt={publishedAt}");
      expect(source).toContain("updatedAt={updatedAt}");
      expect(source).toContain("noindex={seoProps.noindex}");
      expect(source).toContain('ogType="article"');
      expect(source).toContain("buyerStage={buyerStage}");
      expect(source).toContain("articleTags={tags}");
      expect(source).toContain("schemaGraph={schemaGraph}");
      expect(source).not.toContain("<SchemaMarkup graph={schemaGraph} />");

      for (const field of route.fields) {
        expect(source).not.toContain(`void ${field};`);
      }
    }
  });

  it("renders visible breadcrumbs without duplicating breadcrumb schema", () => {
    for (const route of ROUTES) {
      const source = readFileSync(resolve(route.path), "utf8");

      expect(source).toContain("BreadcrumbNav");
      expect(source).toContain("emitSchema={false}");
      expect(source.indexOf("<BreadcrumbNav")).toBeGreaterThanOrEqual(0);
      expect(source.indexOf("<BreadcrumbNav")).toBeLessThan(
        source.indexOf("<article"),
      );
    }
  });
});
