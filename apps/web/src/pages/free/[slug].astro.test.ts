import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./[slug].astro", import.meta.url)),
  "utf8",
);

describe("lead magnet page SEO", () => {
  it("passes article metadata and OG metadata into LandingLayout", () => {
    expect(source).toContain("publishedAt={data.publishedAt}");
    expect(source).toContain("updatedAt={data.updatedAt}");
    expect(source).toContain('ogType="article"');
    expect(source).toContain("ogImage={data.ogImage}");
    expect(source).toContain("articleTags={data.tags}");
    expect(source).toContain("noindex={seoProps.noindex}");
  });

  it("builds Article/FAQ schema and renders filtered related links", () => {
    expect(source).toContain("buildLeadMagnetSchemaGraph");
    expect(source).toContain("schemaGraph={schemaGraph}");
    expect(source).toContain("resolveIndexableRelatedPageLinks");
    expect(source).toContain("<RelatedPages");
  });

  it("keeps visual Q&A blocks out of standalone schema once FAQ graph is active", () => {
    expect(source).toContain("emitSchema={false}");
  });

  it("renders visible breadcrumbs without emitting a second breadcrumb schema", () => {
    expect(source).toContain("<BreadcrumbNav");
    expect(source).toContain("schemaGraph={schemaGraph}");
    expect(source).toContain("emitSchema={false}");
  });
});
