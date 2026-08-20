import { describe, expect, it } from "vitest";
import { siteConfig } from "../config/site";
import { buildEditorialSchemaGraph } from "./editorial-schema";

describe("buildEditorialSchemaGraph", () => {
  it("builds article and FAQ graph metadata for dynamic editorial pages", () => {
    const graph = buildEditorialSchemaGraph({
      title: "The Knot Alternative",
      description: "Compare wedding planning workflows.",
      publishedAt: "2026-03-01",
      updatedAt: "2026-04-01",
      canonicalPath: "/compare/alternatives/the-knot",
      config: siteConfig,
      answers: [{ q: "Is Kaiplan ad-free?", a: "Yes." }],
      faqs: [{ q: "Does Kaiplan replace spreadsheets?", a: "Yes." }],
    });

    const items = graph["@graph"] as Array<Record<string, unknown>>;
    const article = items.find((item) => item["@type"] === "Article");
    const faq = items.find((item) => item["@type"] === "FAQPage");

    expect(article).toMatchObject({
      headline: "The Knot Alternative",
      datePublished: "2026-03-01",
      dateModified: "2026-04-01",
      lastReviewed: "2026-04-01",
      mainEntityOfPage: {
        "@id": "https://kaiplan.app/compare/alternatives/the-knot/",
        "@type": "WebPage",
      },
    });
    expect(article?.author).toMatchObject({ name: "Angel Campa" });
    expect(article?.speakable).toMatchObject({
      cssSelector: [".bluf-block", ".faq-answer", ".answer-block-answer"],
    });
    expect(faq).toBeDefined();
  });

  it("omits FAQ schema when no FAQ or answer sources are present", () => {
    const graph = buildEditorialSchemaGraph({
      title: "Pricing Breakdown",
      description: "Compare pricing.",
      publishedAt: "2026-03-01",
      updatedAt: "2026-04-01",
      canonicalPath: "/compare/pricing/the-knot-pricing",
      config: siteConfig,
      ogImage: "/custom-og.png",
    });

    const items = graph["@graph"] as Array<Record<string, unknown>>;

    expect(items.some((item) => item["@type"] === "FAQPage")).toBe(false);
    expect(items.find((item) => item["@type"] === "Article")).toMatchObject({
      image: "https://kaiplan.app/custom-og.png",
    });
  });

  it("accepts question/answer shaped answer blocks for FAQ schema", () => {
    const graph = buildEditorialSchemaGraph({
      title: "Alternative Comparison",
      description: "Compare wedding planning tools.",
      publishedAt: "2026-03-01",
      updatedAt: "2026-04-01",
      canonicalPath: "/compare/versus/kaiplan-vs-spreadsheets",
      config: siteConfig,
      answers: [
        {
          question: "Can Kaiplan replace a spreadsheet?",
          answer: "Yes, it centralizes guest, budget, and task planning.",
        },
      ],
    });

    const items = graph["@graph"] as Array<Record<string, unknown>>;
    const faq = items.find((item) => item["@type"] === "FAQPage") as
      | Record<string, unknown>
      | undefined;
    const mainEntity = faq?.mainEntity as Array<Record<string, unknown>>;

    expect(mainEntity[0]).toMatchObject({
      name: "Can Kaiplan replace a spreadsheet?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, it centralizes guest, budget, and task planning.",
      },
    });
  });

  it("omits malformed answer blocks from FAQ schema", () => {
    const graph = buildEditorialSchemaGraph({
      title: "Alternative Comparison",
      description: "Compare wedding planning tools.",
      publishedAt: "2026-03-01",
      updatedAt: "2026-04-01",
      canonicalPath: "/compare/versus/kaiplan-vs-manual-planning",
      config: siteConfig,
      answers: [
        {},
        { question: "   ", answer: "Blank question should be skipped." },
        { question: "Missing answer?", answer: "" },
      ],
    });

    const items = graph["@graph"] as Array<Record<string, unknown>>;

    expect(items.some((item) => item["@type"] === "FAQPage")).toBe(false);
  });

  it("includes breadcrumb schema in the editorial graph when breadcrumbs are provided", () => {
    const graph = buildEditorialSchemaGraph({
      title: "Alternative Comparison",
      description: "Compare wedding planning tools.",
      publishedAt: "2026-03-01",
      updatedAt: "2026-04-01",
      canonicalPath: "/compare/versus/kaiplan-vs-manual-planning",
      config: siteConfig,
      breadcrumbs: [
        { label: "Home", href: "/" },
        { label: "Compare", href: "/compare/" },
        {
          label: "Kaiplan vs Manual Planning",
          href: "/compare/versus/kaiplan-vs-manual-planning/",
        },
      ],
    });

    const items = graph["@graph"] as Array<Record<string, unknown>>;
    const breadcrumb = items.find(
      (item) => item["@type"] === "BreadcrumbList",
    ) as Record<string, unknown> | undefined;

    expect(breadcrumb).toBeDefined();
    expect(breadcrumb?.itemListElement).toHaveLength(3);
  });
});
