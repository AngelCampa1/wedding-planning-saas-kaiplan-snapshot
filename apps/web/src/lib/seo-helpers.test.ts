import { describe, it, expect } from "vitest";
import {
  buildKaiplanArticleSchema,
  buildKaiplanBreadcrumbSchema,
  buildKaiplanFaqSchema,
} from "./seo-helpers";
import type { BreadcrumbItem } from "@kaiplan/marketing";

describe("buildKaiplanArticleSchema", () => {
  it("returns a valid Article schema with correct @context and @type", () => {
    const result = buildKaiplanArticleSchema(
      "Best Wedding Planning Software",
      "A guide to choosing wedding planning tools",
      "https://kaiplan.app/resources/guides/wedding-planning-software",
      "2026-01-01",
      "2026-03-15",
    );
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("Article");
  });

  it("includes the headline from title param", () => {
    const result = buildKaiplanArticleSchema(
      "My Article Title",
      "Some description",
      "https://kaiplan.app/path",
      "2026-01-01",
      "2026-01-01",
    );
    expect(result["headline"]).toBe("My Article Title");
  });

  it("includes the description", () => {
    const result = buildKaiplanArticleSchema(
      "Title",
      "Exact description here",
      "https://kaiplan.app/path",
      "2026-01-01",
      "2026-01-01",
    );
    expect(result["description"]).toBe("Exact description here");
  });

  it("includes datePublished", () => {
    const result = buildKaiplanArticleSchema(
      "Title",
      "Desc",
      "https://kaiplan.app/path",
      "2026-03-01",
      "2026-03-15",
    );
    expect(result["datePublished"]).toBe("2026-03-01");
  });

  it("includes dateModified", () => {
    const result = buildKaiplanArticleSchema(
      "Title",
      "Desc",
      "https://kaiplan.app/path",
      "2026-03-01",
      "2026-03-15",
    );
    expect(result["dateModified"]).toBe("2026-03-15");
  });

  it("includes a publisher with Kaiplan name", () => {
    const result = buildKaiplanArticleSchema(
      "Title",
      "Desc",
      "https://kaiplan.app/path",
      "2026-01-01",
      "2026-01-01",
    );
    const publisher = result["publisher"] as Record<string, unknown>;
    expect(publisher).toBeDefined();
    expect(typeof publisher["name"]).toBe("string");
    expect((publisher["name"] as string).toLowerCase()).toContain("kaiplan");
  });

  it("uses the default site base as publisher URL when siteBase is omitted", () => {
    const result = buildKaiplanArticleSchema(
      "Title",
      "Desc",
      "https://kaiplan.app/path",
      "2026-01-01",
      "2026-01-01",
    );
    const publisher = result["publisher"] as Record<string, unknown>;
    expect(publisher["url"]).toBe("https://kaiplan.app");
  });

  it("uses a custom siteBase as publisher URL when provided", () => {
    const result = buildKaiplanArticleSchema(
      "Title",
      "Desc",
      "https://example.com/path",
      "2026-01-01",
      "2026-01-01",
      "https://example.com",
    );
    const publisher = result["publisher"] as Record<string, unknown>;
    expect(publisher["url"]).toBe("https://example.com");
  });
});

describe("buildKaiplanBreadcrumbSchema", () => {
  const items: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Compare", href: "/compare" },
    { label: "Alternatives", href: "/compare/alternatives" },
    { label: "Zola Alternative", href: "" },
  ];

  it("returns a BreadcrumbList schema", () => {
    const result = buildKaiplanBreadcrumbSchema(items);
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("BreadcrumbList");
  });

  it("includes itemListElement for each breadcrumb", () => {
    const result = buildKaiplanBreadcrumbSchema(items);
    const list = result["itemListElement"] as Array<Record<string, unknown>>;
    expect(list).toHaveLength(4);
  });

  it("each list item has position, name, and item", () => {
    const result = buildKaiplanBreadcrumbSchema(items);
    const list = result["itemListElement"] as Array<Record<string, unknown>>;
    expect(list[0]["position"]).toBe(1);
    expect(list[0]["name"]).toBe("Home");
    expect(list[1]["position"]).toBe(2);
    expect(list[1]["name"]).toBe("Compare");
    expect(list[3]["name"]).toBe("Zola Alternative");
  });

  it("handles single-item breadcrumb", () => {
    const result = buildKaiplanBreadcrumbSchema([{ label: "Home", href: "/" }]);
    const list = result["itemListElement"] as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
    expect(list[0]["position"]).toBe(1);
  });

  it("handles empty breadcrumbs", () => {
    const result = buildKaiplanBreadcrumbSchema([]);
    const list = result["itemListElement"] as Array<Record<string, unknown>>;
    expect(list).toHaveLength(0);
  });

  it("uses a custom siteBase when provided", () => {
    const result = buildKaiplanBreadcrumbSchema(
      [{ label: "Home", href: "/" }],
      "https://example.com",
    );
    const list = result["itemListElement"] as Array<Record<string, unknown>>;
    expect(list).toHaveLength(1);
  });
});

describe("buildKaiplanFaqSchema", () => {
  const faqs = [
    { q: "What is Kaiplan?", a: "Kaiplan is a wedding planning tool." },
    { q: "How much does it cost?", a: "Starting at $49/month." },
  ];

  it("returns a FAQPage schema", () => {
    const result = buildKaiplanFaqSchema(faqs);
    expect(result?.["@context"]).toBe("https://schema.org");
    expect(result?.["@type"]).toBe("FAQPage");
  });

  it("includes mainEntity with all FAQ items", () => {
    const result = buildKaiplanFaqSchema(faqs);
    const entities = result?.["mainEntity"] as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(2);
  });

  it("each entity has Question type and name", () => {
    const result = buildKaiplanFaqSchema(faqs);
    const entities = result?.["mainEntity"] as Array<Record<string, unknown>>;
    expect(entities[0]["@type"]).toBe("Question");
    expect(entities[0]["name"]).toBe("What is Kaiplan?");
  });

  it("each entity has acceptedAnswer with text", () => {
    const result = buildKaiplanFaqSchema(faqs);
    const entities = result?.["mainEntity"] as Array<Record<string, unknown>>;
    const answer = entities[0]["acceptedAnswer"] as Record<string, unknown>;
    expect(answer["@type"]).toBe("Answer");
    expect(answer["text"]).toBe("Kaiplan is a wedding planning tool.");
  });

  it("handles empty FAQ list", () => {
    const result = buildKaiplanFaqSchema([]);
    expect(result).toBeUndefined();
  });

  it("handles single FAQ", () => {
    const result = buildKaiplanFaqSchema([{ q: "Q?", a: "A." }]);
    const entities = result?.["mainEntity"] as Array<Record<string, unknown>>;
    expect(entities).toHaveLength(1);
    expect(entities[0]["name"]).toBe("Q?");
  });
});
