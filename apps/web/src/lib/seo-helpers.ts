import {
  buildArticleSchema,
  buildBreadcrumbSchema,
  buildFaqPageSchema,
} from "@kaiplan/marketing/lib/schema-builders";
import type { BreadcrumbItem } from "@kaiplan/marketing";

const DEFAULT_SITE_BASE = "https://kaiplan.app";

export function buildKaiplanArticleSchema(
  title: string,
  description: string,
  url: string,
  publishedAt: string,
  updatedAt: string,
  siteBase: string = DEFAULT_SITE_BASE,
): Record<string, unknown> {
  return buildArticleSchema({
    headline: title,
    description,
    datePublished: publishedAt,
    dateModified: updatedAt,
    mainEntityOfPage: url,
    publisher: {
      name: "Kaiplan",
      url: siteBase,
    },
  });
}

export function buildKaiplanBreadcrumbSchema(
  items: BreadcrumbItem[],
  siteBase: string = DEFAULT_SITE_BASE,
): Record<string, unknown> {
  return buildBreadcrumbSchema(items, siteBase);
}

export function buildKaiplanFaqSchema(
  faqs: { q: string; a: string }[],
): Record<string, unknown> | undefined {
  return buildFaqPageSchema(faqs);
}
